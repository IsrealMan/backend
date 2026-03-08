/**
 * GET /api/production-metrics?range=7d|30d|90d
 *
 * Tier 1 — PostgreSQL (predi_qc schema)
 *   production_lot      → lot throughput per day (lots completed)
 *   maintenance_event   → downtime per day (sum of event durations)
 *
 * Tier 2 — Mock (always available)
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

// ── Tier 2: Mock ─────────────────────────────────────────────
function getMock() {
  const downtimeTrend = buildWeeklyTrend(1.8, 2.4, 0);
  const rateTrend     = buildWeeklyTrend(108, 12, 60);

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
      unit:          'lots/day',
      percentChange: pct(rCurrent, rPrev),
      trend:         rateTrend,
    },
  };
}

// ── Tier 1: PostgreSQL ────────────────────────────────────────
async function fromPostgres(days = 7) {
  const [lotsRes, downtimeRes] = await Promise.all([
    // Lots completed per calendar day
    pgQuery(`
      SELECT
        TO_CHAR(started_at, 'Dy')             AS day,
        COUNT(*)::int                          AS lot_count
      FROM   production_lot
      WHERE  started_at >= CURRENT_DATE - ($1::int - 1)
        AND  ended_at IS NOT NULL
      GROUP  BY started_at::date, TO_CHAR(started_at, 'Dy')
      ORDER  BY started_at::date
    `, [days]),

    // Maintenance downtime hours per calendar day
    pgQuery(`
      SELECT
        TO_CHAR(started_at, 'Dy')                                        AS day,
        ROUND(
          SUM(
            EXTRACT(EPOCH FROM (COALESCE(ended_at, NOW()) - started_at))
          ) / 3600, 2
        )::float                                                          AS downtime_h
      FROM   maintenance_event
      WHERE  started_at >= CURRENT_DATE - ($1::int - 1)
      GROUP  BY started_at::date, TO_CHAR(started_at, 'Dy')
      ORDER  BY started_at::date
    `, [days]),
  ]);

  if (lotsRes.rows.length < 2 && downtimeRes.rows.length < 2) return null;

  const rateTrend     = lotsRes.rows.map(r => ({ day: r.day, value: r.lot_count }));
  const downtimeTrend = downtimeRes.rows.map(r => ({ day: r.day, value: r.downtime_h }));

  const rCurrent  = rateTrend.at(-1)?.value     ?? 0;
  const rPrev     = rateTrend.at(-2)?.value     ?? 0;
  const dtCurrent = downtimeTrend.at(-1)?.value ?? 0;
  const dtPrev    = downtimeTrend.at(-2)?.value ?? 0;

  return {
    downtime: {
      current:       dtCurrent,
      unit:          'hours',
      percentChange: pct(dtCurrent, dtPrev),
      trend:         downtimeTrend,
    },
    productionRate: {
      current:       rCurrent,
      unit:          'lots/day',
      percentChange: pct(rCurrent, rPrev),
      trend:         rateTrend,
    },
  };
}

// ── Route ────────────────────────────────────────────────────
router.get('/', async (req, res) => {
  const days = Math.min(parseInt(req.query.range?.replace(/\D/g, ''), 10) || 7, 90);

  if (pgConnected()) {
    try {
      const data = await fromPostgres(days);
      if (data) return res.json(data);
    } catch (err) {
      console.warn('[production-metrics] PG failed, falling back:', err.message);
    }
  }

  res.json(getMock());
});

export default router;
