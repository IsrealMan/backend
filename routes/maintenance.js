/**
 * GET /api/maintenance
 *
 * Returns PM events and the process signals recorded on the same machine.
 *
 * Query params:
 *   machine   machine name (e.g. "Coating Machine 1") — optional
 *   type      PM_TYPE_1 … PM_TYPE_5 — optional filter
 *   range     7d | 30d | 90d | all (default all)
 *   page      (default 1)
 *   limit     (default 25, max 100)
 *
 * Response:
 *   {
 *     events:  [ { pm_id, machine, event_type, started_at, delta_scheduled_days } ],
 *     signals: [ { signal_id, machine, name, value_num, unit, ts } ],
 *     total:   N   (total event count)
 *   }
 */

import { Router } from 'express';
import { query as pgQuery, isConnected as pgConnected } from '../db/pool.js';

const router = Router();

// ── Tier 2: Mock ─────────────────────────────────────────────
const MOCK_EVENTS = [
  { pm_id: 1, machine: 'Coating Machine 1', event_type: 'PM_TYPE_3', started_at: '2024-01-01T00:00:00Z', delta_scheduled_days: -6 },
  { pm_id: 2, machine: 'Coating Machine 1', event_type: 'PM_TYPE_1', started_at: '2024-01-01T00:00:00Z', delta_scheduled_days: -4 },
  { pm_id: 3, machine: 'Coating Machine 1', event_type: 'PM_TYPE_4', started_at: '2024-01-02T00:00:00Z', delta_scheduled_days:  4 },
];

const MOCK_SIGNALS = [
  { signal_id: 1, machine: 'Coating Machine 1', name: 'temperature', value_num: 172.37, unit: '°C',   ts: '2024-01-01T00:00:00Z' },
  { signal_id: 2, machine: 'Coating Machine 1', name: 'flow_speed',  value_num:  12.94, unit: 'L/min', ts: '2024-01-01T00:00:00Z' },
];

// ── Tier 1: PostgreSQL ────────────────────────────────────────
async function fromPostgres({ machine, type, days, page, limit }) {
  const offset = (page - 1) * limit;
  const eParams = [];
  const eWhere  = [];
  const push    = (arr, v) => { arr.push(v); return `$${arr.length}`; };

  if (machine) eWhere.push(`m.name = ${push(eParams, machine)}`);
  if (type)    eWhere.push(`me.event_type = ${push(eParams, type)}`);
  if (days)    eWhere.push(`me.started_at >= CURRENT_DATE - ${push(eParams, days)}::int`);

  const eWhereSql = eWhere.length ? 'WHERE ' + eWhere.join(' AND ') : '';

  const [eventsRes, countRes, signalsRes] = await Promise.all([
    // PM events
    pgQuery(`
      SELECT
        me.pm_id,
        m.name                    AS machine,
        me.event_type,
        me.started_at,
        me.ended_at,
        me.delta_scheduled_days,
        me.performed_by,
        me.notes
      FROM   maintenance_event me
      JOIN   machine m ON m.machine_id = me.machine_id
      ${eWhereSql}
      ORDER  BY me.started_at DESC
      LIMIT  ${push(eParams, limit)} OFFSET ${push(eParams, offset)}
    `, eParams),

    // Total event count (reuse filter params minus pagination)
    pgQuery(`
      SELECT COUNT(*)::int AS total
      FROM   maintenance_event me
      JOIN   machine m ON m.machine_id = me.machine_id
      ${eWhereSql}
    `, eParams.slice(0, eParams.length - 2)),

    // Signals for the same machine(s) and date window
    pgQuery(`
      SELECT
        ms.signal_id,
        m.name        AS machine,
        ms.name,
        ms.value_num,
        ms.unit,
        ms.ts
      FROM   machine_signal ms
      JOIN   machine m ON m.machine_id = ms.machine_id
      WHERE  (${machine ? `m.name = $1` : 'TRUE'})
        AND  (${days    ? `ms.ts >= CURRENT_DATE - $${machine ? 2 : 1}::int` : 'TRUE'})
      ORDER  BY ms.ts DESC
      LIMIT  500
    `, [
      ...(machine ? [machine] : []),
      ...(days    ? [days]    : []),
    ]),
  ]);

  return {
    events:  eventsRes.rows,
    signals: signalsRes.rows,
    total:   countRes.rows[0].total,
  };
}

// ── Route ────────────────────────────────────────────────────
router.get('/', async (req, res) => {
  const machine = req.query.machine || null;
  const type    = req.query.type    || null;
  const days    = req.query.range ? parseInt(req.query.range.replace(/\D/g, ''), 10) || null : null;
  const page    = Math.max(1, parseInt(req.query.page  ?? '1',  10));
  const limit   = Math.min(100, Math.max(1, parseInt(req.query.limit ?? '25', 10)));

  if (pgConnected()) {
    try {
      const data = await fromPostgres({ machine, type, days, page, limit });
      return res.json(data);
    } catch (err) {
      console.warn('[maintenance] PG failed, falling back:', err.message);
    }
  }

  const filteredEvents = MOCK_EVENTS
    .filter(e => !machine || e.machine === machine)
    .filter(e => !type    || e.event_type === type);

  const offset = (page - 1) * limit;
  res.json({
    events:  filteredEvents.slice(offset, offset + limit),
    signals: MOCK_SIGNALS,
    total:   filteredEvents.length,
  });
});

export default router;
