/**
 * Rules Management — /api/rules
 *
 * Maps to predi_qc schema tables (search_path=predi_qc):
 *
 * ── rule_definition ──────────────────────────────────────────
 * CREATE TABLE IF NOT EXISTS rule_definition (
 *   rule_def_id  SERIAL PRIMARY KEY,
 *   code         TEXT   NOT NULL UNIQUE,
 *   name         TEXT   NOT NULL,
 *   description  TEXT
 * );
 *
 * ── rule_instance ────────────────────────────────────────────
 * CREATE TABLE IF NOT EXISTS rule_instance (
 *   rule_instance_id  SERIAL  PRIMARY KEY,
 *   rule_def_id       INT     NOT NULL REFERENCES rule_definition(rule_def_id) ON DELETE CASCADE,
 *   scope             TEXT    NOT NULL CHECK (scope IN ('SIGNAL','QC')),
 *   parameter_name    TEXT    NOT NULL,
 *   is_enabled        BOOLEAN NOT NULL DEFAULT TRUE,
 *   severity          INT     NOT NULL CHECK (severity BETWEEN 1 AND 3),
 *   config_json       JSONB   NOT NULL DEFAULT '{}'
 * );
 * CREATE INDEX ON rule_instance (rule_def_id);
 * CREATE INDEX ON rule_instance (is_enabled);
 *
 * UI ↔ DB column mapping:
 *   Rule Name        → rule_definition.name
 *   Rule Code        → rule_definition.code       (readonly after create)
 *   Description      → rule_definition.description(readonly after create)
 *   Scope            → rule_instance.scope         SIGNAL | QC
 *   Parameter Name   → rule_instance.parameter_name
 *   Severity         → rule_instance.severity      1=Low 2=Medium 3=High
 *   Config JSON      → rule_instance.config_json   (jsonb object)
 *   Enabled          → rule_instance.is_enabled
 *
 * Endpoints:
 *   GET    /api/rules              → paginated list
 *   GET    /api/rules/definitions  → list rule_definitions (for select in form)
 *   GET    /api/rules/:id          → single rule_instance
 *   POST   /api/rules              → create instance (+ optional new definition)
 *   PUT    /api/rules/:id          → update instance fields
 *   PATCH  /api/rules/:id/toggle   → flip is_enabled
 *   DELETE /api/rules/:id          → hard delete
 */

import { Router } from 'express';
import { z } from 'zod';
import { query as pgQuery, isConnected as pgConnected } from '../db/pool.js';
import { authenticate, authorize } from '../middleware/auth.js';
import { validate } from '../utils/validation.js';

const router = Router();

// ── Validation schemas ────────────────────────────────────────
const ruleBodySchema = z.object({
  // Rule definition — provide rule_def_id (existing) or name+code+description (new)
  rule_def_id:   z.number().int().positive().optional(),
  name:          z.string().min(2).max(120).optional(),
  code:          z.string().min(2).max(60).regex(/^[A-Z0-9_]+$/, 'Code must be UPPERCASE_SNAKE_CASE').optional(),
  description:   z.string().max(500).optional(),
  // Rule instance fields
  scope:         z.enum(['SIGNAL', 'QC']),
  parameter_name:z.string().min(1).max(100),
  severity:      z.number().int().min(1).max(3),
  is_enabled:    z.boolean().optional().default(true),
  config_json:   z.record(z.unknown()).optional().default({}),
}).refine(d => d.rule_def_id || (d.name && d.code), {
  message: 'Provide rule_def_id or both name and code to create a new definition',
});

const ruleUpdateSchema = z.object({
  scope:         z.enum(['SIGNAL', 'QC']).optional(),
  parameter_name:z.string().min(1).max(100).optional(),
  severity:      z.number().int().min(1).max(3).optional(),
  is_enabled:    z.boolean().optional(),
  config_json:   z.record(z.unknown()).optional(),
});

// ── Severity helpers ──────────────────────────────────────────
const SEV_LABEL = { 3: 'High Impact', 2: 'Medium Impact', 1: 'Low Impact' };
const SEV_COLOR = { 3: 'critical',    2: 'warning',       1: 'info'       };

function shape(row) {
  return {
    ...row,
    severityLabel: SEV_LABEL[row.severity] ?? 'Low Impact',
    severityColor: SEV_COLOR[row.severity] ?? 'info',
  };
}

