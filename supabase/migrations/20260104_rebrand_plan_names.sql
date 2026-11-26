-- 20260104_rebrand_plan_names.sql — the product is now RE by PX (by Production X). Rename the two catalogue plans
-- customers see on the billing page. Data only: codes, prices and subscriptions are unchanged.
BEGIN;
UPDATE public.subscription_plans SET name = 'RE by PX Leads' WHERE code = 'leads' AND name = 'REGrow Leads';
UPDATE public.subscription_plans SET name = 'RE for Agencies' WHERE code = 'agencies' AND name = 'REGrow for Agencies';
COMMIT;
