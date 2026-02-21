/**
 * GET /api/production-metrics?lineId=&range=7d|30d|90d
 *
 * 3-tier strategy:
 *   Tier 1 — PostgreSQL (predi_qc schema)
 *   Tier 2 — (skipped — time-series better suited to PG)
 *   Tier 3 — Mock (always available)
 *
 * ── PostgreSQL schema (create once) ──────────────────────────
 *
 * CREATE TABLE IF NOT EXISTS production_line (
 *   id        SERIAL PRIMARY KEY,
 *   line_id   TEXT NOT NULL UNIQUE,   -- e.g. 'line-1'
 *   name      TEXT NOT NULL
 * );
 *
 * CREATE TABLE IF NOT EXISTS production_reading (
 *   id           BIGSERIAL PRIMARY KEY,
 *   line_id      TEXT        NOT NULL REFERENCES production_line(line_id),
 *   downtime_h   NUMERIC     NOT NULL,   -- hours of downtime for the day
 *   rate_uph     NUMERIC     NOT NULL,   -- units per hour
 *   recorded_at  DATE        NOT NULL DEFAULT CURRENT_DATE
 * );
 * CREATE UNIQUE INDEX ON production_reading (line_id, recorded_at);
 *
 * ── Example SELECT ───────────────────────────────────────────
 *
 * SELECT
 *   TO_CHAR(recorded_at, 'Dy') AS day,
 *   downtime_h,
 *   rate_uph
 * FROM   production_reading
 * WHERE  line_id = $1
 *   AND  recorded_at >= CURRENT_DATE - ($2::int - 1)
 * ORDER  BY recorded_at;
 */

import { Router } from 'express';
import { query as pgQuery, isConnected as pgConnected } from '../db/pool.js';

const router = Router();

const DAYS = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];

// ── Helpers ──────────────────────────────────────────────────
function pct(current, prev) {
  if (!prev || prev === 0) return 0;
  return parseFloat(((current - prev) / Math.abs(prev) * 100).toFixed(1));
}

function buildWeeklyTrend(base, amplitude, floor = 0) {
  return DAYS.map(day => ({
    day,
    value: parseFloat(Math.max(floor, base + (Math.random() - 0.5) * amplitude).toFixed(1)),
  }));
}

// ── Tier 3: Mock ─────────────────────────────────────────────
function getMock() {
  const downtimeTrend   = buildWeeklyTrend(1.8, 2.4, 0);
  const rateTrend       = buildWeeklyTrend(108, 12, 60);

  const dtCurrent  = downtimeTrend[downtimeTrend.length - 1].value;
  const dtPrev     = downtimeTrend[downtimeTrend.length - 2].value;
  const rCurrent   = rateTrend[rateTrend.length - 1].value;
  const rPrev      = rateTrend[rateTrend.length - 2].value;

  return {
    downtime: {
      current:       dtCurrent,
      unit:          'hours',
      percentChange: pct(dtCurrent, dtPrev),
      trend:         downtimeTrend,
    },
    productionRate: {
      current:       rCurrent,
      unit:          'units/hour',
      percentChange: pct(rCurrent, rPrev),
      trend:         rateTrend,
    },
  };
}

// ── Tier 1: PostgreSQL ────────────────────────────────────────
async function fromPostgres(lineId = 'default', days = 7) {
  const { rows } = await pgQuery(`
    SELECT
      TO_CHAR(recorded_at, 'Dy') AS day,
      downtime_h::float           AS downtime,
      rate_uph::float             AS rate
    FROM   production_reading
    WHERE  line_id = $1
      AND  recorded_at >= CURRENT_DATE - ($2::int - 1)
    ORDER  BY recorded_at
  `, [lineId, days]);

  if (rows.length < 2) return null;

  const downtimeTrend   = rows.map(r => ({ day: r.day, value: r.downtime }));
  const rateTrend       = rows.map(r => ({ day: r.day, value: r.rate    }));

  const dtCurrent = downtimeTrend.at(-1).value;
  const dtPrev    = downtimeTrend.at(-2).value;
  const rCurrent  = rateTrend.at(-1).value;
  const rPrev     = rateTrend.at(-2).value;

  return {
    downtime: {
      current:       dtCurrent,
      unit:          'hours',
      percentChange: pct(dtCurrent, dtPrev),
      trend:         downtimeTrend,
    },
    productionRate: {
      current:       rCurrent,
      unit:          'units/hour',
      percentChange: pct(rCurrent, rPrev),
      trend:         rateTrend,
    },
  };
}

// ── Route ────────────────────────────────────────────────────
router.get('/', async (req, res) => {
  const lineId = req.query.lineId || 'default';
  const days   = Math.min(parseInt(req.query.range?.replace(/\D/g, ''), 10) || 7, 90);

  if (pgConnected()) {
    try {
      const data = await fromPostgres(lineId, days);
      if (data) return res.json(data);
    } catch (err) {
      console.warn('[production-metrics] PG failed, falling back:', err.message);
    }
  }

  res.json(getMock());
});

export default router;