// ── Mock store (no DB) ────────────────────────────────────────
const mockDefs = [
  { rule_def_id: 1, code: 'TEMP_CONTROL_FREQ',  name: 'Temperature Control Frequency', description: 'Detects insufficient temperature regulation intervals; high process drift risk.' },
  { rule_def_id: 2, code: 'CALIBRATION_PROC',   name: 'Calibration Procedure',         description: 'Flags pressure system and CD measurement device calibration gaps.' },
  { rule_def_id: 3, code: 'MATERIAL_FEED_RATE', name: 'Material Feed Rate',            description: 'Monitors material feed consistency; deviations cause downstream coating defects.' },
  { rule_def_id: 4, code: 'OPERATOR_TRAINING',  name: 'Operator Training',             description: 'Identifies process signatures correlated with operator-induced variation.' },
  { rule_def_id: 5, code: 'HUMIDITY_CONTROL',   name: 'Humidity Control',              description: 'Detects ambient humidity / coolant-flow deviations that affect coating adhesion.' },
];

let mockInstances = [
  { rule_instance_id: 1, rule_def_id: 1, scope: 'SIGNAL', parameter_name: 'temperature',  is_enabled: true,  severity: 3, config_json: { window: 20, sigma_threshold: 3.0 } },
  { rule_instance_id: 2, rule_def_id: 2, scope: 'SIGNAL', parameter_name: 'pressure',     is_enabled: true,  severity: 3, config_json: { calibration_interval_days: 30 } },
  { rule_instance_id: 3, rule_def_id: 2, scope: 'QC',     parameter_name: 'cd_measurement',is_enabled: true, severity: 3, config_json: { calibration_interval_days: 30 } },
  { rule_instance_id: 4, rule_def_id: 3, scope: 'SIGNAL', parameter_name: 'feed_rate',    is_enabled: true,  severity: 2, config_json: { deviation_pct: 5 } },
  { rule_instance_id: 5, rule_def_id: 4, scope: 'QC',     parameter_name: 'temperature',  is_enabled: true,  severity: 2, config_json: {} },
  { rule_instance_id: 6, rule_def_id: 4, scope: 'QC',     parameter_name: 'pressure',     is_enabled: true,  severity: 2, config_json: {} },
  { rule_instance_id: 7, rule_def_id: 4, scope: 'QC',     parameter_name: 'feed_rate',    is_enabled: true,  severity: 2, config_json: {} },
  { rule_instance_id: 8, rule_def_id: 5, scope: 'SIGNAL', parameter_name: 'humidity',     is_enabled: true,  severity: 1, config_json: { max_deviation_pct: 10 } },
  { rule_instance_id: 9, rule_def_id: 5, scope: 'SIGNAL', parameter_name: 'coolant_flow', is_enabled: false, severity: 1, config_json: { max_deviation_pct: 10 } },
];

let mockIdSeq = 100;

function mockJoin(inst) {
  const def = mockDefs.find(d => d.rule_def_id === inst.rule_def_id) ?? {};
  return shape({ ...inst, name: def.name ?? '', code: def.code ?? '', description: def.description ?? '' });
}

function applyMockFilters(list, { search, scope, severity, enabled }) {
  return list.filter(r => {
    if (search && !r.name?.toLowerCase().includes(search.toLowerCase()) &&
                  !r.parameter_name?.toLowerCase().includes(search.toLowerCase())) return false;
    if (scope    && r.scope !== scope) return false;
    if (severity != null && r.severity !== severity) return false;
    if (enabled  != null && r.is_enabled !== enabled) return false;
    return true;
  });
}

// ── JOIN SQL ──────────────────────────────────────────────────
const JOIN_SQL = `
  SELECT ri.rule_instance_id,
         rd.rule_def_id,
         rd.name,
         rd.code,
         rd.description,
         ri.scope,
         ri.parameter_name,
         ri.is_enabled,
         ri.severity,
         ri.config_json
  FROM   rule_instance   ri
  JOIN   rule_definition rd ON rd.rule_def_id = ri.rule_def_id
`;

// ── GET /api/rules/definitions ───────────────────────────────
router.get('/definitions', authenticate, async (req, res) => {
  if (pgConnected()) {
    try {
      const { rows } = await pgQuery('SELECT rule_def_id, code, name, description FROM rule_definition ORDER BY name');
      return res.json({ definitions: rows });
    } catch (err) {
      console.warn('[rules] PG definitions failed:', err.message);
    }
  }
  res.json({ definitions: mockDefs });
});

