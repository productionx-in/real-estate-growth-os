-- 20260058_channel_partner_network.sql
-- Channel partner network, PR 1 (docs/design/channel-partner-network.md): partnerships between independent
-- developer and agency organisations, project sharing with an inventory visibility level, and buyer
-- registration with conflict checking and developer review.
--
-- Ownership rules enforced here:
--   * Developer and agency stay independent organisations; a partnership is a link, never a parent/child.
--   * An agency's leads never cross. A buyer's name, phone and note cross only through an explicitly
--     submitted, consent-confirmed registration; acceptance creates a SEPARATE developer-side lead.
--   * Neither side receives the other's internal ids beyond what it needs (shaped by the server).
--
-- Security model:
--   * The four tables have RLS enabled with NO client policies, and table privileges are revoked from
--     anon and authenticated: browsers never read or write them directly. The server reads them with the
--     service role after authorising the caller, and every write goes through the SECURITY DEFINER
--     functions below, which re-check organisation membership, role, partnership state, project sharing
--     and record ownership themselves (defence in depth), and are executable by service_role only.
--   * Every cross-organisation action writes BOTH organisations' audit logs (org_audit_logs) in the same
--     transaction as the change: either everything is recorded or nothing happens.
--
-- Conflict rules (approved 2026-11-18):
--   * Scope: the whole developer organisation, matched on the normalised phone (public.normalize_phone_in,
--     the same rule as leads.phone_e164).
--   * A buyer conflicts if the developer has an open or booked lead with that phone (status not lost/junk,
--     not merged), or any partner agency has a submitted (under review) or accepted, unexpired registration.
--   * First submitted wins: a submission reserves the buyer until the developer accepts or rejects it.
--   * Protection starts at acceptance and lasts the partnership's protection_days (default 60) calendar days.
--   * Concurrency: submission and acceptance take a transaction-level advisory lock on (developer, phone),
--     and a partial unique index allows at most one submitted/accepted registration per (developer, phone).
BEGIN;

-- ── Tables ──────────────────────────────────────────────────────────────────────────────────────
ALTER TABLE public.organisations ADD COLUMN IF NOT EXISTS partner_code TEXT;
CREATE UNIQUE INDEX IF NOT EXISTS uq_organisations_partner_code ON public.organisations (partner_code) WHERE partner_code IS NOT NULL;

CREATE TABLE IF NOT EXISTS public.org_partnerships (
  id                 UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  developer_org_id   UUID NOT NULL REFERENCES public.organisations(id) ON DELETE CASCADE,
  agency_org_id      UUID NOT NULL REFERENCES public.organisations(id) ON DELETE CASCADE,
  status             TEXT NOT NULL DEFAULT 'invited' CHECK (status IN ('invited', 'active', 'paused', 'rejected', 'cancelled', 'ended')),
  protection_days    INTEGER NOT NULL DEFAULT 60 CHECK (protection_days BETWEEN 1 AND 365),
  paused_by_org_id   UUID REFERENCES public.organisations(id) ON DELETE SET NULL,
  channel_partner_id UUID REFERENCES public.channel_partners(id) ON DELETE SET NULL, -- developer's commercial profile (PR 2)
  requested_by       UUID REFERENCES public.profiles(id) ON DELETE SET NULL,
  responded_by       UUID REFERENCES public.profiles(id) ON DELETE SET NULL,
  activated_at       TIMESTAMPTZ,
  ended_at           TIMESTAMPTZ,
  created_at         TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at         TIMESTAMPTZ NOT NULL DEFAULT now(),
  CHECK (developer_org_id <> agency_org_id)
);
-- At most one open (invited / active / paused) partnership per developer–agency pair.
CREATE UNIQUE INDEX IF NOT EXISTS uq_org_partnerships_open ON public.org_partnerships (developer_org_id, agency_org_id)
  WHERE status IN ('invited', 'active', 'paused');
CREATE INDEX IF NOT EXISTS idx_org_partnerships_agency ON public.org_partnerships (agency_org_id, status);
CREATE INDEX IF NOT EXISTS idx_org_partnerships_developer ON public.org_partnerships (developer_org_id, status);

CREATE TABLE IF NOT EXISTS public.partnership_projects (
  id                   UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  partnership_id       UUID NOT NULL REFERENCES public.org_partnerships(id) ON DELETE CASCADE,
  developer_org_id     UUID NOT NULL REFERENCES public.organisations(id) ON DELETE CASCADE,
  project_id           UUID NOT NULL REFERENCES public.projects(id) ON DELETE CASCADE,
  inventory_visibility TEXT NOT NULL DEFAULT 'availability' CHECK (inventory_visibility IN ('none', 'availability', 'availability_and_price')),
  shared_by            UUID REFERENCES public.profiles(id) ON DELETE SET NULL,
  shared_at            TIMESTAMPTZ NOT NULL DEFAULT now(),
  revoked_at           TIMESTAMPTZ,
  updated_at           TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (partnership_id, project_id)
);

