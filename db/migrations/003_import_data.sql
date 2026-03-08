-- ============================================================
-- Migration 003: Import production data (3 datasets)
--
-- Run AFTER 001 and 002:
--   psql $DATABASE_URL -f db/migrations/003_import_data.sql
--
-- Wrapped in a single transaction — all three datasets load
-- atomically. Rolls back completely if anything fails.
-- Safe to re-run (ON CONFLICT / NOT EXISTS guards on every insert).
-- ============================================================

SET search_path TO predi_qc;

BEGIN;

-- ============================================================
-- DATASET 1: Production Lots → production_lot
--
-- lot_code  = the original string lot_id from the source file
-- site_id   = 1 (Plant A)
-- product_id = 1 (Coated Film 100)
-- duration_min is NOT stored — always derivable as:
--   EXTRACT(EPOCH FROM (ended_at - started_at)) / 60
-- ============================================================

INSERT INTO production_lot (site_id, product_id, lot_code, started_at, ended_at, status)
VALUES
  (1, 1, 'LOT2025-W02-A-0001', '2025-01-06 09:00:00+00', '2025-01-06 09:35:00+00', 'DONE'),
  (1, 1, 'LOT2025-W02-B-0002', '2025-01-08 09:00:00+00', '2025-01-08 09:35:00+00', 'DONE'),
  (1, 1, 'LOT2025-W02-C-0003', '2025-01-10 09:00:00+00', '2025-01-10 09:35:00+00', 'DONE'),
  (1, 1, 'LOT2025-W03-A-0004', '2025-01-13 09:00:00+00', '2025-01-13 09:35:00+00', 'DONE'),
  (1, 1, 'LOT2025-W03-B-0005', '2025-01-15 09:00:00+00', '2025-01-15 09:35:00+00', 'DONE'),
  (1, 1, 'LOT2025-W03-C-0006', '2025-01-17 09:00:00+00', '2025-01-17 09:35:00+00', 'DONE'),
  (1, 1, 'LOT2025-W04-A-0007', '2025-01-20 09:00:00+00', '2025-01-20 09:35:00+00', 'DONE'),
  (1, 1, 'LOT2025-W04-B-0008', '2025-01-22 09:00:00+00', '2025-01-22 09:35:00+00', 'DONE'),
  (1, 1, 'LOT2025-W04-C-0009', '2025-01-24 09:00:00+00', '2025-01-24 09:35:00+00', 'DONE')
ON CONFLICT (lot_code) DO NOTHING;


-- ============================================================
-- DATASET 2: PM Records → maintenance_event + machine_signal
--
-- Each source row splits into:
--   1 row in maintenance_event  (the PM event itself)
--   2 rows in machine_signal    (Temperature_C, Flow_Speed)
--
-- machine = 'Coating Machine 1' (the process machine these
--           signals belong to; resolved below by name).
--
-- Dedup guard on maintenance_event: (machine_id, started_at::date, event_type)
-- ============================================================

DO $$
DECLARE
  v_machine_id BIGINT;
