-- supabase/migrations/20260014_inventory_import_tracking_and_constraints.sql
-- Migration 0014: Add import tracking to inventory items and enforce case-insensitive uniqueness.

-- 1. Add import_reference_id to associate inventory records with import batches
ALTER TABLE public.inventory_items 
  ADD COLUMN IF NOT EXISTS import_reference_id text;

-- 2. Index for querying records created by a specific import job
CREATE INDEX IF NOT EXISTS idx_inventory_items_import_ref 
  ON public.inventory_items(import_reference_id);

-- 3. Case-insensitive unique constraint to prevent race conditions & duplicate unit numbers
CREATE UNIQUE INDEX IF NOT EXISTS idx_inventory_project_unit_ci 
  ON public.inventory_items (project_id, lower(trim(unit_number)));