CREATE TABLE IF NOT EXISTS public.deal_registrations (
  id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  partnership_id    UUID NOT NULL REFERENCES public.org_partnerships(id) ON DELETE CASCADE,
  developer_org_id  UUID NOT NULL REFERENCES public.organisations(id) ON DELETE CASCADE,
  agency_org_id     UUID NOT NULL REFERENCES public.organisations(id) ON DELETE CASCADE,
  project_id        UUID REFERENCES public.projects(id) ON DELETE SET NULL,
  agency_lead_id    UUID REFERENCES public.leads(id) ON DELETE SET NULL,   -- never shown to the developer; null if the agency deletes its lead
  buyer_name        TEXT NOT NULL CHECK (length(btrim(buyer_name)) BETWEEN 1 AND 200),
  buyer_phone       TEXT NOT NULL,
  buyer_phone_e164  TEXT NOT NULL,
  note              TEXT CHECK (note IS NULL OR length(note) <= 1000),
  status            TEXT NOT NULL CHECK (status IN ('submitted', 'accepted', 'rejected', 'conflicted', 'withdrawn', 'expired')),
  consent_confirmed BOOLEAN NOT NULL CHECK (consent_confirmed),
  consent_version   TEXT NOT NULL,
  submitted_by      UUID REFERENCES public.profiles(id) ON DELETE SET NULL,
  submitted_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
  reviewed_by       UUID REFERENCES public.profiles(id) ON DELETE SET NULL,
  reviewed_at       TIMESTAMPTZ,
  rejection_reason  TEXT CHECK (rejection_reason IS NULL OR length(rejection_reason) <= 500),
  developer_lead_id UUID REFERENCES public.leads(id) ON DELETE SET NULL,           -- never shown to the agency
  protection_days   INTEGER,
  protected_until   TIMESTAMPTZ,
  updated_at        TIMESTAMPTZ NOT NULL DEFAULT now(),
  CHECK (developer_org_id <> agency_org_id),
  CHECK (status <> 'accepted' OR (protected_until IS NOT NULL AND reviewed_at IS NOT NULL))
);
-- One live claim per buyer per developer (backstop to the advisory lock).
CREATE UNIQUE INDEX IF NOT EXISTS uq_deal_registrations_live_buyer ON public.deal_registrations (developer_org_id, buyer_phone_e164)
  WHERE status IN ('submitted', 'accepted');
CREATE UNIQUE INDEX IF NOT EXISTS uq_deal_registrations_developer_lead ON public.deal_registrations (developer_lead_id) WHERE developer_lead_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_deal_registrations_developer ON public.deal_registrations (developer_org_id, status, submitted_at DESC);
CREATE INDEX IF NOT EXISTS idx_deal_registrations_agency ON public.deal_registrations (agency_org_id, status, submitted_at DESC);
CREATE INDEX IF NOT EXISTS idx_deal_registrations_agency_lead ON public.deal_registrations (agency_lead_id);