BEGIN
  SELECT machine_id INTO v_machine_id
  FROM   machine
  WHERE  name = 'Coating Machine 1';

  -- ── PM Events ─────────────────────────────────────────────
  -- 2024-01-01
  INSERT INTO maintenance_event (machine_id, event_type, started_at, delta_scheduled_days)
  SELECT v_machine_id, 'PM_TYPE_3', '2024-01-01 00:00:00+00', -6
  WHERE NOT EXISTS (
    SELECT 1 FROM maintenance_event
    WHERE  machine_id = v_machine_id
      AND  started_at::date = '2024-01-01'
      AND  event_type = 'PM_TYPE_3'
  );

  INSERT INTO maintenance_event (machine_id, event_type, started_at, delta_scheduled_days)
  SELECT v_machine_id, 'PM_TYPE_1', '2024-01-01 00:00:00+00', -4
  WHERE NOT EXISTS (
    SELECT 1 FROM maintenance_event
    WHERE  machine_id = v_machine_id
      AND  started_at::date = '2024-01-01'
      AND  event_type = 'PM_TYPE_1'
  );

  INSERT INTO maintenance_event (machine_id, event_type, started_at, delta_scheduled_days)
  SELECT v_machine_id, 'PM_TYPE_5', '2024-01-01 00:00:00+00', -1
  WHERE NOT EXISTS (
    SELECT 1 FROM maintenance_event
    WHERE  machine_id = v_machine_id
      AND  started_at::date = '2024-01-01'
      AND  event_type = 'PM_TYPE_5'
  );

  INSERT INTO maintenance_event (machine_id, event_type, started_at, delta_scheduled_days)
  SELECT v_machine_id, 'PM_TYPE_2', '2024-01-01 00:00:00+00', -5
  WHERE NOT EXISTS (
    SELECT 1 FROM maintenance_event
    WHERE  machine_id = v_machine_id
      AND  started_at::date = '2024-01-01'
      AND  event_type = 'PM_TYPE_2'
  );

  INSERT INTO maintenance_event (machine_id, event_type, started_at, delta_scheduled_days)
  SELECT v_machine_id, 'PM_TYPE_4', '2024-01-01 00:00:00+00', 0
  WHERE NOT EXISTS (
    SELECT 1 FROM maintenance_event
    WHERE  machine_id = v_machine_id
      AND  started_at::date = '2024-01-01'
      AND  event_type = 'PM_TYPE_4'
  );

  -- 2024-01-02
  INSERT INTO maintenance_event (machine_id, event_type, started_at, delta_scheduled_days)
  SELECT v_machine_id, 'PM_TYPE_2', '2024-01-02 00:00:00+00', 1
  WHERE NOT EXISTS (
    SELECT 1 FROM maintenance_event
    WHERE  machine_id = v_machine_id
      AND  started_at::date = '2024-01-02'
      AND  event_type = 'PM_TYPE_2'
  );

  INSERT INTO maintenance_event (machine_id, event_type, started_at, delta_scheduled_days)
  SELECT v_machine_id, 'PM_TYPE_5', '2024-01-02 00:00:00+00', 0
  WHERE NOT EXISTS (
    SELECT 1 FROM maintenance_event
    WHERE  machine_id = v_machine_id
      AND  started_at::date = '2024-01-02'
      AND  event_type = 'PM_TYPE_5'
  );

  INSERT INTO maintenance_event (machine_id, event_type, started_at, delta_scheduled_days)
  SELECT v_machine_id, 'PM_TYPE_4', '2024-01-02 00:00:00+00', 4
  WHERE NOT EXISTS (
    SELECT 1 FROM maintenance_event
    WHERE  machine_id = v_machine_id
      AND  started_at::date = '2024-01-02'
      AND  event_type = 'PM_TYPE_4'
  );

  INSERT INTO maintenance_event (machine_id, event_type, started_at, delta_scheduled_days)
  SELECT v_machine_id, 'PM_TYPE_1', '2024-01-02 00:00:00+00', 5
  WHERE NOT EXISTS (
    SELECT 1 FROM maintenance_event
    WHERE  machine_id = v_machine_id
      AND  started_at::date = '2024-01-02'
      AND  event_type = 'PM_TYPE_1'
  );

  INSERT INTO maintenance_event (machine_id, event_type, started_at, delta_scheduled_days)
  SELECT v_machine_id, 'PM_TYPE_3', '2024-01-02 00:00:00+00', 0
  WHERE NOT EXISTS (
    SELECT 1 FROM maintenance_event
    WHERE  machine_id = v_machine_id
      AND  started_at::date = '2024-01-02'
      AND  event_type = 'PM_TYPE_3'
  );

  -- 2024-01-03
  INSERT INTO maintenance_event (machine_id, event_type, started_at, delta_scheduled_days)
  SELECT v_machine_id, 'PM_TYPE_4', '2024-01-03 00:00:00+00', -2
  WHERE NOT EXISTS (
    SELECT 1 FROM maintenance_event
    WHERE  machine_id = v_machine_id
      AND  started_at::date = '2024-01-03'
      AND  event_type = 'PM_TYPE_4'
  );

  -- ── Process Signals ───────────────────────────────────────
  -- Two signal rows per source row: temperature + flow_speed.
  -- machine_signal has no dedup unique constraint; guard by
  -- (machine_id, ts::date, name) to prevent double-imports.

  -- 2024-01-01 readings (5 PM events → 10 signal rows)
  INSERT INTO machine_signal (machine_id, ts, name, value_num, unit)
  SELECT v_machine_id, ts, sig_name, val, unit
  FROM (VALUES
    ('2024-01-01 00:00:00+00'::timestamptz, 'temperature', 172.37, '°C'),
    ('2024-01-01 00:00:00+00'::timestamptz, 'flow_speed',   12.94, 'L/min'),
    ('2024-01-01 00:00:00+00'::timestamptz, 'temperature', 181.11, '°C'),
    ('2024-01-01 00:00:00+00'::timestamptz, 'flow_speed',   13.30, 'L/min'),
    ('2024-01-01 00:00:00+00'::timestamptz, 'temperature', 170.40, '°C'),
    ('2024-01-01 00:00:00+00'::timestamptz, 'flow_speed',   14.97, 'L/min'),
    ('2024-01-01 00:00:00+00'::timestamptz, 'temperature', 175.92, '°C'),
    ('2024-01-01 00:00:00+00'::timestamptz, 'flow_speed',   13.82, 'L/min'),
    ('2024-01-01 00:00:00+00'::timestamptz, 'temperature', 176.26, '°C'),
    ('2024-01-01 00:00:00+00'::timestamptz, 'flow_speed',   11.99, 'L/min'),
    -- 2024-01-02 readings
    ('2024-01-02 00:00:00+00'::timestamptz, 'temperature', 169.62, '°C'),
    ('2024-01-02 00:00:00+00'::timestamptz, 'flow_speed',   13.02, 'L/min'),
    ('2024-01-02 00:00:00+00'::timestamptz, 'temperature', 173.53, '°C'),
    ('2024-01-02 00:00:00+00'::timestamptz, 'flow_speed',   12.19, 'L/min'),
    ('2024-01-02 00:00:00+00'::timestamptz, 'temperature', 175.07, '°C'),
    ('2024-01-02 00:00:00+00'::timestamptz, 'flow_speed',   13.76, 'L/min'),
    ('2024-01-02 00:00:00+00'::timestamptz, 'temperature', 178.07, '°C'),
    ('2024-01-02 00:00:00+00'::timestamptz, 'flow_speed',   13.42, 'L/min'),
    ('2024-01-02 00:00:00+00'::timestamptz, 'temperature', 178.39, '°C'),
    ('2024-01-02 00:00:00+00'::timestamptz, 'flow_speed',   14.44, 'L/min'),
    -- 2024-01-03 readings
    ('2024-01-03 00:00:00+00'::timestamptz, 'temperature', 180.84, '°C'),
    ('2024-01-03 00:00:00+00'::timestamptz, 'flow_speed',   12.01, 'L/min')
  ) AS src(ts, sig_name, val, unit)
  WHERE NOT EXISTS (
    SELECT 1 FROM machine_signal ms
    WHERE  ms.machine_id = v_machine_id
      AND  ms.ts = src.ts
      AND  ms.name = src.sig_name
      AND  ms.value_num = src.val
  );

