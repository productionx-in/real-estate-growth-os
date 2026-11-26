-- 20260107_more_modules.sql — finer plan modules the RE by PX console switches per customer: Projects, Site visits,
-- Channel partners, Documents, Campaigns, WhatsApp inbox and Performance join the original five (20260047). A module
-- with no row stays ON, so nothing changes for anyone until staff switch something off. Visits, partners and
-- documents used to sit under "sales": workspaces that had sales off keep them off.
BEGIN;
ALTER TABLE public.org_module_entitlements DROP CONSTRAINT IF EXISTS org_module_entitlements_module_check;
ALTER TABLE public.org_module_entitlements ADD CONSTRAINT org_module_entitlements_module_check CHECK (module IN (
  'projects', 'inventory', 'sales', 'visits', 'partners', 'documents', 'campaigns', 'whatsapp', 'routing', 'integrations', 'analytics', 'performance'));

INSERT INTO public.org_module_entitlements (org_id, module, enabled, reason, updated_by, updated_at)
SELECT e.org_id, m.module, false, 'Split from Sales (was off)', e.updated_by, now()
FROM public.org_module_entitlements e
CROSS JOIN (VALUES ('visits'), ('partners'), ('documents')) AS m(module)
WHERE e.module = 'sales' AND e.enabled = false
ON CONFLICT (org_id, module) DO NOTHING;
COMMIT;
