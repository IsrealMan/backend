/**
 * GET /api/machine-health?machineId=<name|id>&range=6h|12h|24h
 *
 * Tier 1 — PostgreSQL (predi_qc schema)
 *   machine_signal  → time-series readings (name, value_num, ts, unit)
 *   spec_limit      → lsl / usl per parameter
 *   baseline        → lcl / ucl per parameter
 *
 * Tier 2 — Mock (always available)
 *
 * machineId accepts either the machine name (e.g. "Optical-01")
 * or a numeric machine_id.
 */

import { Router } from "express";
import { query as pgQuery, isConnected as pgConnected } from "../db/pool.js";

const router = Router();

// ── Helpers ────────────────────────────────────────────────────
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
  const step   = (hours * 60 * 60 * 1000) / 12;
  for (let i = 12; i >= 0; i--) {
    const t   = new Date(now - i * step);
    const val = parseFloat((baseValue + (Math.random() - 0.5) * amplitude).toFixed(1));
    points.push({ timestamp: t.toISOString(), value: val });
  }
  return points;
}

// ── Tier 2: mock ───────────────────────────────────────────────
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
async function fromPostgres(machineIdParam = "default", rangeH = 6) {
  // Resolve machine_id from name or numeric id
  const isNumeric = /^\d+$/.test(String(machineIdParam));
  const machineRes = await pgQuery(
    isNumeric
      ? `SELECT machine_id FROM machine WHERE machine_id = $1`
      : `SELECT machine_id FROM machine WHERE name = $1`,
    [machineIdParam]
  );
  if (!machineRes.rows.length) return null;
  const machineId = machineRes.rows[0].machine_id;

  const { rows } = await pgQuery(`
    WITH signals AS (
      SELECT
        name,
        value_num,
        ts,
        unit,
        ROW_NUMBER() OVER (PARTITION BY name ORDER BY ts DESC) AS rn
      FROM machine_signal
      WHERE machine_id = $1
        AND ts >= NOW() - ($2 || ' hours')::INTERVAL
    ),
    latest AS (SELECT name, value_num AS current_value, unit FROM signals WHERE rn = 1),
    prev   AS (SELECT name, value_num AS prev_value           FROM signals WHERE rn = 2)
    SELECT
      l.name                                                        AS parameter,
      l.unit,
      l.current_value                                               AS "currentValue",
      ROUND(
        ((l.current_value - p.prev_value)
          / NULLIF(ABS(p.prev_value), 0)) * 100, 2
      )                                                             AS "percentChange",
      sl.lsl, sl.usl,
      b.lcl,  b.ucl,
      COALESCE(
        json_agg(
          json_build_object('timestamp', s.ts, 'value', s.value_num)
          ORDER BY s.ts
        ) FILTER (WHERE s.ts IS NOT NULL),
        '[]'::json
      )                                                             AS trend
    FROM   latest l
    JOIN   prev   p  ON p.name = l.name
    JOIN   signals s ON s.name = l.name
    LEFT JOIN spec_limit sl
           ON sl.parameter_name = l.name
          AND (sl.machine_id = $1 OR sl.machine_id IS NULL)
          AND sl.effective_to IS NULL
    LEFT JOIN baseline b
           ON b.parameter_name = l.name
          AND (b.machine_id = $1 OR b.machine_id IS NULL)
    GROUP BY l.name, l.unit, l.current_value, p.prev_value,
             sl.lsl, sl.usl, b.lcl, b.ucl
    ORDER BY l.name
  `, [machineId, rangeH]);

  if (!rows.length) return null;

  return rows.map((r, i) => ({
    id:             String(i + 1),
    parameter:      r.parameter,
    unit:           r.unit ?? "",
    currentValue:   parseFloat(r.currentValue),
    percentChange:  parseFloat(r.percentChange ?? 0),
    lsl:            r.lsl   != null ? parseFloat(r.lsl)  : null,
    usl:            r.usl   != null ? parseFloat(r.usl)  : null,
    lcl:            r.lcl   != null ? parseFloat(r.lcl)  : null,
    ucl:            r.ucl   != null ? parseFloat(r.ucl)  : null,
    status:         deriveStatus(r.currentValue, r.lsl, r.usl, r.lcl, r.ucl),
    trend:          typeof r.trend === "string" ? JSON.parse(r.trend) : r.trend,
  }));
}

// ── Route ──────────────────────────────────────────────────────
router.get("/", async (req, res) => {
  const machineId = req.query.machineId || "default";
  const rangeH    = parseInt(req.query.range?.replace(/\D/g, ""), 10) || 6;

  if (pgConnected()) {
    try {
      const data = await fromPostgres(machineId, rangeH);
      if (data && data.length > 0) return res.json(data);
    } catch (err) {
      console.warn("[machine-health] PG failed, falling back:", err.message);
    }
  }

  res.json(getMock(rangeH));
});

export default router;
