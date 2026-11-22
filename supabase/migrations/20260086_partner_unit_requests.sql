-- 20260086_partner_unit_requests.sql
-- Channel partner network: booking requests. A partner agency asks the developer to hold a specific unit for a
-- buyer it has registered (an accepted, still-protected registration, 20260058); the developer approves — which
-- holds the unit for the developer-side lead with the normal hold record (inventory_blockings + unit "blocked",
-- released by the existing expiry job) — or declines with a reason. The agency can withdraw a pending request.
--   * Only units of the registration's project, shared with the agency with inventory visible, and Available.
--   * One open request per registration; every step re-checked here, in one transaction, under a row lock on the
--     unit, and recorded in partner_events and both organisations' audit logs (partner_record, 20260058).
--   * The agency never receives the developer's lead or hold ids; the developer never receives the agency's lead.
-- Server-only table (RLS on, no client privileges). Additive.

BEGIN;

CREATE TABLE IF NOT EXISTS public.partner_unit_requests (
  id               UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  registration_id  UUID NOT NULL REFERENCES public.deal_registrations(id) ON DELETE CASCADE,
  partnership_id   UUID NOT NULL REFERENCES public.org_partnerships(id) ON DELETE CASCADE,
  developer_org_id UUID NOT NULL REFERENCES public.organisations(id) ON DELETE CASCADE,
  agency_org_id    UUID NOT NULL REFERENCES public.organisations(id) ON DELETE CASCADE,
  project_id       UUID NOT NULL REFERENCES public.projects(id) ON DELETE CASCADE,
  inventory_id     UUID NOT NULL REFERENCES public.inventory_items(id) ON DELETE CASCADE,
  note             TEXT CHECK (note IS NULL OR char_length(note) <= 500),
  hold_hours       INTEGER NOT NULL DEFAULT 48 CHECK (hold_hours BETWEEN 24 AND 168),
  status           TEXT NOT NULL DEFAULT 'submitted' CHECK (status IN ('submitted', 'approved', 'declined', 'withdrawn')),
  submitted_by     UUID REFERENCES public.profiles(id) ON DELETE SET NULL,
  submitted_at     TIMESTAMPTZ NOT NULL DEFAULT now(),
  reviewed_by      UUID REFERENCES public.profiles(id) ON DELETE SET NULL,
  reviewed_at      TIMESTAMPTZ,
  decline_reason   TEXT CHECK (decline_reason IS NULL OR char_length(decline_reason) BETWEEN 1 AND 500),
  blocking_id      UUID REFERENCES public.inventory_blockings(id) ON DELETE SET NULL, -- developer side only
  held_until       TIMESTAMPTZ,
  CHECK (developer_org_id <> agency_org_id),
  CHECK (status <> 'declined' OR decline_reason IS NOT NULL),
  CHECK (status <> 'approved' OR held_until IS NOT NULL)
);
CREATE UNIQUE INDEX IF NOT EXISTS uq_partner_unit_requests_open ON public.partner_unit_requests (registration_id) WHERE status = 'submitted';
CREATE INDEX IF NOT EXISTS idx_partner_unit_requests_developer ON public.partner_unit_requests (developer_org_id, status, submitted_at DESC);
CREATE INDEX IF NOT EXISTS idx_partner_unit_requests_agency ON public.partner_unit_requests (agency_org_id, status, submitted_at DESC);

ALTER TABLE public.partner_unit_requests ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.partner_unit_requests FROM PUBLIC, anon, authenticated;
GRANT SELECT, INSERT, UPDATE ON public.partner_unit_requests TO service_role;

