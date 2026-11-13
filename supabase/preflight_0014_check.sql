-- ============================================================================
-- READ-ONLY PREFLIGHT CHECK FOR MIGRATION 20260014
-- Run against the database BEFORE applying idx_inventory_project_unit_ci.
-- This script is completely read-only. It performs NO writes, deletions or merges.
-- ============================================================================

-- Query 1: Detect blank or whitespace-only unit numbers
SELECT 
  id,
  project_id,
  unit_number,
  'BLANK_OR_WHITESPACE_ONLY' AS issue_type
FROM public.inventory_items
WHERE unit_number IS NULL OR trim(unit_number) = '';

-- Query 2: Detect case-insensitive and whitespace-normalized duplicates within the same project
SELECT 
  project_id,
  lower(trim(unit_number)) AS canonical_unit_number,
  count(*) AS conflict_count,
  array_agg(unit_number) AS raw_unit_numbers,
  array_agg(id) AS conflicting_record_ids,
  'CASE_OR_WHITESPACE_DUPLICATE' AS issue_type
FROM public.inventory_items
WHERE unit_number IS NOT NULL AND trim(unit_number) <> ''
GROUP BY project_id, lower(trim(unit_number))
HAVING count(*) > 1;
