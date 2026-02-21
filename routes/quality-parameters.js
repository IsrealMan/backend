/**
 * GET /api/quality-parameters
 *
 * 3-tier strategy:
 *   Tier 1 — PostgreSQL  (quality_parameter table, PredAI_QA schema)
 *   Tier 2 — MongoDB     (QualityParameter collection)
 *   Tier 3 — Mock data   (always available)
 *
 * SQL (example — run once to create the table):
 *
 *   CREATE TABLE IF NOT EXISTS quality_parameter (
 *     id           SERIAL PRIMARY KEY,
 *     name         TEXT        NOT NULL,
 *     category     TEXT        NOT NULL,
 *     unit         TEXT        DEFAULT '',
 *     lsl          NUMERIC,
 *     usl          NUMERIC,
 *     lcl          NUMERIC,
 *     ucl          NUMERIC,
 *     target       NUMERIC,
 *     status       TEXT        DEFAULT 'In Control'
 *                  CHECK (status IN ('In Control', 'Warning', 'Out of Control')),
 *     last_updated TIMESTAMPTZ DEFAULT NOW(),
 *     active       BOOLEAN     DEFAULT TRUE
 *   );
 *
 * Example SELECT:
 *
 *   SELECT id, name, category, unit,
 *          lsl, usl, lcl, ucl, target,
 *          status, last_updated AS "lastUpdated"
 *   FROM   quality_parameter
 *   WHERE  active = TRUE
 *   ORDER  BY category, name;
 */

import { Router } from "express";
import mongoose from "mongoose";
import QualityParameter from "../models/QualityParameter.js";
import { query as pgQuery, isConnected as pgConnected } from "../db/pool.js";

const router = Router();

// ── Tier 3: mock ───────────────────────────────────────────────
const MOCK = [
  { id: "1",  name: "Tensile Strength",       category: "Mechanical",  unit: "MPa",  lsl: 400, usl: 600, lcl: 420, ucl: 580, target: 500, status: "In Control",    lastUpdated: new Date().toISOString() },
  { id: "2",  name: "Hardness (Rockwell)",    category: "Mechanical",  unit: "HRC",  lsl: 58,  usl: 64,  lcl: 59,  ucl: 63,  target: 61,  status: "In Control",    lastUpdated: new Date().toISOString() },
  { id: "3",  name: "Surface Roughness",      category: "Mechanical",  unit: "μm",   lsl: 0.2, usl: 1.6, lcl: 0.3, ucl: 1.4, target: 0.8, status: "Warning",       lastUpdated: new Date().toISOString() },
  { id: "4",  name: "Diameter Tolerance",     category: "Dimensional", unit: "mm",   lsl: 49.9,usl: 50.1,lcl: 49.92,ucl:50.08,target: 50,  status: "In Control",    lastUpdated: new Date().toISOString() },
  { id: "5",  name: "Length Tolerance",       category: "Dimensional", unit: "mm",   lsl: 99.8,usl: 100.2,lcl: 99.85,ucl:100.15,target:100, status: "In Control",   lastUpdated: new Date().toISOString() },
  { id: "6",  name: "Flatness",               category: "Dimensional", unit: "mm",   lsl: 0,   usl: 0.05,lcl: 0,   ucl: 0.04,target: 0.02,status: "Out of Control", lastUpdated: new Date().toISOString() },
  { id: "7",  name: "Chemical Purity",        category: "Chemical",    unit: "%",    lsl: 99.5,usl: 100, lcl: 99.6,ucl: 99.95,target: 99.8,status: "In Control",    lastUpdated: new Date().toISOString() },
  { id: "8",  name: "pH Level",               category: "Chemical",    unit: "pH",   lsl: 6.8, usl: 7.2, lcl: 6.9, ucl: 7.1, target: 7.0, status: "Warning",       lastUpdated: new Date().toISOString() },
  { id: "9",  name: "Moisture Content",       category: "Chemical",    unit: "%",    lsl: 0,   usl: 0.5, lcl: 0,   ucl: 0.4, target: 0.2, status: "In Control",    lastUpdated: new Date().toISOString() },
  { id: "10", name: "Temperature (Process)",  category: "Process",     unit: "°C",   lsl: 180, usl: 220, lcl: 185, ucl: 215, target: 200, status: "In Control",    lastUpdated: new Date().toISOString() },
  { id: "11", name: "Pressure (Chamber)",     category: "Process",     unit: "bar",  lsl: 2.8, usl: 3.2, lcl: 2.9, ucl: 3.1, target: 3.0, status: "Out of Control", lastUpdated: new Date().toISOString() },
  { id: "12", name: "Cycle Time",             category: "Process",     unit: "sec",  lsl: 28,  usl: 32,  lcl: 28.5,ucl: 31.5,target: 30,  status: "In Control",    lastUpdated: new Date().toISOString() },
  { id: "13", name: "Visual Defect Rate",     category: "Visual",      unit: "%",    lsl: 0,   usl: 0.5, lcl: 0,   ucl: 0.3, target: 0,   status: "Warning",       lastUpdated: new Date().toISOString() },
  { id: "14", name: "Color Deviation (ΔE)",   category: "Visual",      unit: "ΔE",   lsl: 0,   usl: 2.0, lcl: 0,   ucl: 1.5, target: 0,   status: "In Control",    lastUpdated: new Date().toISOString() },
];

// ── Tier 1: PostgreSQL ─────────────────────────────────────────
async function fromPostgres() {
  const { rows } = await pgQuery(`
    SELECT id::text,
           name,
           category,
           unit,
           lsl, usl, lcl, ucl, target,
           status,
           last_updated AS "lastUpdated"
    FROM   quality_parameter
    WHERE  active = TRUE
    ORDER  BY category, name
  `);
  return rows;
}

// ── Tier 2: MongoDB ────────────────────────────────────────────
async function fromMongo() {
  const docs = await QualityParameter.find({ active: true }).lean();
  return docs.map((d) => ({
    id:          d._id.toString(),
    name:        d.name,
    category:    d.category,
    unit:        d.unit,
    lsl:         d.lsl,
    usl:         d.usl,
    lcl:         d.lcl,
    ucl:         d.ucl,
    target:      d.target,
    status:      d.status,
    lastUpdated: d.lastUpdated,
  }));
}

// ── Route ──────────────────────────────────────────────────────
router.get("/", async (_req, res) => {
  if (pgConnected()) {
    try {
      const data = await fromPostgres();
      if (data.length > 0) return res.json(data);
    } catch (err) {
      console.warn("[quality-parameters] PG failed, falling back to Mongo:", err.message);
    }
  }

  if (mongoose.connection.readyState === 1) {
    try {
      const data = await fromMongo();
      if (data.length > 0) return res.json(data);
    } catch (err) {
      console.warn("[quality-parameters] Mongo failed, falling back to mock:", err.message);
    }
  }

  res.json(MOCK);
});

export default router;
