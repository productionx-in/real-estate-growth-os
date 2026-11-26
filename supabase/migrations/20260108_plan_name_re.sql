-- 20260108_plan_name_re.sql — the product is known simply as "RE" (by Production X). Data only.
BEGIN;
UPDATE public.subscription_plans SET name = 'RE Leads' WHERE code = 'leads' AND name = 'RE by PX Leads';
COMMIT;