// ── GET /api/rules ───────────────────────────────────────────
router.get('/', authenticate, async (req, res) => {
  const search   = req.query.search   || null;
  const scope    = req.query.scope    || null;
  const severity = req.query.severity ? parseInt(req.query.severity, 10) : null;
  const enabled  = req.query.enabled  != null ? req.query.enabled === 'true' : null;
  const page     = Math.max(1, parseInt(req.query.page  ?? '1',  10));
  const limit    = Math.min(100, Math.max(1, parseInt(req.query.limit ?? '25', 10)));
  const offset   = (page - 1) * limit;
  const sort     = ['name', 'severity', 'scope', 'parameter_name'].includes(req.query.sort) ? req.query.sort : 'severity';
  const dir      = req.query.dir === 'asc' ? 'ASC' : 'DESC';

  if (pgConnected()) {
    try {
      const params  = [];
      const where   = [];
      const push    = v => { params.push(v); return `$${params.length}`; };

      if (search)   where.push(`(rd.name ILIKE '%' || ${push(search)} || '%' OR ri.parameter_name ILIKE '%' || ${push(search)} || '%')`);
      if (scope)    where.push(`ri.scope = ${push(scope)}`);
      if (severity != null) where.push(`ri.severity = ${push(severity)}`);
      if (enabled  != null) where.push(`ri.is_enabled = ${push(enabled)}`);

      const whereClause = where.length ? 'WHERE ' + where.join(' AND ') : '';
      const sortCol = sort === 'name' ? 'rd.name' : `ri.${sort}`;

      const [dataRes, countRes] = await Promise.all([
        pgQuery(`${JOIN_SQL} ${whereClause} ORDER BY ${sortCol} ${dir} LIMIT ${push(limit)} OFFSET ${push(offset)}`, params),
        pgQuery(`SELECT COUNT(*) FROM rule_instance ri JOIN rule_definition rd ON rd.rule_def_id = ri.rule_def_id ${whereClause}`, params.slice(0, params.length - 2)),
      ]);

      return res.json({ rules: dataRes.rows.map(shape), total: parseInt(countRes.rows[0].count, 10) });
    } catch (err) {
      console.warn('[rules] PG list failed:', err.message);
    }
  }

  const joined  = mockInstances.map(mockJoin);
  const filtered = applyMockFilters(joined, { search, scope, severity, enabled });
  const sorted   = [...filtered].sort((a, b) => {
    const av = a[sort === 'name' ? 'name' : sort];
    const bv = b[sort === 'name' ? 'name' : sort];
    return dir === 'ASC' ? (av > bv ? 1 : -1) : (av < bv ? 1 : -1);
  });

  res.json({ rules: sorted.slice(offset, offset + limit), total: filtered.length });
});

// ── GET /api/rules/:id ───────────────────────────────────────
router.get('/:id', authenticate, async (req, res) => {
  const id = parseInt(req.params.id, 10);
  if (isNaN(id)) return res.status(400).json({ error: 'Invalid id' });

  if (pgConnected()) {
    try {
      const { rows } = await pgQuery(`${JOIN_SQL} WHERE ri.rule_instance_id = $1`, [id]);
      if (!rows.length) return res.status(404).json({ error: 'Rule not found' });
      return res.json({ rule: shape(rows[0]) });
    } catch (err) {
      console.warn('[rules] PG get failed:', err.message);
    }
  }

  const inst = mockInstances.find(r => r.rule_instance_id === id);
  if (!inst) return res.status(404).json({ error: 'Rule not found' });
  res.json({ rule: mockJoin(inst) });
});

// ── POST /api/rules ──────────────────────────────────────────
router.post('/', authenticate, authorize('admin'), validate(ruleBodySchema), async (req, res) => {
  const { rule_def_id, name, code, description, scope, parameter_name, severity, is_enabled, config_json } = req.body;

  if (pgConnected()) {
    try {
      let defId = rule_def_id;

      if (!defId) {
        // Upsert definition
        const defRes = await pgQuery(`
          INSERT INTO rule_definition (code, name, description)
          VALUES ($1, $2, $3)
          ON CONFLICT (code) DO UPDATE SET name = EXCLUDED.name, description = EXCLUDED.description
          RETURNING rule_def_id
        `, [code, name, description ?? '']);
        defId = defRes.rows[0].rule_def_id;
      }

      const instRes = await pgQuery(`
        INSERT INTO rule_instance (rule_def_id, scope, parameter_name, is_enabled, severity, config_json)
        VALUES ($1, $2, $3, $4, $5, $6)
        RETURNING rule_instance_id
      `, [defId, scope, parameter_name, is_enabled ?? true, severity, JSON.stringify(config_json ?? {})]);

      const { rows } = await pgQuery(`${JOIN_SQL} WHERE ri.rule_instance_id = $1`, [instRes.rows[0].rule_instance_id]);
      return res.status(201).json({ rule: shape(rows[0]) });
    } catch (err) {
      if (err.code === '23505') return res.status(409).json({ error: 'Rule code already exists' });
      console.error('[rules] PG create failed:', err.message);
      return res.status(500).json({ error: 'Failed to create rule' });
    }
  }

  // Mock create
  let defId = rule_def_id;
  if (!defId) {
    const existing = mockDefs.find(d => d.code === code);
    if (existing) {
      defId = existing.rule_def_id;
    } else {
      const newDef = { rule_def_id: mockIdSeq++, code, name, description: description ?? '' };
      mockDefs.push(newDef);
      defId = newDef.rule_def_id;
    }
  }

  const inst = { rule_instance_id: mockIdSeq++, rule_def_id: defId, scope, parameter_name, is_enabled: is_enabled ?? true, severity, config_json: config_json ?? {} };
  mockInstances.push(inst);
  res.status(201).json({ rule: mockJoin(inst) });
});

