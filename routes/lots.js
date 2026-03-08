/**
 * GET /api/lots
 *
 * Query params:
 *   page      (default 1)
 *   limit     (default 25, max 100)
 *   status    OPEN | DONE | ...
 *   search    partial match on lot_code
 *   range     7d | 30d | 90d | all (default all)
 *
 * Response:
 *   { lots: [...], total: N }
 */

import { Router } from 'express';
import { query as pgQuery, isConnected as pgConnected } from '../db/pool.js';

const router = Router();

// ── Tier 2: Mock ─────────────────────────────────────────────
const MOCK = [
  { lot_id: 1, lot_code: 'LOT2025-W02-A-0001', product: 'Coated Film 100', site: 'Plant A', started_at: '2025-01-06T09:00:00Z', ended_at: '2025-01-06T09:35:00Z', duration_min: 35, status: 'DONE' },
  { lot_id: 2, lot_code: 'LOT2025-W02-B-0002', product: 'Coated Film 100', site: 'Plant A', started_at: '2025-01-08T09:00:00Z', ended_at: '2025-01-08T09:35:00Z', duration_min: 35, status: 'DONE' },
  { lot_id: 3, lot_code: 'LOT2025-W02-C-0003', product: 'Coated Film 100', site: 'Plant A', started_at: '2025-01-10T09:00:00Z', ended_at: '2025-01-10T09:35:00Z', duration_min: 35, status: 'DONE' },
];

// ── Tier 1: PostgreSQL ────────────────────────────────────────
async function fromPostgres({ page, limit, status, search, days }) {
  const offset = (page - 1) * limit;
  const params = [];
  const where  = [];
  const push   = v => { params.push(v); return `$${params.length}`; };

  if (status) where.push(`pl.status = ${push(status)}`);
  if (search) where.push(`pl.lot_code ILIKE '%' || ${push(search)} || '%'`);
  if (days)   where.push(`pl.started_at >= CURRENT_DATE - ${push(days)}::int`);

  const whereClause = where.length ? 'WHERE ' + where.join(' AND ') : '';

  const [dataRes, countRes] = await Promise.all([
    pgQuery(`
      SELECT
        pl.lot_id,
        pl.lot_code,
        p.name                                                        AS product,
        s.name                                                        AS site,
        pl.started_at,
        pl.ended_at,
        ROUND(
          EXTRACT(EPOCH FROM (pl.ended_at - pl.started_at)) / 60
        )::int                                                        AS duration_min,
        pl.status
      FROM   production_lot pl
      JOIN   product p ON p.product_id = pl.product_id
      JOIN   site    s ON s.site_id    = pl.site_id
      ${whereClause}
      ORDER  BY pl.started_at DESC
      LIMIT  ${push(limit)} OFFSET ${push(offset)}
    `, params),

    pgQuery(`
      SELECT COUNT(*)::int AS total
      FROM   production_lot pl
      ${whereClause}
    `, params.slice(0, params.length - 2)),
  ]);

  return { lots: dataRes.rows, total: countRes.rows[0].total };
}

// ── Route ────────────────────────────────────────────────────
router.get('/', async (req, res) => {
  const page   = Math.max(1, parseInt(req.query.page  ?? '1',   10));
  const limit  = Math.min(100, Math.max(1, parseInt(req.query.limit ?? '25', 10)));
  const status = req.query.status || null;
  const search = req.query.search || null;
  const days   = req.query.range ? parseInt(req.query.range.replace(/\D/g, ''), 10) || null : null;

  if (pgConnected()) {
    try {
      const data = await fromPostgres({ page, limit, status, search, days });
      return res.json(data);
    } catch (err) {
      console.warn('[lots] PG failed, falling back:', err.message);
    }
  }

  const filtered = MOCK
    .filter(l => !status || l.status === status)
    .filter(l => !search || l.lot_code.includes(search));

  const offset = (page - 1) * limit;
  res.json({ lots: filtered.slice(offset, offset + limit), total: filtered.length });
});

export default router;