-- ── Agency: ask for a unit ──────────────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.partner_request_unit(p_agency UUID, p_actor UUID, p_registration UUID, p_inventory UUID, p_note TEXT, p_hold_hours INTEGER)
RETURNS UUID LANGUAGE plpgsql SECURITY DEFINER SET search_path = pg_catalog, public, pg_temp
AS $$
DECLARE r RECORD; p RECORD; u RECORD; v_id UUID;
BEGIN
  PERFORM public.partner_assert_role(p_agency, p_actor, ARRAY['owner', 'admin', 'manager']);
  SELECT * INTO r FROM public.deal_registrations WHERE id = p_registration AND agency_org_id = p_agency;
  IF r.id IS NULL THEN RAISE EXCEPTION 'partner: registration not found' USING ERRCODE = 'no_data_found'; END IF;
  IF r.status <> 'accepted' OR r.protected_until IS NULL OR r.protected_until <= now() THEN
    RAISE EXCEPTION 'partner: the buyer''s registration must be accepted and still protected' USING ERRCODE = 'check_violation';
  END IF;
  SELECT * INTO p FROM public.org_partnerships WHERE id = r.partnership_id;
  IF p.status <> 'active' THEN RAISE EXCEPTION 'partner: this partnership is not active' USING ERRCODE = 'check_violation'; END IF;
  -- The unit: in the registration's project, shared with this agency with inventory visible. Anything else is "not found".
  SELECT i.id, i.project_id, i.status INTO u FROM public.inventory_items i
   WHERE i.id = p_inventory AND i.org_id = p.developer_org_id AND i.project_id = r.project_id
     AND EXISTS (SELECT 1 FROM public.partnership_projects pp WHERE pp.partnership_id = p.id AND pp.project_id = i.project_id
                 AND pp.revoked_at IS NULL AND pp.inventory_visibility <> 'none');
  IF u.id IS NULL THEN RAISE EXCEPTION 'partner: unit not found' USING ERRCODE = 'no_data_found'; END IF;
  IF u.status <> 'available' THEN RAISE EXCEPTION 'partner: that unit is no longer available' USING ERRCODE = 'check_violation'; END IF;
  IF EXISTS (SELECT 1 FROM public.partner_unit_requests WHERE registration_id = r.id AND status = 'submitted') THEN
    RAISE EXCEPTION 'partner: this buyer already has a request waiting for the developer' USING ERRCODE = 'unique_violation';
  END IF;

  INSERT INTO public.partner_unit_requests (registration_id, partnership_id, developer_org_id, agency_org_id, project_id, inventory_id, note, hold_hours, submitted_by)
  VALUES (r.id, p.id, p.developer_org_id, p_agency, u.project_id, u.id, nullif(btrim(coalesce(p_note, '')), ''), coalesce(p_hold_hours, 48), p_actor)
  RETURNING id INTO v_id;
  PERFORM public.partner_record(p.id, r.id, 'unit_requested', NULL, 'submitted', p_agency, p_actor, p.developer_org_id, p_agency,
    jsonb_build_object('request_id', v_id, 'inventory_id', u.id));
  RETURN v_id;
END;
$$;

-- ── Agency: withdraw a pending request ──────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.partner_withdraw_unit_request(p_agency UUID, p_actor UUID, p_request UUID)
RETURNS TEXT LANGUAGE plpgsql SECURITY DEFINER SET search_path = pg_catalog, public, pg_temp
AS $$
DECLARE q RECORD;
BEGIN
  PERFORM public.partner_assert_role(p_agency, p_actor, ARRAY['owner', 'admin', 'manager']);
  SELECT * INTO q FROM public.partner_unit_requests WHERE id = p_request AND agency_org_id = p_agency FOR UPDATE;
  IF q.id IS NULL THEN RAISE EXCEPTION 'partner: request not found' USING ERRCODE = 'no_data_found'; END IF;
  IF q.status = 'withdrawn' THEN RETURN 'withdrawn'; END IF;
  IF q.status <> 'submitted' THEN RAISE EXCEPTION 'partner: the developer has already answered this request' USING ERRCODE = 'check_violation'; END IF;
  UPDATE public.partner_unit_requests SET status = 'withdrawn', reviewed_at = now() WHERE id = q.id;
  PERFORM public.partner_record(q.partnership_id, q.registration_id, 'unit_request_withdrawn', 'submitted', 'withdrawn', p_agency, p_actor,
    q.developer_org_id, p_agency, jsonb_build_object('request_id', q.id));
  RETURN 'withdrawn';
END;
$$;

