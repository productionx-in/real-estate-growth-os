-- 20260047_module_entitlements.sql
-- Per-customer module switches. Core (leads, projects, team, settings, audit log) is always on. A module with
-- no row is ON, so existing customers keep everything they have today; REGrow staff switch modules off per
-- customer from the console. Enforcement is on the server (every API route of the module checks it).
-- Lead capture (webhooks, form posts, OAuth callbacks) is never blocked by a switch, so no enquiry is lost.

BEGIN;

CREATE TABLE IF NOT EXISTS public.org_module_entitlements (
  org_id      UUID NOT NULL REFERENCES public.organisations(id) ON DELETE CASCADE,
  module      TEXT NOT NULL CHECK (module IN ('sales', 'inventory', 'routing', 'integrations', 'analytics')),
  enabled     BOOLEAN NOT NULL,
  reason      TEXT,
  updated_by  UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  updated_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (org_id, module)
);

CREATE OR REPLACE FUNCTION public.set_module_entitlement(p_org UUID, p_module TEXT, p_enabled BOOLEAN, p_reason TEXT,
                                                         p_actor UUID, p_label TEXT)
RETURNS JSONB LANGUAGE plpgsql SECURITY DEFINER SET search_path = pg_catalog, public, pg_temp AS $$
DECLARE v_was BOOLEAN;
BEGIN
  IF p_reason IS NULL OR char_length(trim(p_reason)) < 3 THEN
    RAISE EXCEPTION 'entitlement: a reason is required' USING ERRCODE = 'check_violation';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM public.organisations WHERE id = p_org) THEN
    RAISE EXCEPTION 'entitlement: organisation not found' USING ERRCODE = 'no_data_found';
  END IF;
  SELECT enabled INTO v_was FROM public.org_module_entitlements WHERE org_id = p_org AND module = p_module;
  v_was := coalesce(v_was, true);
  INSERT INTO public.org_module_entitlements (org_id, module, enabled, reason, updated_by, updated_at)
  VALUES (p_org, p_module, p_enabled, trim(p_reason), p_actor, now())
  ON CONFLICT (org_id, module) DO UPDATE
     SET enabled = EXCLUDED.enabled, reason = EXCLUDED.reason, updated_by = EXCLUDED.updated_by, updated_at = now();
  IF v_was IS DISTINCT FROM p_enabled THEN
    INSERT INTO public.org_audit_logs (org_id, actor_kind, actor_user_id, actor_label, action, target_type, target_id, metadata)
    VALUES (p_org, 'platform', p_actor, p_label, CASE WHEN p_enabled THEN 'module.enabled' ELSE 'module.disabled' END,
            'module', p_module, jsonb_build_object('module', p_module, 'reason', trim(p_reason)));
  END IF;
  RETURN jsonb_build_object('module', p_module, 'enabled', p_enabled, 'changed', v_was IS DISTINCT FROM p_enabled);
END;
$$;
REVOKE ALL ON FUNCTION public.set_module_entitlement(UUID, TEXT, BOOLEAN, TEXT, UUID, TEXT) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.set_module_entitlement(UUID, TEXT, BOOLEAN, TEXT, UUID, TEXT) TO service_role;

ALTER TABLE public.org_module_entitlements ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.org_module_entitlements FROM PUBLIC, anon, authenticated;
GRANT SELECT ON public.org_module_entitlements TO authenticated;
GRANT SELECT, INSERT, UPDATE ON public.org_module_entitlements TO service_role;
-- Members can see which modules their own workspace has.
DROP POLICY IF EXISTS org_modules_member_read ON public.org_module_entitlements;
CREATE POLICY org_modules_member_read ON public.org_module_entitlements FOR SELECT TO authenticated
  USING (public.auth_has_role_in_org(org_id, ARRAY['owner', 'admin', 'manager', 'sales_exec', 'readonly']));

COMMIT;