// ── PUT /api/rules/:id ────────────────────────────────────────
router.put('/:id', authenticate, authorize('admin'), validate(ruleUpdateSchema), async (req, res) => {
  const id = parseInt(req.params.id, 10);
  if (isNaN(id)) return res.status(400).json({ error: 'Invalid id' });

  const { scope, parameter_name, severity, is_enabled, config_json } = req.body;

  if (pgConnected()) {
    try {
      const sets   = [];
      const params = [];
      const push   = v => { params.push(v); return `$${params.length}`; };

      if (scope          !== undefined) sets.push(`scope = ${push(scope)}`);
      if (parameter_name !== undefined) sets.push(`parameter_name = ${push(parameter_name)}`);
      if (severity       !== undefined) sets.push(`severity = ${push(severity)}`);
      if (is_enabled     !== undefined) sets.push(`is_enabled = ${push(is_enabled)}`);
      if (config_json    !== undefined) sets.push(`config_json = ${push(JSON.stringify(config_json))}`);

      if (!sets.length) return res.status(400).json({ error: 'No fields to update' });

      params.push(id);
      const { rowCount } = await pgQuery(
        `UPDATE rule_instance SET ${sets.join(', ')} WHERE rule_instance_id = $${params.length}`,
        params,
      );
      if (!rowCount) return res.status(404).json({ error: 'Rule not found' });

      const { rows } = await pgQuery(`${JOIN_SQL} WHERE ri.rule_instance_id = $1`, [id]);
      return res.json({ rule: shape(rows[0]) });
    } catch (err) {
      console.error('[rules] PG update failed:', err.message);
      return res.status(500).json({ error: 'Failed to update rule' });
    }
  }

  const inst = mockInstances.find(r => r.rule_instance_id === id);
  if (!inst) return res.status(404).json({ error: 'Rule not found' });

  if (scope          !== undefined) inst.scope          = scope;
  if (parameter_name !== undefined) inst.parameter_name = parameter_name;
  if (severity       !== undefined) inst.severity       = severity;
  if (is_enabled     !== undefined) inst.is_enabled     = is_enabled;
  if (config_json    !== undefined) inst.config_json    = config_json;

  res.json({ rule: mockJoin(inst) });
});

// ── PATCH /api/rules/:id/toggle ──────────────────────────────
router.patch('/:id/toggle', authenticate, authorize('admin'), async (req, res) => {
  const id = parseInt(req.params.id, 10);
  if (isNaN(id)) return res.status(400).json({ error: 'Invalid id' });

  if (pgConnected()) {
    try {
      const { rows, rowCount } = await pgQuery(
        `UPDATE rule_instance SET is_enabled = NOT is_enabled WHERE rule_instance_id = $1 RETURNING is_enabled`,
        [id],
      );
      if (!rowCount) return res.status(404).json({ error: 'Rule not found' });
      return res.json({ is_enabled: rows[0].is_enabled });
    } catch (err) {
      console.error('[rules] PG toggle failed:', err.message);
      return res.status(500).json({ error: 'Failed to toggle rule' });
    }
  }

  const inst = mockInstances.find(r => r.rule_instance_id === id);
  if (!inst) return res.status(404).json({ error: 'Rule not found' });
  inst.is_enabled = !inst.is_enabled;
  res.json({ is_enabled: inst.is_enabled });
});

// ── DELETE /api/rules/:id ────────────────────────────────────
router.delete('/:id', authenticate, authorize('admin'), async (req, res) => {
  const id = parseInt(req.params.id, 10);
  if (isNaN(id)) return res.status(400).json({ error: 'Invalid id' });

  if (pgConnected()) {
    try {
      const { rowCount } = await pgQuery('DELETE FROM rule_instance WHERE rule_instance_id = $1', [id]);
      if (!rowCount) return res.status(404).json({ error: 'Rule not found' });
      return res.json({ ok: true });
    } catch (err) {
      console.error('[rules] PG delete failed:', err.message);
      return res.status(500).json({ error: 'Failed to delete rule' });
    }
  }

  const idx = mockInstances.findIndex(r => r.rule_instance_id === id);
  if (idx === -1) return res.status(404).json({ error: 'Rule not found' });
  mockInstances.splice(idx, 1);
  res.json({ ok: true });
});

export default router;
