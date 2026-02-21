/**
 * GET /api/machine-health?machineId=&range=6h|12h|24h
 *
 * 3-tier strategy:
 *   Tier 1 — PostgreSQL (predi_qc schema)
 *   Tier 2 — MongoDB   (MachineReading collection, if available)
 *   Tier 3 — Mock      (always available)
 *
 * ── PostgreSQL schema (create once) ──────────────────────────────
 *
 * CREATE TABLE IF NOT EXISTS machine_parameter (
 *   id           SERIAL PRIMARY KEY,
 *   machine_id   TEXT    NOT NULL DEFAULT 'default',
 *   name         TEXT    NOT NULL,          -- e.g. 'Temperature'
 *   unit         TEXT    NOT NULL DEFAULT '',
 *   lsl          NUMERIC,                   -- lower spec limit
 *   usl          NUMERIC,                   -- upper spec limit
 *   lcl          NUMERIC,                   -- lower control limit
 *   ucl          NUMERIC                    -- upper control limit
 * );
 *
 * CREATE TABLE IF NOT EXISTS machine_reading (
 *   id             BIGSERIAL PRIMARY KEY,
 *   parameter_id   INT       NOT NULL REFERENCES machine_parameter(id),
 *   value          NUMERIC   NOT NULL,
 *   measured_at    TIMESTAMPTZ NOT NULL DEFAULT NOW()
 * );
 * CREATE INDEX ON machine_reading (parameter_id, measured_at DESC);
 *
 * ── Example SELECT ────────────────────────────────────────────────
 *
 * WITH recent AS (
 *   SELECT parameter_id,
 *          value,
 *          measured_at,
 *          ROW_NUMBER() OVER (PARTITION BY parameter_id ORDER BY measured_at DESC) AS rn
 *   FROM   machine_reading
 *   WHERE  measured_at > NOW() - INTERVAL '6 hours'
 * ),
 * latest AS (SELECT parameter_id, value AS current_value FROM recent WHERE rn = 1),
 * prev   AS (SELECT parameter_id, value AS prev_value    FROM recent WHERE rn = 2)
 * SELECT mp.id::text,
 *        mp.name AS parameter,
 *        mp.unit,
 *        mp.lsl, mp.usl,
 *        l.current_value AS "currentValue",
 *        ROUND(((l.current_value - p.prev_value) / NULLIF(p.prev_value, 0)) * 100, 2) AS "percentChange",
 *        json_agg(json_build_object('timestamp', r.measured_at, 'value', r.value)
 *                 ORDER BY r.measured_at) AS trend
 * FROM   machine_parameter mp
 * JOIN   latest l   ON l.parameter_id = mp.id
 * JOIN   prev   p   ON p.parameter_id = mp.id
 * JOIN   recent r   ON r.parameter_id = mp.id
 * WHERE  mp.machine_id = $1
 * GROUP  BY mp.id, mp.name, mp.unit, mp.lsl, mp.usl, l.current_value, p.prev_value;
 */

import { Router } from "express";
import mongoose from "mongoose";
import { query as pgQuery, isConnected as pgConnected } from "../db/pool.js";

const router = Router();

// ── Helpers ────────────────────────────────────────────────────
function pct(current, prev) {
  if (!prev || prev === 0) return 0;
  return parseFloat(((current - prev) / Math.abs(prev) * 100).toFixed(2));
}

function deriveStatus(value, lsl, usl, lcl, ucl) {
  if (value === null || value === undefined) return "normal";
  if (lsl !== null && value < lsl) return "critical";
  if (usl !== null && value > usl) return "critical";
  if (lcl !== null && value < lcl) return "warning";
  if (ucl !== null && value > ucl) return "warning";
  return "normal";
}

function buildTrend(hours = 6, baseValue, amplitude = 8) {
  const points = [];
  const now    = Date.now();
  const step   = (hours * 60 * 60 * 1000) / 12;   // 12 data points
  for (let i = 12; i >= 0; i--) {
    const t   = new Date(now - i * step);
    const val = parseFloat((baseValue + (Math.random() - 0.5) * amplitude).toFixed(1));
    points.push({ timestamp: t.toISOString(), value: val });
  }
  return points;
}

// ── Tier 3: mock ───────────────────────────────────────────────
function getMock(rangeH = 6) {
  return [
    {
      id: "1", parameter: "Temperature", unit: "°C",
      currentValue: 82, percentChange: 4.5,
      lsl: 50, usl: 95, lcl: 55, ucl: 90,
      status: "warning",
      trend: buildTrend(rangeH, 75, 10),
    },
    {
      id: "2", parameter: "Pressure", unit: "PSI",
      currentValue: 94, percentChange: -2.1,
      lsl: 75, usl: 105, lcl: 80, ucl: 100,
      status: "normal",
      trend: buildTrend(rangeH, 90, 8),
    },
    {
      id: "3", parameter: "Humidity", unit: "%",
      currentValue: 47, percentChange: -1.8,
      lsl: 35, usl: 62, lcl: 38, ucl: 58,
      status: "normal",
      trend: buildTrend(rangeH, 48, 5),
    },
  ];
}

// ── Tier 1: PostgreSQL ─────────────────────────────────────────
async function fromPostgres(machineId = "default", rangeH = 6) {
  const { rows } = await pgQuery(`
    WITH windowed AS (
      SELECT parameter_id, value, measured_at,
             ROW_NUMBER() OVER (PARTITION BY parameter_id ORDER BY measured_at DESC) AS rn
      FROM   machine_reading
      WHERE  measured_at > NOW() - ($2 || ' hours')::INTERVAL
    ),
    latest AS (SELECT parameter_id, value AS current_value FROM windowed WHERE rn = 1),
    prev   AS (SELECT parameter_id, value AS prev_value    FROM windowed WHERE rn = 2)
    SELECT  mp.id::text,
            mp.name          AS parameter,
            mp.unit,
            mp.lsl, mp.usl, mp.lcl, mp.ucl,
            l.current_value  AS "currentValue",
            ROUND(((l.current_value - p.prev_value) / NULLIF(ABS(p.prev_value), 0)) * 100, 2)
                             AS "percentChange",
            COALESCE(
              json_agg(json_build_object('timestamp', w.measured_at, 'value', w.value)
                       ORDER BY w.measured_at) FILTER (WHERE w.measured_at IS NOT NULL),
              '[]'
            )                AS trend
    FROM   machine_parameter mp
    JOIN   latest l  ON l.parameter_id = mp.id
    JOIN   prev   p  ON p.parameter_id = mp.id
    JOIN   windowed w ON w.parameter_id = mp.id
    WHERE  mp.machine_id = $1
    GROUP  BY mp.id, mp.name, mp.unit, mp.lsl, mp.usl, mp.lcl, mp.ucl,
              l.current_value, p.prev_value
    ORDER  BY mp.id
  `, [machineId, rangeH]);

  return rows.map(r => ({
    ...r,
    status: deriveStatus(r.currentValue, r.lsl, r.usl, r.lcl, r.ucl),
  }));
}

// ── Route ──────────────────────────────────────────────────────
router.get("/", async (req, res) => {
  const machineId = req.query.machineId || "default";
  const rangeH    = parseInt(req.query.range?.replace(/\D/g, ""), 10) || 6;

  if (pgConnected()) {
    try {
      const data = await fromPostgres(machineId, rangeH);
      if (data.length > 0) return res.json(data);
    } catch (err) {
      console.warn("[machine-health] PG failed, falling back:", err.message);
    }
  }

  // Mongo tier skipped (time-series data better suited to PG/TimescaleDB)
  res.json(getMock(rangeH));
});

export default router;