-- ── Developer: approve (hold the unit) or decline ───────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.partner_review_unit_request(p_developer UUID, p_actor UUID, p_request UUID, p_approve BOOLEAN, p_reason TEXT)
RETURNS JSONB LANGUAGE plpgsql SECURITY DEFINER SET search_path = pg_catalog, public, pg_temp
AS $$
DECLARE q RECORD; r RECORD; p RECORD; u RECORD; v_block UUID; v_until TIMESTAMPTZ; v_agency TEXT;
BEGIN
  PERFORM public.partner_assert_role(p_developer, p_actor, ARRAY['owner', 'admin', 'manager']);
  SELECT * INTO q FROM public.partner_unit_requests WHERE id = p_request AND developer_org_id = p_developer FOR UPDATE;
  IF q.id IS NULL THEN RAISE EXCEPTION 'partner: request not found' USING ERRCODE = 'no_data_found'; END IF;
  IF q.status = 'approved' AND p_approve THEN RETURN jsonb_build_object('status', 'approved', 'held_until', q.held_until); END IF;
  IF q.status = 'declined' AND NOT p_approve THEN RETURN jsonb_build_object('status', 'declined'); END IF;
  IF q.status <> 'submitted' THEN RAISE EXCEPTION 'partner: this request is no longer waiting for an answer' USING ERRCODE = 'check_violation'; END IF;
  SELECT * INTO p FROM public.org_partnerships WHERE id = q.partnership_id;

  IF NOT p_approve THEN
    IF coalesce(btrim(p_reason), '') = '' THEN RAISE EXCEPTION 'partner: give a reason for declining' USING ERRCODE = 'check_violation'; END IF;
    UPDATE public.partner_unit_requests SET status = 'declined', decline_reason = left(btrim(p_reason), 500), reviewed_by = p_actor, reviewed_at = now() WHERE id = q.id;
    PERFORM public.partner_record(q.partnership_id, q.registration_id, 'unit_request_declined', 'submitted', 'declined', p_developer, p_actor,
      p_developer, q.agency_org_id, jsonb_build_object('request_id', q.id));
    RETURN jsonb_build_object('status', 'declined');
  END IF;

  IF p.status NOT IN ('active', 'paused') THEN RAISE EXCEPTION 'partner: this partnership has ended' USING ERRCODE = 'check_violation'; END IF;
  SELECT * INTO r FROM public.deal_registrations WHERE id = q.registration_id;
  IF r.status <> 'accepted' OR r.developer_lead_id IS NULL OR r.protected_until <= now() THEN
    RAISE EXCEPTION 'partner: the buyer''s registration is no longer protected; decline instead' USING ERRCODE = 'check_violation';
  END IF;
  SELECT id, project_id, status INTO u FROM public.inventory_items WHERE id = q.inventory_id AND org_id = p_developer FOR UPDATE;
  IF u.id IS NULL OR u.status <> 'available' THEN
    RAISE EXCEPTION 'partner: that unit is no longer available; decline with a reason' USING ERRCODE = 'check_violation';
  END IF;

  SELECT name INTO v_agency FROM public.organisations WHERE id = q.agency_org_id;
  v_until := now() + make_interval(hours => q.hold_hours);
  INSERT INTO public.inventory_blockings (org_id, project_id, inventory_id, lead_id, blocked_by, token_amount, expires_at, remarks, status)
  VALUES (p_developer, u.project_id, u.id, r.developer_lead_id, p_actor, 0, v_until, 'Held at the request of partner agency ' || v_agency, 'active')
  RETURNING id INTO v_block;
  UPDATE public.inventory_items SET status = 'blocked', updated_at = now() WHERE id = u.id;
  UPDATE public.partner_unit_requests SET status = 'approved', reviewed_by = p_actor, reviewed_at = now(), blocking_id = v_block, held_until = v_until WHERE id = q.id;
  INSERT INTO public.lead_activities (lead_id, actor_id, type, note, metadata)
  VALUES (r.developer_lead_id, p_actor, 'note_added', 'Unit held at the request of partner agency ' || v_agency,
    jsonb_build_object('partner_unit_request_id', q.id, 'inventory_id', u.id, 'held_until', v_until));
  PERFORM public.partner_record(q.partnership_id, q.registration_id, 'unit_request_approved', 'submitted', 'approved', p_developer, p_actor,
    p_developer, q.agency_org_id, jsonb_build_object('request_id', q.id, 'held_until', v_until));
  RETURN jsonb_build_object('status', 'approved', 'held_until', v_until);
END;
$$;

REVOKE ALL ON FUNCTION public.partner_request_unit(UUID, UUID, UUID, UUID, TEXT, INTEGER) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.partner_withdraw_unit_request(UUID, UUID, UUID) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.partner_review_unit_request(UUID, UUID, UUID, BOOLEAN, TEXT) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.partner_request_unit(UUID, UUID, UUID, UUID, TEXT, INTEGER) TO service_role;
GRANT EXECUTE ON FUNCTION public.partner_withdraw_unit_request(UUID, UUID, UUID) TO service_role;
GRANT EXECUTE ON FUNCTION public.partner_review_unit_request(UUID, UUID, UUID, BOOLEAN, TEXT) TO service_role;

COMMIT;