END;
$$;


-- ============================================================
-- DATASET 3: CD Measurements → qc_inspection + qc_test_result
--
-- Grouping logic:
--   Each unique (inspected_at, lot_code, tool_id, operator)
--   combination → 1 row in qc_inspection.
--
--   Each individual CD reading → 1 row in qc_test_result
--   linked to its parent qc_inspection via qc_id.
--
-- measure_number is stored in evidence_json since qc_test_result
-- has no dedicated column for it.
--
-- overall_result defaults to 'PASS' — update via spec_limit
-- once control limits are defined in the spec_limit table.
-- ============================================================

DO $$
DECLARE
  v_lot_id      BIGINT;
  v_optical_id  BIGINT;
  v_sem_id      BIGINT;
  v_cp_id       BIGINT;
  v_tt_id       BIGINT;
  v_qc_id       BIGINT;
BEGIN
  -- Resolve all reference IDs once
  SELECT lot_id      INTO v_lot_id     FROM production_lot WHERE lot_code    = 'LOT2025-W02-A-0001';
  SELECT machine_id  INTO v_optical_id FROM machine         WHERE name        = 'Optical-01';
  SELECT machine_id  INTO v_sem_id     FROM machine         WHERE name        = 'CD-SEM-02';
  SELECT checkpoint_id INTO v_cp_id    FROM qc_checkpoint   WHERE code        = 'CD_METROLOGY';
  SELECT test_type_id  INTO v_tt_id    FROM qc_test_type    WHERE code        = 'CD_METROLOGY';

  -- ── Session 1: Optical-01 / Noa / 2025-01-06 09:06:21 ────
  IF NOT EXISTS (
    SELECT 1 FROM qc_inspection
    WHERE  lot_id      = v_lot_id
      AND  machine_id  = v_optical_id
      AND  inspected_at = '2025-01-06 09:06:21+00'
      AND  inspector   = 'Noa'
  ) THEN
    INSERT INTO qc_inspection
      (lot_id, checkpoint_id, machine_id, inspected_at, inspector, overall_result)
    VALUES
      (v_lot_id, v_cp_id, v_optical_id, '2025-01-06 09:06:21+00', 'Noa', 'PASS')
    RETURNING qc_id INTO v_qc_id;

    INSERT INTO qc_test_result (qc_id, test_type_id, parameter_name, value_num, unit, evidence_json)
    VALUES
      (v_qc_id, v_tt_id, 'cd_width_nm', 63.05, 'nm', '{"measure_number": 1}'),
      (v_qc_id, v_tt_id, 'cd_width_nm', 64.40, 'nm', '{"measure_number": 2}'),
      (v_qc_id, v_tt_id, 'cd_width_nm', 65.54, 'nm', '{"measure_number": 3}'),
      (v_qc_id, v_tt_id, 'cd_width_nm', 64.47, 'nm', '{"measure_number": 4}'),
      (v_qc_id, v_tt_id, 'cd_width_nm', 65.46, 'nm', '{"measure_number": 5}');
  END IF;

  -- ── Session 2: CD-SEM-02 / Alice / 2025-01-06 09:12:49 ───
  IF NOT EXISTS (
    SELECT 1 FROM qc_inspection
    WHERE  lot_id      = v_lot_id
      AND  machine_id  = v_sem_id
      AND  inspected_at = '2025-01-06 09:12:49+00'
      AND  inspector   = 'Alice'
  ) THEN
    INSERT INTO qc_inspection
      (lot_id, checkpoint_id, machine_id, inspected_at, inspector, overall_result)
    VALUES
      (v_lot_id, v_cp_id, v_sem_id, '2025-01-06 09:12:49+00', 'Alice', 'PASS')
    RETURNING qc_id INTO v_qc_id;

    INSERT INTO qc_test_result (qc_id, test_type_id, parameter_name, value_num, unit, evidence_json)
    VALUES
      (v_qc_id, v_tt_id, 'cd_width_nm', 65.40, 'nm', '{"measure_number": 1}'),
      (v_qc_id, v_tt_id, 'cd_width_nm', 67.91, 'nm', '{"measure_number": 2}'),
      (v_qc_id, v_tt_id, 'cd_width_nm', 61.34, 'nm', '{"measure_number": 3}'),
      (v_qc_id, v_tt_id, 'cd_width_nm', 67.43, 'nm', '{"measure_number": 4}');
  END IF;

END;
$$;

COMMIT;
