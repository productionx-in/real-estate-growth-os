-- 20260044_org_lifecycle_and_audit.sql
-- Phase 1 — organisation lifecycle and the customer-visible audit log.
--
-- Lifecycle states: pending_setup → active ⇄ grace → suspended → deactivated (and reactivation back to active).
-- Enforcement reuses the membership model every API route, RLS policy and the lead router already obey:
--   * suspended   → every active member is temporarily switched to role 'readonly' (their real role is saved in
--                   org_members.lifecycle_saved_role). Readonly members can read but no write path accepts them,
--                   so the whole workspace becomes read-only without touching individual routes. Lead capture
--                   (webhooks, forms) keeps working: no buyer enquiry is lost.
--   * deactivated → active memberships move to status 'suspended', which every membership check rejects.
--   * reactivation restores exactly what was saved. Individually deactivated members stay deactivated.
-- All transitions go through set_organisation_lifecycle(), which records an organisation_state_event and an
-- org_audit_logs entry in the same transaction.

BEGIN;

-- ============================================================================
-- 1. Lifecycle columns
-- ============================================================================
ALTER TABLE public.organisations
  ADD COLUMN IF NOT EXISTS lifecycle_state TEXT NOT NULL DEFAULT 'active',
  ADD COLUMN IF NOT EXISTS lifecycle_reason TEXT,
  ADD COLUMN IF NOT EXISTS lifecycle_changed_at TIMESTAMPTZ;

ALTER TABLE public.organisations DROP CONSTRAINT IF EXISTS organisations_lifecycle_state_check;
ALTER TABLE public.organisations ADD CONSTRAINT organisations_lifecycle_state_check
  CHECK (lifecycle_state IN ('pending_setup', 'active', 'grace', 'suspended', 'deactivated'));

ALTER TABLE public.org_members
  ADD COLUMN IF NOT EXISTS lifecycle_saved_role public.member_role,
  ADD COLUMN IF NOT EXISTS lifecycle_suspended BOOLEAN NOT NULL DEFAULT false;

CREATE INDEX IF NOT EXISTS idx_organisations_lifecycle ON public.organisations (lifecycle_state);

