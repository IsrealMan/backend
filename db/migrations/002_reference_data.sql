-- ============================================================
-- Migration 002: Bootstrap reference rows
--
-- Inserts the lookup/dimension rows that must exist before
-- any production data can be loaded (FK chain requirements).
--
-- Run AFTER 001_schema_patch.sql:
--   psql $DATABASE_URL -f db/migrations/002_reference_data.sql
-- Safe to re-run (ON CONFLICT / NOT EXISTS guards).
-- ============================================================

SET search_path TO predi_qc;

-- ── 1) Machines ───────────────────────────────────────────────────────────────
-- UNIQUE constraint: (site_id, name)
-- site_id = 1 → Plant A (already exists)

-- Optical metrology tool used in CD measurement sessions
INSERT INTO machine (site_id, name, machine_type)
VALUES (1, 'Optical-01', 'optical_metrology')
ON CONFLICT (site_id, name) DO NOTHING;

-- Scanning electron microscope used in CD measurement sessions
INSERT INTO machine (site_id, name, machine_type)
VALUES (1, 'CD-SEM-02', 'sem')
ON CONFLICT (site_id, name) DO NOTHING;

-- Coating / process machine: source of Temperature_C and Flow_Speed PM signals
INSERT INTO machine (site_id, name, machine_type)
VALUES (1, 'Coating Machine 1', 'coating')
ON CONFLICT (site_id, name) DO NOTHING;


-- ── 2) QC Test Type ───────────────────────────────────────────────────────────
-- UNIQUE constraint: (code)
-- Covers CD width measurements from both optical and SEM tools.

INSERT INTO qc_test_type (code, name)
VALUES ('CD_METROLOGY', 'Critical Dimension Metrology')
ON CONFLICT (code) DO NOTHING;


-- ── 3) QC Checkpoint ──────────────────────────────────────────────────────────
-- UNIQUE constraint: (code)
-- Placed under the FINAL_QC process step (step_id resolved by code).

INSERT INTO qc_checkpoint (code, name, step_id)
SELECT 'CD_METROLOGY', 'CD Measurement', step_id
FROM   process_step
WHERE  code = 'FINAL_QC'
ON CONFLICT (code) DO NOTHING;