-- Shared, append-only history of partnerships and registrations (status changes, reviews).
CREATE TABLE IF NOT EXISTS public.partner_events (
  id               UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  partnership_id   UUID NOT NULL REFERENCES public.org_partnerships(id) ON DELETE CASCADE,
  registration_id  UUID REFERENCES public.deal_registrations(id) ON DELETE CASCADE,
  event            TEXT NOT NULL CHECK (event ~ '^[a-z_]+$'),
  from_status      TEXT,
  to_status        TEXT,
  actor_org_id     UUID,   -- plain ids: history must survive deletions without being rewritten
  actor_profile_id UUID,
  created_at       TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_partner_events_partnership ON public.partner_events (partnership_id, created_at);

CREATE OR REPLACE FUNCTION public.partner_events_append_only()
RETURNS trigger LANGUAGE plpgsql SET search_path = pg_catalog, public, pg_temp
AS $$
BEGIN
  IF TG_OP = 'UPDATE' THEN RAISE EXCEPTION 'partner_events is append-only'; END IF;
  -- DELETE only as part of removing the whole partnership (cascade).
  IF EXISTS (SELECT 1 FROM public.org_partnerships WHERE id = OLD.partnership_id) THEN
    RAISE EXCEPTION 'partner_events is append-only';
  END IF;
  RETURN OLD;
END;
$$;
DROP TRIGGER IF EXISTS trg_partner_events_append_only ON public.partner_events;
CREATE TRIGGER trg_partner_events_append_only BEFORE UPDATE OR DELETE ON public.partner_events
  FOR EACH ROW EXECUTE FUNCTION public.partner_events_append_only();

-- Browsers never touch these tables: RLS on, no client policies, client privileges revoked.
ALTER TABLE public.org_partnerships ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.partnership_projects ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.deal_registrations ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.partner_events ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.org_partnerships, public.partnership_projects, public.deal_registrations, public.partner_events FROM anon, authenticated;
GRANT ALL ON public.org_partnerships, public.partnership_projects, public.deal_registrations, public.partner_events TO service_role;

-- ── Helpers ─────────────────────────────────────────────────────────────────────────────────────
-- The actor's role in an organisation, or an exception when they are not an active member with one of the roles.
CREATE OR REPLACE FUNCTION public.partner_assert_role(p_org UUID, p_actor UUID, p_roles TEXT[])
RETURNS public.member_role LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = pg_catalog, public, pg_temp
AS $$
DECLARE v_role public.member_role;
BEGIN
  SELECT role INTO v_role FROM public.org_members WHERE org_id = p_org AND profile_id = p_actor AND status = 'active';
  IF v_role IS NULL OR NOT (v_role::text = ANY (p_roles)) THEN
    RAISE EXCEPTION 'partner: not allowed' USING ERRCODE = 'insufficient_privilege';
  END IF;
  RETURN v_role;
END;
$$;

-- p_actor is a member of p_org, or NULL with p_label naming the partner organisation that acted.
CREATE OR REPLACE FUNCTION public.partner_audit(p_org UUID, p_actor UUID, p_action TEXT, p_target_type TEXT, p_target UUID, p_meta JSONB, p_label TEXT DEFAULT NULL)
RETURNS VOID LANGUAGE sql SECURITY DEFINER SET search_path = pg_catalog, public, pg_temp
AS $$
  INSERT INTO public.org_audit_logs (org_id, actor_kind, actor_profile_id, actor_label, action, target_type, target_id, metadata)
  VALUES (p_org, 'member', p_actor, p_label, p_action, p_target_type, p_target::text, coalesce(p_meta, '{}'::jsonb));
$$;

-- One shared event row and an audit entry in each organisation, in the caller's transaction.
CREATE OR REPLACE FUNCTION public.partner_record(
  p_partnership UUID, p_registration UUID, p_event TEXT, p_from TEXT, p_to TEXT, p_actor_org UUID, p_actor UUID,
  p_dev_org UUID, p_agency_org UUID, p_meta JSONB)
RETURNS VOID LANGUAGE plpgsql SECURITY DEFINER SET search_path = pg_catalog, public, pg_temp
AS $$
DECLARE v_meta JSONB := coalesce(p_meta, '{}'::jsonb) || jsonb_build_object('partnership_id', p_partnership, 'acted_by', CASE WHEN p_actor_org = p_dev_org THEN 'developer' ELSE 'agency' END)
                        || CASE WHEN p_registration IS NULL THEN '{}'::jsonb ELSE jsonb_build_object('registration_id', p_registration) END
                        || CASE WHEN p_to IS NULL THEN '{}'::jsonb ELSE jsonb_build_object('status', p_to) END;
BEGIN
  INSERT INTO public.partner_events (partnership_id, registration_id, event, from_status, to_status, actor_org_id, actor_profile_id)
  VALUES (p_partnership, p_registration, p_event, p_from, p_to, p_actor_org, p_actor);
  -- The acting organisation's log names its own member; the other organisation's log records the action
  -- without a profile from outside it.
  PERFORM public.partner_audit(p_actor_org, p_actor, 'partner.' || p_event,
    CASE WHEN p_registration IS NULL THEN 'partnership' ELSE 'deal_registration' END, coalesce(p_registration, p_partnership), v_meta);
  PERFORM public.partner_audit(CASE WHEN p_actor_org = p_dev_org THEN p_agency_org ELSE p_dev_org END, NULL, 'partner.' || p_event,
    CASE WHEN p_registration IS NULL THEN 'partnership' ELSE 'deal_registration' END, coalesce(p_registration, p_partnership), v_meta,
    'Partner: ' || (SELECT name FROM public.organisations WHERE id = p_actor_org));
END;
$$;

-- ── Partner code (agency) ───────────────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.partner_ensure_code(p_agency UUID, p_actor UUID)
RETURNS TEXT LANGUAGE plpgsql SECURITY DEFINER SET search_path = pg_catalog, public, extensions, pg_temp
AS $$
DECLARE v_code TEXT; v_type public.org_type; i INT := 0;
BEGIN
  PERFORM public.partner_assert_role(p_agency, p_actor, ARRAY['owner', 'admin']);
  SELECT type, partner_code INTO v_type, v_code FROM public.organisations WHERE id = p_agency FOR UPDATE;
  IF v_type <> 'channel_partner' THEN RAISE EXCEPTION 'partner: only agencies have a partner code' USING ERRCODE = 'check_violation'; END IF;
  IF v_code IS NOT NULL THEN RETURN v_code; END IF;
  LOOP
    i := i + 1;
    -- 10 characters from an unambiguous alphabet (no 0/O, 1/I/L): about 2^48 codes.
    v_code := 'RGP-' || (SELECT string_agg(substr('23456789ABCDEFGHJKMNPQRSTUVWXYZ', 1 + (get_byte(b, n) % 31), 1), '' ORDER BY n)
                          FROM (SELECT gen_random_bytes(10) b) r, generate_series(0, 9) n);
    BEGIN
      UPDATE public.organisations SET partner_code = v_code WHERE id = p_agency;
      EXIT;
    EXCEPTION WHEN unique_violation THEN
      IF i >= 5 THEN RAISE; END IF;
    END;
  END LOOP;
  PERFORM public.partner_audit(p_agency, p_actor, 'partner.code_created', 'organisation', p_agency, '{}'::jsonb);
  RETURN v_code;
END;
$$;

-- ── Partnership lifecycle ───────────────────────────────────────────────────────────────────────
-- Developer admin asks an agency (by its partner code) to partner. The agency's identity is only learned
-- through the code it chose to share.
CREATE OR REPLACE FUNCTION public.partner_request(p_developer UUID, p_actor UUID, p_code TEXT)
RETURNS UUID LANGUAGE plpgsql SECURITY DEFINER SET search_path = pg_catalog, public, pg_temp
AS $$
DECLARE v_agency UUID; v_type public.org_type; v_id UUID;
BEGIN
  PERFORM public.partner_assert_role(p_developer, p_actor, ARRAY['owner', 'admin']);
  SELECT type INTO v_type FROM public.organisations WHERE id = p_developer;
  IF v_type <> 'developer' THEN RAISE EXCEPTION 'partner: only developers can send partnership requests' USING ERRCODE = 'check_violation'; END IF;
  SELECT id INTO v_agency FROM public.organisations
   WHERE partner_code = upper(btrim(p_code)) AND type = 'channel_partner' AND lifecycle_state = 'active';
  IF v_agency IS NULL THEN RAISE EXCEPTION 'partner: no agency with that partner code' USING ERRCODE = 'no_data_found'; END IF;
  BEGIN
    INSERT INTO public.org_partnerships (developer_org_id, agency_org_id, status, requested_by)
    VALUES (p_developer, v_agency, 'invited', p_actor) RETURNING id INTO v_id;
  EXCEPTION WHEN unique_violation THEN
    RAISE EXCEPTION 'partner: you already have a partnership or request with this agency' USING ERRCODE = 'unique_violation';
  END;
  PERFORM public.partner_record(v_id, NULL, 'requested', NULL, 'invited', p_developer, p_actor, p_developer, v_agency, NULL);
  RETURN v_id;
END;
$$;

-- p_action: accept / reject (agency, on an invitation); cancel (developer, on an invitation);
-- pause / resume / end (either side; only the side that paused can resume).
CREATE OR REPLACE FUNCTION public.partner_set_status(p_org UUID, p_actor UUID, p_partnership UUID, p_action TEXT)
RETURNS TEXT LANGUAGE plpgsql SECURITY DEFINER SET search_path = pg_catalog, public, pg_temp
AS $$
DECLARE p RECORD; v_side TEXT; v_to TEXT; v_withdrawn INT := 0;
BEGIN
  PERFORM public.partner_assert_role(p_org, p_actor, ARRAY['owner', 'admin']);
  SELECT * INTO p FROM public.org_partnerships WHERE id = p_partnership FOR UPDATE;
  IF p.id IS NULL OR p_org NOT IN (p.developer_org_id, p.agency_org_id) THEN
    RAISE EXCEPTION 'partner: partnership not found' USING ERRCODE = 'no_data_found';
  END IF;
  v_side := CASE WHEN p_org = p.developer_org_id THEN 'developer' ELSE 'agency' END;

  v_to := CASE
    WHEN p_action = 'accept' AND v_side = 'agency' AND p.status = 'invited' THEN 'active'
    WHEN p_action = 'reject' AND v_side = 'agency' AND p.status = 'invited' THEN 'rejected'
    WHEN p_action = 'cancel' AND v_side = 'developer' AND p.status = 'invited' THEN 'cancelled'
    WHEN p_action = 'pause' AND p.status = 'active' THEN 'paused'
    WHEN p_action = 'resume' AND p.status = 'paused' AND p.paused_by_org_id = p_org THEN 'active'
    WHEN p_action = 'end' AND p.status IN ('active', 'paused') THEN 'ended'
    ELSE NULL END;
  IF v_to IS NULL THEN
    -- Repeating a completed action is harmless (idempotent); anything else is refused.
    IF (p_action IN ('accept', 'resume') AND p.status = 'active') OR (p_action = 'reject' AND p.status = 'rejected')
       OR (p_action = 'cancel' AND p.status = 'cancelled') OR (p_action = 'pause' AND p.status = 'paused' AND p.paused_by_org_id = p_org)
       OR (p_action = 'end' AND p.status = 'ended') THEN
      RETURN p.status;
    END IF;
    RAISE EXCEPTION 'partner: that change is not possible now' USING ERRCODE = 'check_violation';
  END IF;

  UPDATE public.org_partnerships SET
    status = v_to,
    paused_by_org_id = CASE WHEN v_to = 'paused' THEN p_org ELSE NULL END,
    responded_by = CASE WHEN p_action IN ('accept', 'reject') THEN p_actor ELSE responded_by END,
    activated_at = CASE WHEN p_action = 'accept' THEN now() ELSE activated_at END,
    ended_at = CASE WHEN v_to IN ('ended', 'rejected', 'cancelled') THEN now() ELSE ended_at END,
    updated_at = now()
  WHERE id = p.id;
  PERFORM public.partner_record(p.id, NULL, CASE p_action WHEN 'accept' THEN 'accepted' WHEN 'reject' THEN 'rejected' WHEN 'cancel' THEN 'cancelled'
    WHEN 'pause' THEN 'paused' WHEN 'resume' THEN 'resumed' ELSE 'ended' END, p.status, v_to, p_org, p_actor, p.developer_org_id, p.agency_org_id, NULL);

  IF v_to = 'ended' THEN
    -- Registrations still under review are withdrawn; accepted protections run to their expiry.
    WITH w AS (
      UPDATE public.deal_registrations SET status = 'withdrawn', updated_at = now()
       WHERE partnership_id = p.id AND status = 'submitted' RETURNING id, partnership_id
    )
    INSERT INTO public.partner_events (partnership_id, registration_id, event, from_status, to_status, actor_org_id, actor_profile_id)
    SELECT partnership_id, id, 'registration_withdrawn', 'submitted', 'withdrawn', p_org, p_actor FROM w;
    GET DIAGNOSTICS v_withdrawn = ROW_COUNT;
    IF v_withdrawn > 0 THEN
      PERFORM public.partner_audit(p.developer_org_id, CASE WHEN p_org = p.developer_org_id THEN p_actor END, 'partner.registrations_withdrawn', 'partnership', p.id,
        jsonb_build_object('partnership_id', p.id, 'count', v_withdrawn), CASE WHEN p_org <> p.developer_org_id THEN 'Partner: ' || (SELECT name FROM public.organisations WHERE id = p_org) END);
      PERFORM public.partner_audit(p.agency_org_id, CASE WHEN p_org = p.agency_org_id THEN p_actor END, 'partner.registrations_withdrawn', 'partnership', p.id,
        jsonb_build_object('partnership_id', p.id, 'count', v_withdrawn), CASE WHEN p_org <> p.agency_org_id THEN 'Partner: ' || (SELECT name FROM public.organisations WHERE id = p_org) END);
    END IF;
  END IF;
  RETURN v_to;
END;
$$;

-- ── Project sharing (developer admins) ──────────────────────────────────────────────────────────
-- p_visibility NULL revokes the share. A new share defaults to availability without prices.
CREATE OR REPLACE FUNCTION public.partner_share_project(p_developer UUID, p_actor UUID, p_partnership UUID, p_project UUID, p_visibility TEXT)
RETURNS TEXT LANGUAGE plpgsql SECURITY DEFINER SET search_path = pg_catalog, public, pg_temp
AS $$
DECLARE p RECORD; v_old RECORD; v_vis TEXT := p_visibility; v_event TEXT;
BEGIN
  PERFORM public.partner_assert_role(p_developer, p_actor, ARRAY['owner', 'admin']);
  SELECT * INTO p FROM public.org_partnerships WHERE id = p_partnership AND developer_org_id = p_developer FOR UPDATE;
  IF p.id IS NULL THEN RAISE EXCEPTION 'partner: partnership not found' USING ERRCODE = 'no_data_found'; END IF;
  IF p.status NOT IN ('active', 'paused') THEN RAISE EXCEPTION 'partner: projects can only be shared in an active or paused partnership' USING ERRCODE = 'check_violation'; END IF;
  IF NOT EXISTS (SELECT 1 FROM public.projects WHERE id = p_project AND org_id = p_developer) THEN
    RAISE EXCEPTION 'partner: project not found' USING ERRCODE = 'no_data_found';
  END IF;
  IF v_vis IS NOT NULL AND v_vis NOT IN ('none', 'availability', 'availability_and_price') THEN
    RAISE EXCEPTION 'partner: unknown visibility' USING ERRCODE = 'check_violation';
  END IF;
  SELECT * INTO v_old FROM public.partnership_projects WHERE partnership_id = p.id AND project_id = p_project FOR UPDATE;

  IF v_vis IS NULL THEN
    IF v_old.id IS NULL OR v_old.revoked_at IS NOT NULL THEN RETURN NULL; END IF;
    UPDATE public.partnership_projects SET revoked_at = now(), updated_at = now() WHERE id = v_old.id;
    v_event := 'project_unshared';
  ELSIF v_old.id IS NULL THEN
    INSERT INTO public.partnership_projects (partnership_id, developer_org_id, project_id, inventory_visibility, shared_by)
    VALUES (p.id, p_developer, p_project, v_vis, p_actor);
    v_event := 'project_shared';
  ELSE
    IF v_old.revoked_at IS NULL AND v_old.inventory_visibility = v_vis THEN RETURN v_vis; END IF;
    UPDATE public.partnership_projects SET inventory_visibility = v_vis, revoked_at = NULL, shared_by = p_actor,
      shared_at = CASE WHEN v_old.revoked_at IS NOT NULL THEN now() ELSE shared_at END, updated_at = now()
     WHERE id = v_old.id;
    v_event := CASE WHEN v_old.revoked_at IS NOT NULL THEN 'project_shared' ELSE 'project_visibility_changed' END;
  END IF;
  PERFORM public.partner_record(p.id, NULL, v_event, NULL, NULL, p_developer, p_actor, p.developer_org_id, p.agency_org_id,
    jsonb_build_object('project_id', p_project, 'inventory_visibility', v_vis, 'previous', CASE WHEN v_old.revoked_at IS NULL THEN v_old.inventory_visibility END));
  RETURN v_vis;
END;
$$;

-- ── Buyer registration (agency admins and managers) ─────────────────────────────────────────────
-- Returns {outcome: submitted | already_submitted | conflict, registration_id, status, protected_until}.
-- A conflict reveals only that the buyer is already registered with this developer and, when an accepted
-- protection exists, until when — never by whom.
CREATE OR REPLACE FUNCTION public.partner_submit_registration(
  p_agency UUID, p_actor UUID, p_partnership UUID, p_project UUID, p_agency_lead UUID, p_note TEXT, p_consent BOOLEAN, p_consent_version TEXT)
RETURNS JSONB LANGUAGE plpgsql SECURITY DEFINER SET search_path = pg_catalog, public, pg_temp
AS $$
DECLARE p RECORD; l RECORD; v_phone TEXT; v_live RECORD; v_dev_lead BOOLEAN; v_id UUID; v_conflict BOOLEAN := false; v_until TIMESTAMPTZ;
BEGIN
  PERFORM public.partner_assert_role(p_agency, p_actor, ARRAY['owner', 'admin', 'manager']);
  IF p_consent IS DISTINCT FROM true OR coalesce(btrim(p_consent_version), '') = '' THEN
    RAISE EXCEPTION 'partner: confirm that you are authorised to share this buyer''s details' USING ERRCODE = 'check_violation';
  END IF;
  SELECT * INTO p FROM public.org_partnerships WHERE id = p_partnership AND agency_org_id = p_agency;
  IF p.id IS NULL THEN RAISE EXCEPTION 'partner: partnership not found' USING ERRCODE = 'no_data_found'; END IF;
  IF p.status <> 'active' THEN RAISE EXCEPTION 'partner: this partnership is not active' USING ERRCODE = 'check_violation'; END IF;
  IF NOT EXISTS (SELECT 1 FROM public.partnership_projects WHERE partnership_id = p.id AND project_id = p_project AND revoked_at IS NULL) THEN
    RAISE EXCEPTION 'partner: that project is not shared with you' USING ERRCODE = 'no_data_found';
  END IF;
  -- The buyer must be one of the agency's own leads (a lead id from anywhere else is simply "not found").
  SELECT id, name, phone, phone_e164 INTO l FROM public.leads WHERE id = p_agency_lead AND org_id = p_agency AND merged_into_id IS NULL;
  IF l.id IS NULL THEN RAISE EXCEPTION 'partner: lead not found' USING ERRCODE = 'no_data_found'; END IF;
  v_phone := l.phone_e164;
  IF v_phone IS NULL THEN RAISE EXCEPTION 'partner: the lead needs a valid phone number' USING ERRCODE = 'check_violation'; END IF;

  -- Serialise every claim on this buyer at this developer.
  PERFORM pg_advisory_xact_lock(hashtextextended('partner_reg:' || p.developer_org_id::text || ':' || v_phone, 0));

  -- Accepted protections past their end are expired now, so expiry is enforced without a background job.
  UPDATE public.deal_registrations SET status = 'expired', updated_at = now()
   WHERE developer_org_id = p.developer_org_id AND buyer_phone_e164 = v_phone AND status = 'accepted' AND protected_until <= now();

  SELECT id, partnership_id, status, protected_until INTO v_live FROM public.deal_registrations
   WHERE developer_org_id = p.developer_org_id AND buyer_phone_e164 = v_phone AND status IN ('submitted', 'accepted');
  IF v_live.id IS NOT NULL AND v_live.partnership_id = p.id THEN
    -- This agency already has the claim: return it instead of a second registration.
    RETURN jsonb_build_object('outcome', 'already_submitted', 'registration_id', v_live.id, 'status', v_live.status, 'protected_until', v_live.protected_until);
  END IF;
  v_dev_lead := EXISTS (SELECT 1 FROM public.leads WHERE org_id = p.developer_org_id AND phone_e164 = v_phone
                         AND status NOT IN ('lost', 'junk') AND merged_into_id IS NULL);
  IF v_live.id IS NOT NULL OR v_dev_lead THEN
    v_conflict := true;
    v_until := CASE WHEN v_live.status = 'accepted' THEN v_live.protected_until END;
  END IF;

  INSERT INTO public.deal_registrations (partnership_id, developer_org_id, agency_org_id, project_id, agency_lead_id, buyer_name, buyer_phone,
    buyer_phone_e164, note, status, consent_confirmed, consent_version, submitted_by)
  VALUES (p.id, p.developer_org_id, p_agency, p_project, l.id, l.name, l.phone, v_phone, nullif(btrim(p_note), ''),
    CASE WHEN v_conflict THEN 'conflicted' ELSE 'submitted' END, true, p_consent_version, p_actor)
  RETURNING id INTO v_id;

  -- Audit: both organisations; the conflict entry never names whose claim it collided with. No buyer details.
  PERFORM public.partner_record(p.id, v_id, CASE WHEN v_conflict THEN 'registration_conflict' ELSE 'registration_submitted' END, NULL,
    CASE WHEN v_conflict THEN 'conflicted' ELSE 'submitted' END, p_agency, p_actor, p.developer_org_id, p_agency,
    jsonb_build_object('project_id', p_project, 'consent_version', p_consent_version));
  RETURN jsonb_build_object('outcome', CASE WHEN v_conflict THEN 'conflict' ELSE 'submitted' END, 'registration_id', v_id,
    'status', CASE WHEN v_conflict THEN 'conflicted' ELSE 'submitted' END, 'protected_until', v_until);
END;
$$;

-- ── Developer review (owners, admins, managers) ─────────────────────────────────────────────────
-- Accepting creates the developer-side lead (once) and starts protection; rejecting records the reason.
-- Repeating the same decision returns the existing result.
CREATE OR REPLACE FUNCTION public.partner_review_registration(p_developer UUID, p_actor UUID, p_registration UUID, p_accept BOOLEAN, p_reason TEXT)
RETURNS JSONB LANGUAGE plpgsql SECURITY DEFINER SET search_path = pg_catalog, public, pg_temp
AS $$
DECLARE r RECORD; p RECORD; v_lead UUID; v_until TIMESTAMPTZ; v_agency_name TEXT;
BEGIN
  PERFORM public.partner_assert_role(p_developer, p_actor, ARRAY['owner', 'admin', 'manager']);
  SELECT * INTO r FROM public.deal_registrations WHERE id = p_registration AND developer_org_id = p_developer;
  IF r.id IS NULL THEN RAISE EXCEPTION 'partner: registration not found' USING ERRCODE = 'no_data_found'; END IF;
  PERFORM pg_advisory_xact_lock(hashtextextended('partner_reg:' || r.developer_org_id::text || ':' || r.buyer_phone_e164, 0));
  SELECT * INTO r FROM public.deal_registrations WHERE id = p_registration FOR UPDATE;

  IF r.status = 'accepted' AND p_accept THEN
    RETURN jsonb_build_object('status', 'accepted', 'developer_lead_id', r.developer_lead_id, 'protected_until', r.protected_until);
  END IF;
  IF r.status = 'rejected' AND NOT p_accept THEN
    RETURN jsonb_build_object('status', 'rejected');
  END IF;
  IF r.status <> 'submitted' THEN RAISE EXCEPTION 'partner: this registration is no longer awaiting review' USING ERRCODE = 'check_violation'; END IF;
  SELECT * INTO p FROM public.org_partnerships WHERE id = r.partnership_id;
  IF p.status NOT IN ('active', 'paused') THEN RAISE EXCEPTION 'partner: this partnership has ended' USING ERRCODE = 'check_violation'; END IF;

  IF NOT p_accept THEN
    IF coalesce(btrim(p_reason), '') = '' THEN RAISE EXCEPTION 'partner: give a reason for rejecting' USING ERRCODE = 'check_violation'; END IF;
    UPDATE public.deal_registrations SET status = 'rejected', rejection_reason = btrim(p_reason), reviewed_by = p_actor, reviewed_at = now(), updated_at = now()
     WHERE id = r.id;
    PERFORM public.partner_record(p.id, r.id, 'registration_rejected', 'submitted', 'rejected', p_developer, p_actor, p.developer_org_id, p.agency_org_id, NULL);
    RETURN jsonb_build_object('status', 'rejected');
  END IF;

  -- The developer's own open lead for this buyer, created after the submission, would make a second record:
  -- the developer must reject instead (the agency then sees an ordinary rejection).
  IF EXISTS (SELECT 1 FROM public.leads WHERE org_id = p_developer AND phone_e164 = r.buyer_phone_e164
             AND status NOT IN ('lost', 'junk') AND merged_into_id IS NULL) THEN
    RAISE EXCEPTION 'partner: you already have an open lead for this buyer; reject the registration instead' USING ERRCODE = 'check_violation';
  END IF;

  SELECT name INTO v_agency_name FROM public.organisations WHERE id = r.agency_org_id;
  INSERT INTO public.leads (org_id, name, phone, source, source_platform, status, project_id, notes, custom_fields)
  VALUES (p_developer, r.buyer_name, r.buyer_phone, 'referral', 'channel_partner', 'new', r.project_id,
    'Registered by partner agency ' || v_agency_name || coalesce(E'.\n' || r.note, '.'),
    jsonb_build_object('partner_registration_id', r.id))
  RETURNING id INTO v_lead;
  v_until := now() + make_interval(days => p.protection_days);
  UPDATE public.deal_registrations SET status = 'accepted', reviewed_by = p_actor, reviewed_at = now(), developer_lead_id = v_lead,
    protection_days = p.protection_days, protected_until = v_until, updated_at = now()
   WHERE id = r.id;
  INSERT INTO public.lead_activities (lead_id, actor_id, type, note, metadata)
  VALUES (v_lead, p_actor, 'note_added', 'Accepted a buyer registration from partner agency ' || v_agency_name,
    jsonb_build_object('partner_registration_id', r.id, 'protected_until', v_until));
  PERFORM public.partner_record(p.id, r.id, 'registration_accepted', 'submitted', 'accepted', p_developer, p_actor, p.developer_org_id, p.agency_org_id,
    jsonb_build_object('protected_until', v_until));
  -- The developer-side lead is the developer's record: only its own log names it.
  PERFORM public.partner_audit(p_developer, p_actor, 'partner.developer_lead_created', 'lead', v_lead, jsonb_build_object('registration_id', r.id));
  RETURN jsonb_build_object('status', 'accepted', 'developer_lead_id', v_lead, 'protected_until', v_until);
END;
$$;

DO $$
DECLARE f TEXT;
BEGIN
  FOREACH f IN ARRAY ARRAY[
    'public.partner_assert_role(uuid, uuid, text[])', 'public.partner_audit(uuid, uuid, text, text, uuid, jsonb, text)',
    'public.partner_record(uuid, uuid, text, text, text, uuid, uuid, uuid, uuid, jsonb)', 'public.partner_ensure_code(uuid, uuid)',
    'public.partner_request(uuid, uuid, text)', 'public.partner_set_status(uuid, uuid, uuid, text)',
    'public.partner_share_project(uuid, uuid, uuid, uuid, text)',
    'public.partner_submit_registration(uuid, uuid, uuid, uuid, uuid, text, boolean, text)',
    'public.partner_review_registration(uuid, uuid, uuid, boolean, text)', 'public.partner_events_append_only()']
  LOOP
    EXECUTE format('REVOKE ALL ON FUNCTION %s FROM PUBLIC, anon, authenticated', f);
    EXECUTE format('GRANT EXECUTE ON FUNCTION %s TO service_role', f);
  END LOOP;
END $$;

COMMIT;
