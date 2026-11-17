-- 20260046_support_access_grants.sql
-- Support access: the only way REGrow staff see a customer's business data.
--
--   1. A support agent (or super admin) REQUESTS access to one organisation, with a reason and a duration
--      (15 minutes – 24 hours). Nothing is visible yet.
--   2. An active OWNER or ADMIN of that organisation APPROVES or DENIES it. Approval starts the clock.
--   3. In an emergency a SUPER ADMIN may approve without the customer, with a written reason, for at most
--      60 minutes. The customer sees it in their audit log and can revoke it.
--   4. Either side can REVOKE at any time. Access ends at expires_at without any job running.
--   Access is read-only and there is no impersonation: support never acts as a customer user.
--   Every step is written to the customer's audit log (org_audit_logs, actor_kind 'support' / 'member').
--
-- All state changes go through SECURITY DEFINER functions callable by the service role only; the API checks
-- who the caller is (platform role + MFA, or customer owner/admin) before calling them.

BEGIN;

CREATE TABLE IF NOT EXISTS public.support_access_grants (
  id                   UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id               UUID NOT NULL REFERENCES public.organisations(id) ON DELETE CASCADE,
  requested_by         UUID NOT NULL REFERENCES auth.users(id) ON DELETE RESTRICT,
  requested_by_label   TEXT NOT NULL,
  reason               TEXT NOT NULL CHECK (char_length(trim(reason)) BETWEEN 10 AND 1000),
  access_level         TEXT NOT NULL DEFAULT 'read_only' CHECK (access_level = 'read_only'),
  duration_minutes     INTEGER NOT NULL CHECK (duration_minutes BETWEEN 15 AND 1440),
  status               TEXT NOT NULL DEFAULT 'pending'
                         CHECK (status IN ('pending', 'approved', 'denied', 'revoked', 'cancelled')),
  emergency            BOOLEAN NOT NULL DEFAULT false,
  decided_by_profile   UUID REFERENCES public.profiles(id) ON DELETE SET NULL,
  decided_by_user      UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  decided_at           TIMESTAMPTZ,
  decision_note        TEXT,
  expires_at           TIMESTAMPTZ,
  revoked_at           TIMESTAMPTZ,
  revoked_by_user      UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at           TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT support_grant_approved_has_expiry CHECK (status <> 'approved' OR expires_at IS NOT NULL),
  CONSTRAINT support_grant_emergency_cap CHECK (NOT emergency OR duration_minutes <= 60)
);
CREATE INDEX IF NOT EXISTS idx_support_grants_org ON public.support_access_grants (org_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_support_grants_active ON public.support_access_grants (org_id, requested_by, expires_at)
  WHERE status = 'approved';
-- One open request per person per organisation.
CREATE UNIQUE INDEX IF NOT EXISTS uq_support_grants_one_pending ON public.support_access_grants (org_id, requested_by)
  WHERE status = 'pending';

-- Grants change state only through the functions below; history is never deleted except with the organisation.
CREATE OR REPLACE FUNCTION public.guard_support_grant_update()
RETURNS TRIGGER LANGUAGE plpgsql SET search_path = pg_catalog, public, pg_temp AS $$
BEGIN
  IF OLD.status IN ('denied', 'revoked', 'cancelled') THEN
    RAISE EXCEPTION 'support grant: % grants are final', OLD.status USING ERRCODE = 'check_violation';
  END IF;
  IF NEW.org_id <> OLD.org_id OR NEW.requested_by <> OLD.requested_by OR NEW.reason <> OLD.reason
     OR NEW.created_at <> OLD.created_at THEN
    RAISE EXCEPTION 'support grant: request details cannot be changed' USING ERRCODE = 'check_violation';
  END IF;
  RETURN NEW;
END;
$$;
DROP TRIGGER IF EXISTS trg_support_grant_guard ON public.support_access_grants;
CREATE TRIGGER trg_support_grant_guard BEFORE UPDATE ON public.support_access_grants
  FOR EACH ROW EXECUTE FUNCTION public.guard_support_grant_update();

CREATE OR REPLACE FUNCTION public.prevent_support_grant_delete()
RETURNS TRIGGER LANGUAGE plpgsql SET search_path = pg_catalog, public, pg_temp AS $$
BEGIN
  IF pg_trigger_depth() > 1 THEN RETURN OLD; END IF; -- organisation deleted (cascade)
  RAISE EXCEPTION 'support grant history cannot be deleted' USING ERRCODE = 'insufficient_privilege';
END;
$$;
DROP TRIGGER IF EXISTS trg_support_grant_no_delete ON public.support_access_grants;
CREATE TRIGGER trg_support_grant_no_delete BEFORE DELETE ON public.support_access_grants
  FOR EACH ROW EXECUTE FUNCTION public.prevent_support_grant_delete();

-- ---------------------------------------------------------------------------------------------- helpers
CREATE OR REPLACE FUNCTION public.support_audit(p_org UUID, p_kind TEXT, p_user UUID, p_profile UUID, p_label TEXT,
                                                p_action TEXT, p_grant UUID, p_meta JSONB)
RETURNS VOID LANGUAGE sql SECURITY DEFINER SET search_path = pg_catalog, public, pg_temp AS $$
  INSERT INTO public.org_audit_logs (org_id, actor_kind, actor_user_id, actor_profile_id, actor_label, action, target_type, target_id, metadata)
  VALUES (p_org, p_kind, p_user, p_profile, p_label, p_action, 'support_grant', p_grant::text, coalesce(p_meta, '{}'::jsonb));
$$;
REVOKE ALL ON FUNCTION public.support_audit(UUID, TEXT, UUID, UUID, TEXT, TEXT, UUID, JSONB) FROM PUBLIC, anon, authenticated;

-- ---------------------------------------------------------------------------------------------- request
CREATE OR REPLACE FUNCTION public.request_support_access(p_org UUID, p_user UUID, p_label TEXT, p_reason TEXT, p_minutes INTEGER)
RETURNS UUID LANGUAGE plpgsql SECURITY DEFINER SET search_path = pg_catalog, public, pg_temp AS $$
DECLARE v_id UUID;
BEGIN
  IF NOT EXISTS (SELECT 1 FROM public.platform_users WHERE user_id = p_user AND is_active
                   AND role IN ('super_admin', 'support_agent')) THEN
    RAISE EXCEPTION 'support grant: only active support staff can request access' USING ERRCODE = 'insufficient_privilege';
  END IF;
  INSERT INTO public.support_access_grants (org_id, requested_by, requested_by_label, reason, duration_minutes)
  VALUES (p_org, p_user, p_label, trim(p_reason), p_minutes) RETURNING id INTO v_id;
  PERFORM public.support_audit(p_org, 'support', p_user, NULL, p_label, 'support.access_requested', v_id,
    jsonb_build_object('reason', trim(p_reason), 'duration_minutes', p_minutes));
  RETURN v_id;
END;
$$;

-- ---------------------------------------------------------------------------------------------- customer decision
CREATE OR REPLACE FUNCTION public.decide_support_access(p_grant UUID, p_profile UUID, p_user UUID, p_label TEXT,
                                                        p_approve BOOLEAN, p_note TEXT DEFAULT NULL)
RETURNS JSONB LANGUAGE plpgsql SECURITY DEFINER SET search_path = pg_catalog, public, pg_temp AS $$
DECLARE g public.support_access_grants;
BEGIN
  SELECT * INTO g FROM public.support_access_grants WHERE id = p_grant FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'support grant: not found' USING ERRCODE = 'no_data_found'; END IF;
  IF g.status <> 'pending' THEN
    RAISE EXCEPTION 'support grant: this request was already %', g.status USING ERRCODE = 'check_violation';
  END IF;
  -- Defence in depth: the decider must be an active owner or admin of THIS organisation.
  IF NOT EXISTS (SELECT 1 FROM public.org_members WHERE org_id = g.org_id AND profile_id = p_profile
                   AND status = 'active' AND role IN ('owner', 'admin')) THEN
    RAISE EXCEPTION 'support grant: only an owner or admin of the organisation can decide' USING ERRCODE = 'insufficient_privilege';
  END IF;
  UPDATE public.support_access_grants
     SET status = CASE WHEN p_approve THEN 'approved' ELSE 'denied' END,
         decided_by_profile = p_profile, decided_by_user = p_user, decided_at = now(), decision_note = p_note,
         expires_at = CASE WHEN p_approve THEN now() + make_interval(mins => g.duration_minutes) END
   WHERE id = p_grant RETURNING * INTO g;
  PERFORM public.support_audit(g.org_id, 'member', p_user, p_profile, p_label,
    CASE WHEN p_approve THEN 'support.access_approved' ELSE 'support.access_denied' END, g.id,
    jsonb_build_object('requested_by', g.requested_by_label, 'expires_at', g.expires_at, 'note', p_note));
  RETURN jsonb_build_object('status', g.status, 'expires_at', g.expires_at);
END;
$$;

-- ---------------------------------------------------------------------------------------------- emergency override
CREATE OR REPLACE FUNCTION public.emergency_support_access(p_grant UUID, p_user UUID, p_label TEXT, p_reason TEXT, p_minutes INTEGER)
RETURNS JSONB LANGUAGE plpgsql SECURITY DEFINER SET search_path = pg_catalog, public, pg_temp AS $$
DECLARE g public.support_access_grants;
BEGIN
  IF NOT EXISTS (SELECT 1 FROM public.platform_users WHERE user_id = p_user AND is_active AND role = 'super_admin') THEN
    RAISE EXCEPTION 'support grant: only a super admin can grant emergency access' USING ERRCODE = 'insufficient_privilege';
  END IF;
  IF p_reason IS NULL OR char_length(trim(p_reason)) < 20 THEN
    RAISE EXCEPTION 'support grant: emergency access needs a reason of at least 20 characters' USING ERRCODE = 'check_violation';
  END IF;
  IF p_minutes NOT BETWEEN 15 AND 60 THEN
    RAISE EXCEPTION 'support grant: emergency access lasts 15 to 60 minutes' USING ERRCODE = 'check_violation';
  END IF;
  SELECT * INTO g FROM public.support_access_grants WHERE id = p_grant FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'support grant: not found' USING ERRCODE = 'no_data_found'; END IF;
  IF g.status <> 'pending' THEN
    RAISE EXCEPTION 'support grant: this request was already %', g.status USING ERRCODE = 'check_violation';
  END IF;
  UPDATE public.support_access_grants
     SET status = 'approved', emergency = true, duration_minutes = p_minutes,
         decided_by_user = p_user, decided_at = now(), decision_note = trim(p_reason),
         expires_at = now() + make_interval(mins => p_minutes)
   WHERE id = p_grant RETURNING * INTO g;
  PERFORM public.support_audit(g.org_id, 'platform', p_user, NULL, p_label, 'support.emergency_access', g.id,
    jsonb_build_object('requested_by', g.requested_by_label, 'reason', trim(p_reason), 'expires_at', g.expires_at));
  RETURN jsonb_build_object('status', g.status, 'expires_at', g.expires_at);
END;
$$;

-- ---------------------------------------------------------------------------------------------- revoke / cancel
-- p_side: 'customer' (owner/admin of the org) or 'platform' (the requester, or any super admin).
CREATE OR REPLACE FUNCTION public.end_support_access(p_grant UUID, p_side TEXT, p_user UUID, p_profile UUID, p_label TEXT)
RETURNS TEXT LANGUAGE plpgsql SECURITY DEFINER SET search_path = pg_catalog, public, pg_temp AS $$
DECLARE g public.support_access_grants; v_new TEXT;
BEGIN
  SELECT * INTO g FROM public.support_access_grants WHERE id = p_grant FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'support grant: not found' USING ERRCODE = 'no_data_found'; END IF;
  IF g.status NOT IN ('pending', 'approved') THEN
    RAISE EXCEPTION 'support grant: this request was already %', g.status USING ERRCODE = 'check_violation';
  END IF;
  IF p_side = 'customer' THEN
    IF NOT EXISTS (SELECT 1 FROM public.org_members WHERE org_id = g.org_id AND profile_id = p_profile
                     AND status = 'active' AND role IN ('owner', 'admin')) THEN
      RAISE EXCEPTION 'support grant: only an owner or admin of the organisation can revoke' USING ERRCODE = 'insufficient_privilege';
    END IF;
  ELSIF p_side = 'platform' THEN
    IF g.requested_by <> p_user AND NOT EXISTS (
         SELECT 1 FROM public.platform_users WHERE user_id = p_user AND is_active AND role = 'super_admin') THEN
      RAISE EXCEPTION 'support grant: only the requester or a super admin can end it' USING ERRCODE = 'insufficient_privilege';
    END IF;
  ELSE
    RAISE EXCEPTION 'support grant: unknown side %', p_side USING ERRCODE = 'check_violation';
  END IF;
  v_new := CASE WHEN g.status = 'pending' AND p_side = 'platform' THEN 'cancelled' ELSE 'revoked' END;
  UPDATE public.support_access_grants
     SET status = v_new, revoked_at = now(), revoked_by_user = p_user,
         expires_at = CASE WHEN g.status = 'approved' THEN least(g.expires_at, now()) ELSE g.expires_at END
   WHERE id = p_grant;
  PERFORM public.support_audit(g.org_id, CASE p_side WHEN 'customer' THEN 'member' ELSE 'support' END, p_user, p_profile, p_label,
    'support.access_' || v_new, g.id, jsonb_build_object('requested_by', g.requested_by_label, 'was', g.status));
  RETURN v_new;
END;
$$;

-- ---------------------------------------------------------------------------------------------- check
-- The live grant a support person holds for an organisation right now, or NULL.
CREATE OR REPLACE FUNCTION public.active_support_grant(p_org UUID, p_user UUID)
RETURNS UUID LANGUAGE sql STABLE SECURITY DEFINER SET search_path = pg_catalog, public, pg_temp AS $$
  SELECT g.id FROM public.support_access_grants g
  JOIN public.platform_users pu ON pu.user_id = g.requested_by AND pu.is_active
   AND pu.role IN ('super_admin', 'support_agent')
  WHERE g.org_id = p_org AND g.requested_by = p_user AND g.status = 'approved' AND g.expires_at > now()
  ORDER BY g.expires_at DESC LIMIT 1;
$$;

DO $$
DECLARE f TEXT;
BEGIN
  FOREACH f IN ARRAY ARRAY[
    'public.request_support_access(uuid,uuid,text,text,integer)',
    'public.decide_support_access(uuid,uuid,uuid,text,boolean,text)',
    'public.emergency_support_access(uuid,uuid,text,text,integer)',
    'public.end_support_access(uuid,text,uuid,uuid,text)',
    'public.active_support_grant(uuid,uuid)'
  ] LOOP
    EXECUTE format('REVOKE ALL ON FUNCTION %s FROM PUBLIC, anon, authenticated', f);
    EXECUTE format('GRANT EXECUTE ON FUNCTION %s TO service_role', f);
  END LOOP;
END $$;
GRANT EXECUTE ON FUNCTION public.support_audit(UUID, TEXT, UUID, UUID, TEXT, TEXT, UUID, JSONB) TO service_role;

-- ---------------------------------------------------------------------------------------------- access
ALTER TABLE public.support_access_grants ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.support_access_grants FROM PUBLIC, anon, authenticated;
GRANT SELECT ON public.support_access_grants TO authenticated;
GRANT SELECT, INSERT, UPDATE ON public.support_access_grants TO service_role;

-- Customers see every request made about their organisation.
DROP POLICY IF EXISTS support_grants_customer_read ON public.support_access_grants;
CREATE POLICY support_grants_customer_read ON public.support_access_grants FOR SELECT TO authenticated
  USING (public.auth_has_role_in_org(org_id, ARRAY['owner', 'admin']));

-- Platform audit trail: read-only auditors may read it too.
DROP POLICY IF EXISTS "platform_audit_logs_read_auditor" ON public.platform_audit_logs;
CREATE POLICY "platform_audit_logs_read_auditor" ON public.platform_audit_logs
  FOR SELECT USING (public.auth_is_platform_role(ARRAY['auditor'::public.platform_role]));

COMMIT;
