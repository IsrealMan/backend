-- ============================================================
-- SPC Analytics Seed — predi_qc schema
-- Run AFTER the main schema migration script.
-- Safe to re-run (ON CONFLICT / NOT EXISTS guards).
--
-- Usage:
--   psql $DATABASE_URL -f src/db/spcSeed.sql
-- ============================================================

SET search_path TO predi_qc;

-- ── 1) Rule Definitions ──────────────────────────────────────
-- Maps 1-to-1 with the Predixa recommendations engine titles.
-- code is the stable identifier; name is what the UI shows.
-- ─────────────────────────────────────────────────────────────
INSERT INTO rule_definition (code, name, description)
VALUES
  ('TEMP_CONTROL_FREQ',
   'Temperature Control Frequency',
   'Detects insufficient temperature regulation intervals; high process drift risk.'),

  ('CALIBRATION_PROC',
   'Calibration Procedure',
   'Flags pressure system and CD measurement device calibration gaps.'),

  ('MATERIAL_FEED_RATE',
   'Material Feed Rate',
   'Monitors material feed consistency; deviations cause downstream coating defects.'),

  ('OPERATOR_TRAINING',
   'Operator Training',
   'Identifies process signatures correlated with operator-induced variation.'),

  ('HUMIDITY_CONTROL',
   'Humidity Control',
   'Detects ambient humidity / coolant-flow deviations that affect coating adhesion.')
ON CONFLICT (code) DO UPDATE
  SET name        = EXCLUDED.name,
      description = EXCLUDED.description;


-- ── 2) Rule Instances ────────────────────────────────────────
-- severity:  3 = High Impact  →  critical alert
--            2 = Medium Impact →  warning
--            1 = Low Impact   →  warning (low priority)
--
-- parameter_name aligns with:
--   scope=SIGNAL  →  machine_signal.name
--   scope=QC      →  qc_test_result.parameter_name
-- ─────────────────────────────────────────────────────────────

-- TEMP_CONTROL_FREQ: SIGNAL / temperature  (severity 3 — High Impact)
INSERT INTO rule_instance
  (rule_def_id, scope, parameter_name, is_enabled, severity, config_json)
SELECT rd.rule_def_id, 'SIGNAL', 'temperature', true, 3,
       '{"window": 20, "sigma_threshold": 3.0}'::jsonb
FROM rule_definition rd
WHERE rd.code = 'TEMP_CONTROL_FREQ'
  AND NOT EXISTS (
    SELECT 1 FROM rule_instance ri
     WHERE ri.rule_def_id = rd.rule_def_id
       AND ri.scope = 'SIGNAL'
       AND ri.parameter_name = 'temperature'
  );

-- CALIBRATION_PROC: SIGNAL / pressure  (severity 3 — High Impact)
INSERT INTO rule_instance
  (rule_def_id, scope, parameter_name, is_enabled, severity, config_json)
SELECT rd.rule_def_id, 'SIGNAL', 'pressure', true, 3,
       '{"calibration_interval_days": 30}'::jsonb
FROM rule_definition rd
WHERE rd.code = 'CALIBRATION_PROC'
  AND NOT EXISTS (
    SELECT 1 FROM rule_instance ri
     WHERE ri.rule_def_id = rd.rule_def_id
       AND ri.scope = 'SIGNAL'
       AND ri.parameter_name = 'pressure'
  );

-- CALIBRATION_PROC: QC / cd_measurement  (severity 3 — High Impact)
INSERT INTO rule_instance
  (rule_def_id, scope, parameter_name, is_enabled, severity, config_json)
SELECT rd.rule_def_id, 'QC', 'cd_measurement', true, 3,
       '{"calibration_interval_days": 30}'::jsonb
FROM rule_definition rd
WHERE rd.code = 'CALIBRATION_PROC'
  AND NOT EXISTS (
    SELECT 1 FROM rule_instance ri
     WHERE ri.rule_def_id = rd.rule_def_id
       AND ri.scope = 'QC'
       AND ri.parameter_name = 'cd_measurement'
  );

-- MATERIAL_FEED_RATE: SIGNAL / feed_rate  (severity 2 — Medium Impact)
INSERT INTO rule_instance
  (rule_def_id, scope, parameter_name, is_enabled, severity, config_json)
SELECT rd.rule_def_id, 'SIGNAL', 'feed_rate', true, 2,
       '{"window": 10, "variance_threshold": 0.05}'::jsonb
FROM rule_definition rd
WHERE rd.code = 'MATERIAL_FEED_RATE'
  AND NOT EXISTS (
    SELECT 1 FROM rule_instance ri
     WHERE ri.rule_def_id = rd.rule_def_id
       AND ri.scope = 'SIGNAL'
       AND ri.parameter_name = 'feed_rate'
  );

-- OPERATOR_TRAINING: QC / temperature, pressure, feed_rate  (severity 2 — Medium Impact)
INSERT INTO rule_instance
  (rule_def_id, scope, parameter_name, is_enabled, severity, config_json)
SELECT rd.rule_def_id, 'QC', param, true, 2,
       '{"min_samples": 30, "drift_z_score": 2.5}'::jsonb
FROM rule_definition rd
CROSS JOIN (VALUES ('temperature'), ('pressure'), ('feed_rate')) AS t(param)
WHERE rd.code = 'OPERATOR_TRAINING'
  AND NOT EXISTS (
    SELECT 1 FROM rule_instance ri
     WHERE ri.rule_def_id = rd.rule_def_id
       AND ri.scope = 'QC'
       AND ri.parameter_name = t.param
  );

-- HUMIDITY_CONTROL: SIGNAL / humidity, coolant_flow  (severity 1 — Low Impact)
INSERT INTO rule_instance
  (rule_def_id, scope, parameter_name, is_enabled, severity, config_json)
SELECT rd.rule_def_id, 'SIGNAL', param, true, 1,
       '{"upper_limit_pct": 65, "lower_limit_pct": 30}'::jsonb
FROM rule_definition rd
CROSS JOIN (VALUES ('humidity'), ('coolant_flow')) AS t(param)
WHERE rd.code = 'HUMIDITY_CONTROL'
  AND NOT EXISTS (
    SELECT 1 FROM rule_instance ri
     WHERE ri.rule_def_id = rd.rule_def_id
       AND ri.scope = 'SIGNAL'
       AND ri.parameter_name = t.param
  );
