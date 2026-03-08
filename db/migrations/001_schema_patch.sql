-- ============================================================
-- Migration 001: Schema patch — add delta_scheduled_days
--
-- Adds the missing column to maintenance_event so PM scheduling
-- drift is stored as a queryable integer, not buried in notes.
--
-- Run:
--   psql $DATABASE_URL -f db/migrations/001_schema_patch.sql
-- Safe to re-run (ADD COLUMN IF NOT EXISTS).
-- ============================================================

SET search_path TO predi_qc;

ALTER TABLE maintenance_event
  ADD COLUMN IF NOT EXISTS delta_scheduled_days INTEGER;

COMMENT ON COLUMN maintenance_event.delta_scheduled_days
  IS 'Days offset from the scheduled PM date. Negative = performed early, positive = performed late.';
