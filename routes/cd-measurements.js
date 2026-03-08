/**
 * GET /api/cd-measurements
 *
 * Returns QC inspection sessions with their CD width readings.
 *
 * Query params:
 *   lotCode   exact lot_code filter (e.g. "LOT2025-W02-A-0001")
 *   tool      machine name filter (e.g. "Optical-01")
 *   inspector operator name filter
 *   range     7d | 30d | 90d | all (default all)
 *   page      (default 1)
 *   limit     (default 25, max 100)
 *
 * Response:
 *   {
 *     sessions: [
 *       {
 *         qc_id, lot_code, tool, inspector, inspected_at,
 *         overall_result, reading_count, avg_cd_nm,
 *         readings: [ { measure_number, value_nm } ]
 *       }
 *     ],
 *     total: N
 *   }
 */

import { Router } from 'express';
import { query as pgQuery, isConnected as pgConnected } from '../db/pool.js';

const router = Router();

// ── Tier 2: Mock ─────────────────────────────────────────────
const MOCK = {
  sessions: [
    {
      qc_id: 1, lot_code: 'LOT2025-W02-A-0001', tool: 'Optical-01',
      inspector: 'Noa', inspected_at: '2025-01-06T09:06:21Z',
      overall_result: 'PASS', reading_count: 5, avg_cd_nm: 64.58,
      readings: [
        { measure_number: 1, value_nm: 63.05 },
        { measure_number: 2, value_nm: 64.40 },
        { measure_number: 3, value_nm: 65.54 },
        { measure_number: 4, value_nm: 64.47 },
        { measure_number: 5, value_nm: 65.46 },
      ],
    },
    {
      qc_id: 2, lot_code: 'LOT2025-W02-A-0001', tool: 'CD-SEM-02',
      inspector: 'Alice', inspected_at: '2025-01-06T09:12:49Z',
      overall_result: 'PASS', reading_count: 4, avg_cd_nm: 65.52,
      readings: [
        { measure_number: 1, value_nm: 65.40 },
        { measure_number: 2, value_nm: 67.91 },
        { measure_number: 3, value_nm: 61.34 },
        { measure_number: 4, value_nm: 67.43 },
      ],
    },
  ],
  total: 2,
};

// ── Tier 1: PostgreSQL ────────────────────────────────────────
async function fromPostgres({ lotCode, tool, inspector, days, page, limit }) {
  const offset = (page - 1) * limit;
  const params = [];
  const where  = [`tr.parameter_name = 'cd_width_nm'`];
  const push   = v => { params.push(v); return `$${params.length}`; };

  if (lotCode)   where.push(`pl.lot_code = ${push(lotCode)}`);
  if (tool)      where.push(`m.name = ${push(tool)}`);
  if (inspector) where.push(`qi.inspector = ${push(inspector)}`);
  if (days)      where.push(`qi.inspected_at >= CURRENT_DATE - ${push(days)}::int`);

  const whereClause = 'WHERE ' + where.join(' AND ');

  const [sessionsRes, countRes] = await Promise.all([
    pgQuery(`
      SELECT
        qi.qc_id,
        pl.lot_code,
        m.name                                           AS tool,
        qi.inspector,
        qi.inspected_at,
        qi.overall_result,
        COUNT(tr.qc_test_id)::int                       AS reading_count,
        ROUND(AVG(tr.value_num)::numeric, 2)            AS avg_cd_nm,
        json_agg(
          json_build_object(
            'measure_number', (tr.evidence_json->>'measure_number')::int,
            'value_nm',       tr.value_num
          )
          ORDER BY (tr.evidence_json->>'measure_number')::int
        )                                               AS readings
      FROM   qc_inspection  qi
      JOIN   production_lot pl ON pl.lot_id       = qi.lot_id
      JOIN   machine        m  ON m.machine_id    = qi.machine_id
      JOIN   qc_test_result tr ON tr.qc_id        = qi.qc_id
      ${whereClause}
      GROUP  BY qi.qc_id, pl.lot_code, m.name, qi.inspector,
                qi.inspected_at, qi.overall_result
      ORDER  BY qi.inspected_at DESC
      LIMIT  ${push(limit)} OFFSET ${push(offset)}
    `, params),

    pgQuery(`
      SELECT COUNT(DISTINCT qi.qc_id)::int AS total
      FROM   qc_inspection  qi
      JOIN   production_lot pl ON pl.lot_id    = qi.lot_id
      JOIN   machine        m  ON m.machine_id = qi.machine_id
      JOIN   qc_test_result tr ON tr.qc_id     = qi.qc_id
      ${whereClause}
    `, params.slice(0, params.length - 2)),
  ]);

  return {
    sessions: sessionsRes.rows.map(r => ({
      ...r,
      avg_cd_nm: parseFloat(r.avg_cd_nm),
      readings:  typeof r.readings === 'string' ? JSON.parse(r.readings) : r.readings,
    })),
    total: countRes.rows[0].total,
  };
}

// ── Route ────────────────────────────────────────────────────
router.get('/', async (req, res) => {
  const lotCode   = req.query.lotCode   || null;
  const tool      = req.query.tool      || null;
  const inspector = req.query.inspector || null;
  const days      = req.query.range ? parseInt(req.query.range.replace(/\D/g, ''), 10) || null : null;
  const page      = Math.max(1, parseInt(req.query.page  ?? '1',  10));
  const limit     = Math.min(100, Math.max(1, parseInt(req.query.limit ?? '25', 10)));

  if (pgConnected()) {
    try {
      const data = await fromPostgres({ lotCode, tool, inspector, days, page, limit });
      return res.json(data);
    } catch (err) {
      console.warn('[cd-measurements] PG failed, falling back:', err.message);
    }
  }

  const filtered = MOCK.sessions
    .filter(s => !lotCode   || s.lot_code  === lotCode)
    .filter(s => !tool      || s.tool      === tool)
    .filter(s => !inspector || s.inspector === inspector);

  const offset = (page - 1) * limit;
  res.json({ sessions: filtered.slice(offset, offset + limit), total: filtered.length });
});

export default router;
