-- 20260053_lead_requirements.sql
-- What a buyer is looking for, beyond the budget leads already record — so REGrow can suggest matching
-- units for a lead and interested buyers for a unit.
--   configurations: e.g. {2BHK,3BHK}      categories: project categories (apartments, plots, villas…)
--   locations: cities or localities         min/max area (sq ft)         facing: e.g. {East,North-East}
-- All optional with empty defaults: existing leads are unaffected. Edited through the API (authorizeLeadWork);
-- leads' existing RLS and grants apply unchanged.

BEGIN;

ALTER TABLE public.leads
  ADD COLUMN IF NOT EXISTS req_configurations TEXT[] NOT NULL DEFAULT '{}'
    CHECK (cardinality(req_configurations) <= 10),
  ADD COLUMN IF NOT EXISTS req_categories TEXT[] NOT NULL DEFAULT '{}'
    CHECK (cardinality(req_categories) <= 5 AND req_categories <@ ARRAY['apartments','plotted_developments','commercial_sale','villas_gated_communities','mixed_use']::TEXT[]),
  ADD COLUMN IF NOT EXISTS req_locations TEXT[] NOT NULL DEFAULT '{}'
    CHECK (cardinality(req_locations) <= 10),
  ADD COLUMN IF NOT EXISTS req_facing TEXT[] NOT NULL DEFAULT '{}'
    CHECK (cardinality(req_facing) <= 8),
  ADD COLUMN IF NOT EXISTS req_min_area NUMERIC CHECK (req_min_area IS NULL OR req_min_area >= 0),
  ADD COLUMN IF NOT EXISTS req_max_area NUMERIC CHECK (req_max_area IS NULL OR req_max_area >= 0),
  ADD COLUMN IF NOT EXISTS requirements_updated_at TIMESTAMPTZ;

-- Units are matched from the available stock of one organisation.
CREATE INDEX IF NOT EXISTS idx_inventory_items_org_status_price
  ON public.inventory_items (org_id, status, total_price);

COMMIT;