-- ============================================================================
-- 2. History of state changes (append-only)
-- ============================================================================
CREATE TABLE IF NOT EXISTS public.organisation_state_events (
  id             UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id         UUID NOT NULL REFERENCES public.organisations(id) ON DELETE CASCADE,
  from_state     TEXT NOT NULL,
  to_state       TEXT NOT NULL,
  reason         TEXT NOT NULL CHECK (char_length(reason) BETWEEN 3 AND 1000),
  actor_user_id  UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  actor_kind     TEXT NOT NULL CHECK (actor_kind IN ('platform', 'system', 'member')),
  created_at     TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_org_state_events_org ON public.organisation_state_events (org_id, created_at DESC);

-- ============================================================================
-- 3. Customer-visible audit log (append-only)
-- ============================================================================
CREATE TABLE IF NOT EXISTS public.org_audit_logs (
  id               UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id           UUID NOT NULL REFERENCES public.organisations(id) ON DELETE CASCADE,
  actor_kind       TEXT NOT NULL CHECK (actor_kind IN ('member', 'platform', 'support', 'system')),
  actor_user_id    UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  actor_profile_id UUID REFERENCES public.profiles(id) ON DELETE SET NULL,
  actor_label      TEXT,                      -- name/email snapshot, so the entry stays readable after deletion
  action           TEXT NOT NULL CHECK (action ~ '^[a-z_]+\.[a-z_]+$'),
  target_type      TEXT,
  target_id        TEXT,
  metadata         JSONB NOT NULL DEFAULT '{}'::jsonb,
  ip_address       TEXT,
  user_agent       TEXT,
  created_at       TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_org_audit_logs_org ON public.org_audit_logs (org_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_org_audit_logs_action ON public.org_audit_logs (org_id, action, created_at DESC);

CREATE OR REPLACE FUNCTION public.prevent_org_audit_mutation()
RETURNS TRIGGER
LANGUAGE plpgsql
SET search_path = pg_catalog, public, pg_temp
AS $$
BEGIN
  -- Rows may only disappear with their organisation (FK cascade, nested trigger depth).
  IF TG_OP = 'DELETE' AND pg_trigger_depth() > 1 THEN
    RETURN OLD;
  END IF;
  RAISE EXCEPTION '% rows are append-only', TG_TABLE_NAME USING ERRCODE = 'insufficient_privilege';
END;
$$;

DROP TRIGGER IF EXISTS trg_org_audit_logs_immutable ON public.org_audit_logs;
CREATE TRIGGER trg_org_audit_logs_immutable
  BEFORE UPDATE OR DELETE ON public.org_audit_logs
  FOR EACH ROW EXECUTE FUNCTION public.prevent_org_audit_mutation();

DROP TRIGGER IF EXISTS trg_org_state_events_immutable ON public.organisation_state_events;
CREATE TRIGGER trg_org_state_events_immutable
  BEFORE UPDATE OR DELETE ON public.organisation_state_events
  FOR EACH ROW EXECUTE FUNCTION public.prevent_org_audit_mutation();

-- ============================================================================
-- 4. The only way to change lifecycle state
-- ============================================================================
CREATE OR REPLACE FUNCTION public.set_organisation_lifecycle(
  p_org UUID, p_state TEXT, p_reason TEXT, p_actor_user UUID, p_actor_kind TEXT DEFAULT 'platform', p_actor_label TEXT DEFAULT NULL)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public, pg_temp
AS $$
DECLARE
  v_from    TEXT;
  v_changed INTEGER := 0;
BEGIN
  IF p_state NOT IN ('pending_setup', 'active', 'grace', 'suspended', 'deactivated') THEN
    RAISE EXCEPTION 'lifecycle: unknown state %', p_state USING ERRCODE = 'check_violation';
  END IF;
  IF p_reason IS NULL OR char_length(trim(p_reason)) < 3 THEN
    RAISE EXCEPTION 'lifecycle: a reason is required' USING ERRCODE = 'check_violation';
  END IF;

  SELECT lifecycle_state INTO v_from FROM public.organisations WHERE id = p_org FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'lifecycle: organisation not found' USING ERRCODE = 'no_data_found';
  END IF;
  IF v_from = p_state THEN
    RETURN jsonb_build_object('from', v_from, 'to', p_state, 'members_changed', 0, 'unchanged', true);
  END IF;
  IF p_state = 'pending_setup' THEN
    RAISE EXCEPTION 'lifecycle: an organisation cannot return to pending_setup' USING ERRCODE = 'check_violation';
  END IF;

  -- (a) Leaving a restricted state: restore what suspension / deactivation saved.
  IF v_from IN ('suspended', 'deactivated') THEN
    UPDATE public.org_members
       SET status = 'active', lifecycle_suspended = false
     WHERE org_id = p_org AND lifecycle_suspended;
    GET DIAGNOSTICS v_changed = ROW_COUNT;
    IF p_state <> 'suspended' THEN
      UPDATE public.org_members
         SET role = lifecycle_saved_role, lifecycle_saved_role = NULL
       WHERE org_id = p_org AND lifecycle_saved_role IS NOT NULL;
    END IF;
  END IF;

  -- (b) Entering suspension: read-only for everyone, real roles saved.
  IF p_state = 'suspended' THEN
    UPDATE public.org_members
       SET lifecycle_saved_role = role, role = 'readonly'
     WHERE org_id = p_org AND status = 'active' AND role <> 'readonly' AND lifecycle_saved_role IS NULL;
    GET DIAGNOSTICS v_changed = ROW_COUNT;
  END IF;

  -- (c) Entering deactivation: nobody can sign in to this workspace.
  IF p_state = 'deactivated' THEN
    UPDATE public.org_members
       SET status = 'suspended', lifecycle_suspended = true
     WHERE org_id = p_org AND status = 'active';
    GET DIAGNOSTICS v_changed = ROW_COUNT;
  END IF;

  UPDATE public.organisations
     SET lifecycle_state = p_state, lifecycle_reason = trim(p_reason), lifecycle_changed_at = now()
   WHERE id = p_org;

  INSERT INTO public.organisation_state_events (org_id, from_state, to_state, reason, actor_user_id, actor_kind)
  VALUES (p_org, v_from, p_state, trim(p_reason), p_actor_user, p_actor_kind);

  INSERT INTO public.org_audit_logs (org_id, actor_kind, actor_user_id, actor_label, action, target_type, target_id, metadata)
  VALUES (p_org, CASE p_actor_kind WHEN 'member' THEN 'member' WHEN 'system' THEN 'system' ELSE 'platform' END,
          p_actor_user, p_actor_label, 'organisation.lifecycle_changed', 'organisation', p_org::text,
          jsonb_build_object('from', v_from, 'to', p_state, 'reason', trim(p_reason), 'members_changed', v_changed));

  RETURN jsonb_build_object('from', v_from, 'to', p_state, 'members_changed', v_changed, 'unchanged', false);
END;
$$;
REVOKE ALL ON FUNCTION public.set_organisation_lifecycle(UUID, TEXT, TEXT, UUID, TEXT, TEXT) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.set_organisation_lifecycle(UUID, TEXT, TEXT, UUID, TEXT, TEXT) TO service_role;

-- Role changes are refused for members whose real role is held by a suspension (it would be lost on restore).
CREATE OR REPLACE FUNCTION public.guard_lifecycle_saved_role()
RETURNS TRIGGER
LANGUAGE plpgsql
SET search_path = pg_catalog, public, pg_temp
AS $$
BEGIN
  IF OLD.lifecycle_saved_role IS NOT NULL AND NEW.lifecycle_saved_role IS NOT DISTINCT FROM OLD.lifecycle_saved_role
     AND NEW.role IS DISTINCT FROM OLD.role THEN
    RAISE EXCEPTION 'lifecycle: roles cannot be changed while the organisation is suspended' USING ERRCODE = 'check_violation';
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_org_members_lifecycle_role ON public.org_members;
CREATE TRIGGER trg_org_members_lifecycle_role
  BEFORE UPDATE OF role ON public.org_members
  FOR EACH ROW EXECUTE FUNCTION public.guard_lifecycle_saved_role();

-- ============================================================================
-- 5. Session revocation (server-only)
-- ============================================================================
-- Ends every session of a user: refresh tokens go with their sessions (FK cascade), so the browser can no
-- longer renew its access token; the current access token expires within its normal lifetime, and every
-- membership check already refuses an inactive member before then.
CREATE OR REPLACE FUNCTION public.revoke_user_sessions(p_auth_user UUID)
RETURNS INTEGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public, pg_temp
AS $$
DECLARE
  v_count INTEGER;
BEGIN
  DELETE FROM auth.sessions WHERE user_id = p_auth_user;
  GET DIAGNOSTICS v_count = ROW_COUNT;
  RETURN v_count;
END;
$$;
REVOKE ALL ON FUNCTION public.revoke_user_sessions(UUID) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.revoke_user_sessions(UUID) TO service_role;

-- ============================================================================
-- 6. Public access requests can be stored (requested_by was NOT NULL → every anonymous insert failed)
-- ============================================================================
ALTER TABLE public.customer_onboarding_requests ALTER COLUMN requested_by DROP NOT NULL;
ALTER TABLE public.customer_onboarding_requests
  ADD COLUMN IF NOT EXISTS source TEXT NOT NULL DEFAULT 'platform';
ALTER TABLE public.customer_onboarding_requests DROP CONSTRAINT IF EXISTS customer_onboarding_requests_source_check;
ALTER TABLE public.customer_onboarding_requests ADD CONSTRAINT customer_onboarding_requests_source_check
  CHECK (source IN ('platform', 'public') AND (source = 'public' OR requested_by IS NOT NULL));

-- ============================================================================
-- 7. Row Level Security & privileges
-- ============================================================================
ALTER TABLE public.organisation_state_events ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.org_audit_logs            ENABLE ROW LEVEL SECURITY;

REVOKE ALL ON public.organisation_state_events, public.org_audit_logs FROM PUBLIC, anon, authenticated;
GRANT SELECT ON public.org_audit_logs TO authenticated;
GRANT SELECT, INSERT ON public.organisation_state_events, public.org_audit_logs TO service_role;

-- Owners and admins read their own organisation's audit log. (During a suspension everyone is readonly, so
-- the log is readable again only after reactivation, or through the platform console.)
DROP POLICY IF EXISTS org_audit_logs_admin_read ON public.org_audit_logs;
CREATE POLICY org_audit_logs_admin_read ON public.org_audit_logs FOR SELECT TO authenticated
  USING (public.auth_has_role_in_org(org_id, ARRAY['owner', 'admin']));

COMMIT;
