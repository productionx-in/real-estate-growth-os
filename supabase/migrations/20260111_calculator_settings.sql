-- 20260111_calculator_settings.sql — Settings → Calculators: the workspace's defaults for the sales calculators
-- (bank rate, tenure, down payment, income share for EMIs, GST, stamp duty, registration, and extra charges).
-- Read by anyone in the workspace through the server; saved by owners and admins (app/api/settings/workspace).
ALTER TABLE public.org_settings
  ADD COLUMN IF NOT EXISTS calculators JSONB NOT NULL DEFAULT '{}'::jsonb;
