/**
 * GET /api/overview
 *
 * 3-tier data strategy:
 *   Tier 1 — PostgreSQL (predi_qc.alert)  when DATABASE_URL is set
 *   Tier 2 — MongoDB   (Alert collection) when Mongo is connected
 *   Tier 3 — Hardcoded mock              always available as last resort
 *
 * Severity mapping (predi_qc → response):
 *   rule_instance.severity = 3  →  critical
 *   rule_instance.severity = 1 or 2  →  warning
 */

import { Router } from "express";
import mongoose from "mongoose";
import Alert from "../models/Alert.js";
import { query as pgQuery, isConnected as pgConnected } from "../db/pool.js";

const router = Router();

// ── Tier 3: hardcoded mock ────────────────────────────────────
const MOCK = {
  criticalAlerts: {
    count: 3,
    subtitle: "Requires immediate attention",
    affectedParameters: [
      { id: 1, name: "Temperature Control", checked: false },
      { id: 2, name: "Pressure System",     checked: false },
      { id: 3, name: "CD's",                checked: false },
    ],
  },
  warnings: {
    count: 3,
    subtitle: "Monitoring required",
    affectedParameters: [
      { id: 1, name: "Coolant Flow",   checked: false },
      { id: 2, name: "Humidity Level", checked: false },
      { id: 3, name: "Material Feed",  checked: false },
    ],
  },
};

// ── Tier 1: PostgreSQL ────────────────────────────────────────
// Joins alert → rule_detection → rule_instance to resolve
// the affected parameter_name and severity for each open alert.
async function fromPostgres() {
  const { rows } = await pgQuery(`
    SELECT DISTINCT ON (ri.parameter_name)
           ri.parameter_name AS name,
           ri.severity,
           a.message
    FROM   alert            a
    JOIN   rule_detection   rd ON rd.detection_id     = a.detection_id
    JOIN   rule_instance    ri ON ri.rule_instance_id = rd.rule_instance_id
    WHERE  a.status = 'OPEN'
    ORDER  BY ri.parameter_name, a.created_at DESC
  `);

  const critical = rows.filter((r) => r.severity === 3);
  const warning  = rows.filter((r) => r.severity < 3);

  return {
    criticalAlerts: {
      count:    critical.length,
      subtitle: "Requires immediate attention",
      affectedParameters: critical.map((r, i) => ({
        id: i + 1, name: r.name, checked: false,
      })),
    },
    warnings: {
      count:    warning.length,
      subtitle: "Monitoring required",
      affectedParameters: warning.map((r, i) => ({
        id: i + 1, name: r.name, checked: false,
      })),
    },
  };
}

// ── Tier 2: MongoDB ───────────────────────────────────────────
async function fromMongo() {
  const alerts   = await Alert.find({ active: true }).lean();
  const critical = alerts.filter((a) => a.severity === "critical");
  const warning  = alerts.filter((a) => a.severity === "warning");

  return {
    criticalAlerts: {
      count:    critical.length,
      subtitle: "Requires immediate attention",
      affectedParameters: critical.map((a, i) => ({
        id: i + 1, name: a.name, checked: false,
      })),
    },
    warnings: {
      count:    warning.length,
      subtitle: "Monitoring required",
      affectedParameters: warning.map((a, i) => ({
        id: i + 1, name: a.name, checked: false,
      })),
    },
  };
}

// ── Route ─────────────────────────────────────────────────────
router.get("/", async (_req, res) => {
  if (pgConnected()) {
    try {
      return res.json(await fromPostgres());
    } catch (err) {
      console.warn("[overview] PG failed, falling back to Mongo:", err.message);
    }
  }

  if (mongoose.connection.readyState === 1) {
    try {
      return res.json(await fromMongo());
    } catch (err) {
      console.warn("[overview] Mongo failed, falling back to mock:", err.message);
    }
  }

  res.json(MOCK);
});

export default router;
