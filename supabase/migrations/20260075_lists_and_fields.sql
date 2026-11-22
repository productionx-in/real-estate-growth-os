-- 20260075_lists_and_fields.sql
-- Settings → Fields on leads and Settings → Locations:
--   * org_settings.fields: the workspace's own fields on leads (definitions, checked by lib/settings/fields.ts).
--   * org_settings.lists: workspace lists, starting with the locations offered for a buyer's requirements.
--   * leads_all.custom_fields: each lead's values, keyed by field key. A JSON object, size-capped. The column is
--     added to the table and the live-leads view recreated (rule from 20260073).
--   * activity_type 'details_updated': recorded when someone changes those values on a lead.
-- Additive only.

ALTER TYPE public.activity_type ADD VALUE IF NOT EXISTS 'details_updated';

BEGIN;

ALTER TABLE public.org_settings
  ADD COLUMN IF NOT EXISTS lists  JSONB NOT NULL DEFAULT '{}'::jsonb CHECK (jsonb_typeof(lists) = 'object' AND pg_column_size(lists) < 32768),
  ADD COLUMN IF NOT EXISTS fields JSONB NOT NULL DEFAULT '{}'::jsonb CHECK (jsonb_typeof(fields) = 'object' AND pg_column_size(fields) < 65536);

ALTER TABLE public.leads_all
  ADD COLUMN IF NOT EXISTS custom_fields JSONB NOT NULL DEFAULT '{}'::jsonb
    CHECK (jsonb_typeof(custom_fields) = 'object' AND pg_column_size(custom_fields) < 16384);
CREATE OR REPLACE VIEW public.leads WITH (security_invoker = true) AS
  SELECT * FROM public.leads_all WHERE deleted_at IS NULL;

COMMIT;
