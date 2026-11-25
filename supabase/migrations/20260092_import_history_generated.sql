-- 20260092_import_history_generated.sql
-- "Add many units" (lib/inventory/quick-add.ts) records its batches in the import history like a spreadsheet import,
-- with file_type 'generated'. Widens one CHECK; no data is changed.
BEGIN;
ALTER TABLE public.inventory_import_history DROP CONSTRAINT IF EXISTS inventory_import_history_file_type_check;
ALTER TABLE public.inventory_import_history ADD CONSTRAINT inventory_import_history_file_type_check
  CHECK (file_type IN ('csv', 'xlsx', 'generated'));
COMMIT;
