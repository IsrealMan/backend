/**
 * GET /api/recommendations
 *
 * 3-tier data strategy:
 *   Tier 1 — PostgreSQL (predi_qc rule_instance + rule_definition)
 *             when DATABASE_URL is set; uses the SPC severity to rank.
 *   Tier 2 — MongoDB   (Recommendation collection + Alert collection)
 *             when Mongo is connected; uses the ranking engine.
 *   Tier 3 — Hardcoded mock
 *             always available as last resort.
 *
 * Severity mapping (predi_qc → response):
 *   severity = 3  →  "High Impact"
 *   severity = 2  →  "Medium Impact"
 *   severity = 1  →  "Low Impact"
 *
 * Query params (all optional):
 *   ?severity=critical|warning   filter by alert severity tier
 *   ?parameter=<name>            filter by parameter_name
 */

import { Router } from "express";
import mongoose from "mongoose";
import Alert from "../models/Alert.js";
import Recommendation from "../models/Recommendation.js";
import { query as pgQuery, isConnected as pgConnected } from "../db/pool.js";
import { validateQuery, recommendationsQuerySchema } from "../utils/validation.js";

const router = Router();

// ── Constants ─────────────────────────────────────────────────
const IMPACT_LABEL = { 3: "High Impact", 2: "Medium Impact", 1: "Low Impact" };

const IMPACT_RANK = { "High Impact": 0, "Medium Impact": 1, "Low Impact": 2 };

// ── Tier 3: hardcoded mock ────────────────────────────────────
const MOCK = [
  { id: 1, title: "Temperature Control Frequency", impact: "High Impact"   },
  { id: 2, title: "Calibration Procedure",         impact: "High Impact"   },
  { id: 3, title: "Material Feed Rate",            impact: "Medium Impact" },
  { id: 4, title: "Operator Training",             impact: "Medium Impact" },
  { id: 5, title: "Humidity Control",              impact: "Low Impact"    },
];

// ── Tier 1: PostgreSQL ────────────────────────────────────────
// Reads enabled rule_instances joined to their rule_definition.
// Groups by rule_definition so each recommendation appears once,
// ranked at its highest active severity.
async function fromPostgres(severity, parameter) {
  const conditions = ["ri.is_enabled = true"];
  const params     = [];

  // Map severity filter (critical→3, warning→1,2) to PG severity int
  if (severity === "critical") {
    conditions.push(`ri.severity = 3`);
  } else if (severity === "warning") {
    conditions.push(`ri.severity < 3`);
  }

  if (parameter) {
    params.push(parameter);
    conditions.push(`ri.parameter_name = $${params.length}`);
  }

  const where = conditions.join(" AND ");

  // One row per rule_definition, keeping the highest severity instance
  const { rows } = await pgQuery(`
    SELECT   rd.rule_def_id,
             rd.name             AS title,
             MAX(ri.severity)    AS severity,
             ARRAY_AGG(DISTINCT ri.parameter_name) AS related_parameters
    FROM     rule_instance   ri
    JOIN     rule_definition rd ON rd.rule_def_id = ri.rule_def_id
    WHERE    ${where}
    GROUP BY rd.rule_def_id, rd.name
    ORDER BY MAX(ri.severity) DESC, rd.name
  `, params);

  return rows.map((r, i) => ({
    id:     i + 1,
    title:  r.title,
    impact: IMPACT_LABEL[r.severity] ?? "Low Impact",
  }));
}

// ── Tier 2: MongoDB ranking engine ───────────────────────────
function rankMongo(recommendations, criticalParamNames) {
  return [...recommendations].sort((a, b) => {
    const impactDiff = IMPACT_RANK[a.impact] - IMPACT_RANK[b.impact];
    if (impactDiff !== 0) return impactDiff;

    const aHasCritical = a.relatedParameters.some((p) => criticalParamNames.has(p));
    const bHasCritical = b.relatedParameters.some((p) => criticalParamNames.has(p));
    if (aHasCritical !== bHasCritical) return aHasCritical ? -1 : 1;

    return a.sortOrder - b.sortOrder;
  });
}

async function fromMongo(severity, parameter) {
  const activeAlerts = await Alert.find({ active: true }).lean();

  const criticalParamNames = new Set(
    activeAlerts.filter((a) => a.severity === "critical").map((a) => a.name),
  );

  let recommendations = await Recommendation.find({ active: true }).lean();

  if (severity) {
    const paramNames = new Set(
      activeAlerts.filter((a) => a.severity === severity).map((a) => a.name),
    );
    recommendations = recommendations.filter((r) =>
      r.relatedParameters.some((p) => paramNames.has(p)),
    );
  }

  if (parameter) {
    recommendations = recommendations.filter((r) =>
      r.relatedParameters.includes(parameter),
    );
  }

  return rankMongo(recommendations, criticalParamNames).map((r, i) => ({
    id:     i + 1,
    title:  r.title,
    impact: r.impact,
  }));
}

// ── Route ─────────────────────────────────────────────────────
router.get("/", validateQuery(recommendationsQuerySchema), async (req, res) => {
  const { severity, parameter } = req.query;

  if (pgConnected()) {
    try {
      return res.json(await fromPostgres(severity, parameter));
    } catch (err) {
      console.warn("[recommendations] PG failed, falling back to Mongo:", err.message);
    }
  }

  if (mongoose.connection.readyState === 1) {
    try {
      return res.json(await fromMongo(severity, parameter));
    } catch (err) {
      console.warn("[recommendations] Mongo failed, falling back to mock:", err.message);
    }
  }

  res.json(MOCK);
});

export default router;
