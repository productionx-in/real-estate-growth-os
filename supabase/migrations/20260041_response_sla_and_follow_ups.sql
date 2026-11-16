-- 20260041_response_sla_and_follow_ups.sql
-- REGrow M2 — Respond & follow up.
--
--   * Response clock: when a new lead is assigned, a first-response deadline starts (default 5 working minutes).
--     The assignee is nudged before it expires; on expiry managers are alerted and — if the organisation turned
--     it on — the lead is reassigned to the next available member of the same team.
--   * "First action" = the first call / WhatsApp / status change / site-visit booking logged on the lead.
--   * Follow-ups: lead_tasks with due times; reminders shortly before due and an alert when overdue.
--     leads.next_follow_up_at always mirrors the earliest open task.
--   * Everything runs inside Postgres every minute (pg_cron → process_lead_responses()), so reminders keep firing
--     even if the web app is down. External delivery (push) still goes through the job queue from 20260039.

BEGIN;

-- ============================================================================
-- 1. Per-organisation response settings
-- ============================================================================
CREATE TABLE IF NOT EXISTS public.lead_response_settings (
  org_id                  UUID PRIMARY KEY REFERENCES public.organisations(id) ON DELETE CASCADE,
  first_response_minutes  INTEGER NOT NULL DEFAULT 5  CHECK (first_response_minutes BETWEEN 1 AND 240),
  nudge_minutes           INTEGER NOT NULL DEFAULT 3  CHECK (nudge_minutes >= 1),
  reassign_on_breach      BOOLEAN NOT NULL DEFAULT false,
  workday_start           TIME NOT NULL DEFAULT '09:00',
  workday_end             TIME NOT NULL DEFAULT '21:00',
  timezone                TEXT NOT NULL DEFAULT 'Asia/Kolkata',
  updated_at              TIMESTAMPTZ NOT NULL DEFAULT now(),
  CHECK (nudge_minutes < first_response_minutes),
  CHECK (workday_start < workday_end)
);

-- ============================================================================
-- 2. Lead response columns
-- ============================================================================
ALTER TABLE public.leads
  ADD COLUMN IF NOT EXISTS assigned_at       TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS first_action_at   TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS sla_due_at        TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS sla_state         TEXT,
  ADD COLUMN IF NOT EXISTS next_follow_up_at TIMESTAMPTZ;

ALTER TABLE public.leads DROP CONSTRAINT IF EXISTS leads_sla_state_check;
ALTER TABLE public.leads ADD CONSTRAINT leads_sla_state_check
  CHECK (sla_state IS NULL OR sla_state IN ('pending', 'nudged', 'met', 'breached'));

CREATE INDEX IF NOT EXISTS idx_leads_sla_open ON public.leads (sla_due_at) WHERE sla_state IN ('pending', 'nudged');
CREATE INDEX IF NOT EXISTS idx_leads_org_next_follow_up ON public.leads (org_id, next_follow_up_at) WHERE next_follow_up_at IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_leads_org_assignee_open ON public.leads (org_id, assigned_to) WHERE status NOT IN ('booked', 'lost', 'junk');

-- New activity kinds (not used inside this transaction).
ALTER TYPE public.activity_type ADD VALUE IF NOT EXISTS 'whatsapp_logged';
ALTER TYPE public.activity_type ADD VALUE IF NOT EXISTS 'follow_up_scheduled';
ALTER TYPE public.activity_type ADD VALUE IF NOT EXISTS 'follow_up_completed';

-- ============================================================================
-- 3. Follow-up tasks
-- ============================================================================
CREATE TABLE IF NOT EXISTS public.lead_tasks (
  id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id              UUID NOT NULL REFERENCES public.organisations(id) ON DELETE CASCADE,
  lead_id             UUID NOT NULL REFERENCES public.leads(id) ON DELETE CASCADE,
  assigned_to         UUID REFERENCES public.profiles(id) ON DELETE SET NULL,
  kind                TEXT NOT NULL DEFAULT 'call' CHECK (kind IN ('call', 'whatsapp', 'meeting', 'site_visit', 'other')),
  due_at              TIMESTAMPTZ NOT NULL,
  note                TEXT CHECK (note IS NULL OR char_length(note) <= 1000),
  status              TEXT NOT NULL DEFAULT 'open' CHECK (status IN ('open', 'done', 'cancelled')),
  created_by          UUID REFERENCES public.profiles(id) ON DELETE SET NULL,
  created_at          TIMESTAMPTZ NOT NULL DEFAULT now(),
  completed_at        TIMESTAMPTZ,
  reminded_at         TIMESTAMPTZ,
  overdue_alerted_at  TIMESTAMPTZ,
  CHECK ((status = 'open') = (completed_at IS NULL))
);
CREATE INDEX IF NOT EXISTS idx_lead_tasks_lead ON public.lead_tasks (lead_id, status, due_at);
CREATE INDEX IF NOT EXISTS idx_lead_tasks_assignee_due ON public.lead_tasks (org_id, assigned_to, due_at) WHERE status = 'open';
CREATE INDEX IF NOT EXISTS idx_lead_tasks_due ON public.lead_tasks (due_at) WHERE status = 'open';

-- Same-organisation integrity: a task belongs to its lead's organisation; the assignee is a member of it.
CREATE OR REPLACE FUNCTION public.enforce_lead_task_integrity()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public, pg_temp
AS $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM public.leads l WHERE l.id = NEW.lead_id AND l.org_id = NEW.org_id) THEN
    RAISE EXCEPTION 'lead_task_integrity: lead does not belong to this organisation' USING ERRCODE = 'check_violation';
  END IF;
  IF NEW.assigned_to IS NOT NULL AND NOT EXISTS (
    SELECT 1 FROM public.org_members om
    WHERE om.org_id = NEW.org_id AND om.profile_id = NEW.assigned_to AND om.status = 'active'
  ) THEN
    RAISE EXCEPTION 'lead_task_integrity: assignee is not an active member of this organisation' USING ERRCODE = 'check_violation';
  END IF;
  RETURN NEW;
END;
$$;
REVOKE ALL ON FUNCTION public.enforce_lead_task_integrity() FROM PUBLIC, anon, authenticated;

DROP TRIGGER IF EXISTS trg_lead_tasks_integrity ON public.lead_tasks;
CREATE TRIGGER trg_lead_tasks_integrity
  BEFORE INSERT OR UPDATE OF org_id, lead_id, assigned_to ON public.lead_tasks
  FOR EACH ROW EXECUTE FUNCTION public.enforce_lead_task_integrity();

-- leads.next_follow_up_at = earliest open task
CREATE OR REPLACE FUNCTION public.sync_lead_next_follow_up()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public, pg_temp
AS $$
DECLARE
  v_lead UUID := CASE WHEN TG_OP = 'DELETE' THEN OLD.lead_id ELSE NEW.lead_id END;
BEGIN
  UPDATE public.leads l
     SET next_follow_up_at = (SELECT min(t.due_at) FROM public.lead_tasks t WHERE t.lead_id = v_lead AND t.status = 'open')
   WHERE l.id = v_lead;
  RETURN NULL;
END;
$$;
REVOKE ALL ON FUNCTION public.sync_lead_next_follow_up() FROM PUBLIC, anon, authenticated;

DROP TRIGGER IF EXISTS trg_lead_tasks_next_follow_up ON public.lead_tasks;
CREATE TRIGGER trg_lead_tasks_next_follow_up
  AFTER INSERT OR UPDATE OF due_at, status OR DELETE ON public.lead_tasks
  FOR EACH ROW EXECUTE FUNCTION public.sync_lead_next_follow_up();

-- ============================================================================
-- 4. Wider notification and routing vocabularies
-- ============================================================================
ALTER TABLE public.notifications DROP CONSTRAINT IF EXISTS notifications_type_check;
ALTER TABLE public.notifications ADD CONSTRAINT notifications_type_check CHECK (type IN (
  'lead_assigned', 'lead_unassigned', 'sla_nudge', 'sla_breach', 'follow_up_due', 'follow_up_overdue'));

ALTER TABLE public.lead_routing_decisions DROP CONSTRAINT IF EXISTS lead_routing_decisions_outcome_check;
ALTER TABLE public.lead_routing_decisions ADD CONSTRAINT lead_routing_decisions_outcome_check CHECK (outcome IN (
  'assigned', 'sticky', 'no_matching_rule', 'no_available_member', 'sla_reassigned'));

-- One place that writes an in-app notification and queues its external delivery.
CREATE OR REPLACE FUNCTION public.regrow_notify(
  p_org UUID, p_recipient UUID, p_type TEXT, p_title TEXT, p_body TEXT, p_lead UUID, p_dedupe TEXT)
RETURNS UUID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public, pg_temp
AS $$
DECLARE
  v_id UUID;
BEGIN
  INSERT INTO public.notifications (org_id, recipient_profile_id, type, title, body, lead_id, data, dedupe_key)
  VALUES (p_org, p_recipient, p_type, left(p_title, 200), left(p_body, 500), p_lead,
          jsonb_build_object('lead_id', p_lead), p_dedupe)
  ON CONFLICT (recipient_profile_id, dedupe_key) DO NOTHING
  RETURNING id INTO v_id;
  IF v_id IS NOT NULL THEN
    PERFORM public.enqueue_job('notification.dispatch', jsonb_build_object('notification_id', v_id), p_org, now(), 'dispatch:' || v_id);
  END IF;
  RETURN v_id;
END;
$$;
REVOKE ALL ON FUNCTION public.regrow_notify(UUID, UUID, TEXT, TEXT, TEXT, UUID, TEXT) FROM PUBLIC, anon, authenticated;

-- ============================================================================
-- 5. Working-time arithmetic and the response clock
-- ============================================================================
-- Deadline = p_minutes after p_from, counted from the start of the working day when p_from is outside it.
CREATE OR REPLACE FUNCTION public.regrow_response_deadline(p_org UUID, p_from TIMESTAMPTZ, p_minutes INTEGER)
RETURNS TIMESTAMPTZ
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = pg_catalog, public, pg_temp
AS $$
DECLARE
  s       public.lead_response_settings%ROWTYPE;
  v_local TIMESTAMP;
  v_start TIMESTAMP;
BEGIN
  SELECT * INTO s FROM public.lead_response_settings WHERE org_id = p_org;
  IF NOT FOUND THEN
    s.workday_start := '09:00'; s.workday_end := '21:00'; s.timezone := 'Asia/Kolkata';
  END IF;
  v_local := p_from AT TIME ZONE s.timezone;
  IF v_local::time < s.workday_start THEN
    v_start := v_local::date + s.workday_start;
  ELSIF v_local::time >= s.workday_end THEN
    v_start := (v_local::date + 1) + s.workday_start;
  ELSE
    RETURN p_from + make_interval(mins => p_minutes);
  END IF;
  RETURN (v_start AT TIME ZONE s.timezone) + make_interval(mins => p_minutes);
END;
$$;
REVOKE ALL ON FUNCTION public.regrow_response_deadline(UUID, TIMESTAMPTZ, INTEGER) FROM PUBLIC, anon, authenticated;

-- Start (or stop) the response clock whenever ownership of an untouched lead changes.
CREATE OR REPLACE FUNCTION public.lead_response_clock()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public, pg_temp
AS $$
DECLARE
  v_minutes INTEGER;
BEGIN
  IF TG_OP = 'UPDATE' AND NEW.assigned_to IS NOT DISTINCT FROM OLD.assigned_to THEN
    RETURN NEW;
  END IF;

  IF NEW.assigned_to IS NULL THEN
    IF NEW.first_action_at IS NULL THEN NEW.sla_state := NULL; NEW.sla_due_at := NULL; END IF;
    RETURN NEW;
  END IF;

  NEW.assigned_at := now();
  -- The clock only runs for leads nobody has acted on yet, and only for fresh enquiries
  -- (imports of historical leads in later stages do not start a 5-minute timer).
  IF NEW.first_action_at IS NULL AND NEW.status = 'new' THEN
    SELECT coalesce((SELECT first_response_minutes FROM public.lead_response_settings WHERE org_id = NEW.org_id), 5)
      INTO v_minutes;
    NEW.sla_due_at := public.regrow_response_deadline(NEW.org_id, now(), v_minutes);
    NEW.sla_state  := 'pending';
  END IF;
  RETURN NEW;
END;
$$;
REVOKE ALL ON FUNCTION public.lead_response_clock() FROM PUBLIC, anon, authenticated;

DROP TRIGGER IF EXISTS trigger_04_lead_response_clock ON public.leads;
CREATE TRIGGER trigger_04_lead_response_clock
  BEFORE INSERT OR UPDATE OF assigned_to ON public.leads
  FOR EACH ROW EXECUTE FUNCTION public.lead_response_clock();

-- Open follow-ups move with the lead when it is reassigned.
CREATE OR REPLACE FUNCTION public.move_open_tasks_with_lead()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public, pg_temp
AS $$
BEGIN
  IF NEW.assigned_to IS DISTINCT FROM OLD.assigned_to THEN
    UPDATE public.lead_tasks SET assigned_to = NEW.assigned_to
     WHERE lead_id = NEW.id AND status = 'open' AND assigned_to IS DISTINCT FROM NEW.assigned_to;
  END IF;
  RETURN NULL;
END;
$$;
REVOKE ALL ON FUNCTION public.move_open_tasks_with_lead() FROM PUBLIC, anon, authenticated;

DROP TRIGGER IF EXISTS trg_leads_move_open_tasks ON public.leads;
CREATE TRIGGER trg_leads_move_open_tasks
  AFTER UPDATE OF assigned_to ON public.leads
  FOR EACH ROW EXECUTE FUNCTION public.move_open_tasks_with_lead();

-- First action on a lead stops the clock.
CREATE OR REPLACE FUNCTION public.record_lead_first_action()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public, pg_temp
AS $$
BEGIN
  IF NEW.type::text IN ('call_logged', 'whatsapp_logged', 'status_changed', 'site_visit_scheduled', 'site_visited') THEN
    UPDATE public.leads
       SET first_action_at = NEW.created_at,
           sla_state = CASE WHEN sla_state IN ('pending', 'nudged') THEN 'met' ELSE sla_state END
     WHERE id = NEW.lead_id AND first_action_at IS NULL;
  END IF;
  RETURN NULL;
END;
$$;
REVOKE ALL ON FUNCTION public.record_lead_first_action() FROM PUBLIC, anon, authenticated;

DROP TRIGGER IF EXISTS trg_lead_activities_first_action ON public.lead_activities;
CREATE TRIGGER trg_lead_activities_first_action
  AFTER INSERT ON public.lead_activities
  FOR EACH ROW EXECUTE FUNCTION public.record_lead_first_action();

-- ============================================================================
-- 6. The minute job: nudges, breaches (+ optional reassignment), follow-up reminders
-- ============================================================================
CREATE OR REPLACE FUNCTION public.process_lead_responses(p_now TIMESTAMPTZ DEFAULT now())
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public, pg_temp
AS $$
DECLARE
  r            RECORD;
  m            RECORD;
  v_new        UUID;
  v_team       UUID;
  v_local_date DATE;
  v_nudged     INTEGER := 0;
  v_breached   INTEGER := 0;
  v_reassigned INTEGER := 0;
  v_due        INTEGER := 0;
  v_overdue    INTEGER := 0;
BEGIN
  -- (a) Nudge the assignee before the deadline
  FOR r IN
    SELECT l.id, l.org_id, l.name, l.assigned_to, l.sla_due_at
    FROM public.leads l
    LEFT JOIN public.lead_response_settings s ON s.org_id = l.org_id
    WHERE l.sla_state = 'pending' AND l.first_action_at IS NULL AND l.assigned_to IS NOT NULL
      AND p_now >= l.sla_due_at - make_interval(mins => coalesce(s.first_response_minutes, 5) - coalesce(s.nudge_minutes, 3))
      AND p_now < l.sla_due_at
    ORDER BY l.sla_due_at
    LIMIT 500
    FOR UPDATE OF l SKIP LOCKED
  LOOP
    PERFORM public.regrow_notify(r.org_id, r.assigned_to, 'sla_nudge',
      'Call ' || left(r.name, 80) || ' now',
      'Not contacted yet — ' || greatest(1, ceil(extract(epoch FROM (r.sla_due_at - p_now)) / 60))::int || ' min left',
      r.id, 'sla_nudge:' || r.id || ':' || r.assigned_to);
    UPDATE public.leads SET sla_state = 'nudged' WHERE id = r.id;
    v_nudged := v_nudged + 1;
  END LOOP;

  -- (b) Deadline missed: alert managers, optionally hand the lead to the next available team member
  FOR r IN
    SELECT l.id, l.org_id, l.name, l.assigned_to, coalesce(s.reassign_on_breach, false) AS reassign,
           p.full_name AS assignee_name
    FROM public.leads l
    LEFT JOIN public.lead_response_settings s ON s.org_id = l.org_id
    LEFT JOIN public.profiles p ON p.id = l.assigned_to
    WHERE l.sla_state IN ('pending', 'nudged') AND l.first_action_at IS NULL AND l.assigned_to IS NOT NULL
      AND p_now >= l.sla_due_at
    ORDER BY l.sla_due_at
    LIMIT 500
    FOR UPDATE OF l SKIP LOCKED
  LOOP
    UPDATE public.leads SET sla_state = 'breached' WHERE id = r.id;
    v_breached := v_breached + 1;

    FOR m IN
      SELECT om.profile_id FROM public.org_members om
      WHERE om.org_id = r.org_id AND om.status = 'active' AND om.role IN ('owner', 'admin', 'manager')
        AND om.profile_id <> r.assigned_to
    LOOP
      PERFORM public.regrow_notify(r.org_id, m.profile_id, 'sla_breach',
        'Not contacted in time: ' || left(r.name, 80),
        coalesce(r.assignee_name, 'Assignee') || ' has not acted on this lead',
        r.id, 'sla_breach:' || r.id || ':' || r.assigned_to);
    END LOOP;

    IF r.reassign THEN
      -- Same team the router chose last time; next eligible member, never the one who missed it.
      SELECT d.team_id INTO v_team FROM public.lead_routing_decisions d
       WHERE d.lead_id = r.id AND d.team_id IS NOT NULL ORDER BY d.decided_at DESC LIMIT 1;
      v_new := NULL;
      IF v_team IS NOT NULL THEN
        SELECT (now() AT TIME ZONE t.timezone)::date INTO v_local_date FROM public.teams t WHERE t.id = v_team;
        SELECT tm.profile_id INTO v_new
        FROM public.team_members tm
        JOIN public.teams t ON t.id = tm.team_id AND t.is_active
        JOIN public.org_members om ON om.org_id = tm.org_id AND om.profile_id = tm.profile_id
                                  AND om.status = 'active' AND om.role <> 'readonly'
        WHERE tm.team_id = v_team AND tm.is_on_duty AND tm.profile_id <> r.assigned_to
          AND NOT EXISTS (SELECT 1 FROM public.member_leaves ml WHERE ml.org_id = r.org_id
                            AND ml.profile_id = tm.profile_id AND v_local_date BETWEEN ml.starts_on AND ml.ends_on)
        ORDER BY tm.last_assigned_at ASC NULLS FIRST, tm.profile_id
        LIMIT 1;
      END IF;
      IF v_new IS NOT NULL THEN
        UPDATE public.team_members SET last_assigned_at = now() WHERE team_id = v_team AND profile_id = v_new;
        INSERT INTO public.lead_routing_decisions (org_id, lead_id, outcome, assigned_to, team_id, strategy, detail)
        VALUES (r.org_id, r.id, 'sla_reassigned', v_new, v_team, 'sla_reassign',
                jsonb_build_object('previous_assignee', r.assigned_to, 'reason', 'first response deadline missed'));
        UPDATE public.leads SET assigned_to = v_new WHERE id = r.id;  -- restarts the clock + notifies the new owner
        v_reassigned := v_reassigned + 1;
      END IF;
    END IF;
  END LOOP;

  -- (c) Follow-up reminder 15 minutes before it is due
  FOR r IN
    SELECT t.id, t.org_id, t.lead_id, t.assigned_to, t.kind, t.due_at, l.name
    FROM public.lead_tasks t JOIN public.leads l ON l.id = t.lead_id
    WHERE t.status = 'open' AND t.reminded_at IS NULL AND t.assigned_to IS NOT NULL
      AND t.due_at <= p_now + interval '15 minutes'
    ORDER BY t.due_at
    LIMIT 500
    FOR UPDATE OF t SKIP LOCKED
  LOOP
    PERFORM public.regrow_notify(r.org_id, r.assigned_to, 'follow_up_due',
      'Follow up: ' || left(r.name, 80),
      initcap(replace(r.kind, '_', ' ')) || ' due ' || to_char(r.due_at AT TIME ZONE 'Asia/Kolkata', 'HH12:MI AM'),
      r.lead_id, 'follow_up_due:' || r.id);
    UPDATE public.lead_tasks SET reminded_at = p_now WHERE id = r.id;
    v_due := v_due + 1;
  END LOOP;

  -- (d) Follow-up 15 minutes overdue
  FOR r IN
    SELECT t.id, t.org_id, t.lead_id, t.assigned_to, l.name
    FROM public.lead_tasks t JOIN public.leads l ON l.id = t.lead_id
    WHERE t.status = 'open' AND t.overdue_alerted_at IS NULL AND t.assigned_to IS NOT NULL
      AND t.due_at <= p_now - interval '15 minutes'
    ORDER BY t.due_at
    LIMIT 500
    FOR UPDATE OF t SKIP LOCKED
  LOOP
    PERFORM public.regrow_notify(r.org_id, r.assigned_to, 'follow_up_overdue',
      'Overdue follow-up: ' || left(r.name, 80), 'This follow-up is past due',
      r.lead_id, 'follow_up_overdue:' || r.id);
    UPDATE public.lead_tasks SET overdue_alerted_at = p_now WHERE id = r.id;
    v_overdue := v_overdue + 1;
  END LOOP;

  RETURN jsonb_build_object('nudged', v_nudged, 'breached', v_breached, 'reassigned', v_reassigned,
                            'follow_up_due', v_due, 'follow_up_overdue', v_overdue);
END;
$$;
REVOKE ALL ON FUNCTION public.process_lead_responses(TIMESTAMPTZ) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.process_lead_responses(TIMESTAMPTZ) TO service_role;

DO $$
BEGIN
  PERFORM cron.unschedule(jobid) FROM cron.job WHERE jobname = 'regrow-lead-responses';
  PERFORM cron.schedule('regrow-lead-responses', '* * * * *', 'SELECT public.process_lead_responses()');
END;
$$;

-- ============================================================================
-- 7. Logging a call outcome — one atomic step (called by the API after authorisation)
-- ============================================================================
-- Records the call, moves the status (decided by the app's outcome rules), closes the follow-ups this call
-- fulfilled (anything due within the next two hours) and schedules the next one.
CREATE OR REPLACE FUNCTION public.log_lead_outcome(
  p_lead UUID, p_actor UUID, p_outcome TEXT, p_new_status public.lead_status, p_note TEXT,
  p_follow_up_at TIMESTAMPTZ, p_follow_up_kind TEXT)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public, pg_temp
AS $$
DECLARE
  v_lead   public.leads%ROWTYPE;
  v_task   UUID;
  v_closed INTEGER;
BEGIN
  SELECT * INTO v_lead FROM public.leads WHERE id = p_lead FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'lead not found' USING ERRCODE = 'no_data_found'; END IF;

  INSERT INTO public.lead_activities (lead_id, actor_id, type, note, metadata)
  VALUES (p_lead, p_actor, 'call_logged', p_note, jsonb_build_object('outcome', p_outcome));

  IF p_new_status IS DISTINCT FROM v_lead.status THEN
    UPDATE public.leads SET status = p_new_status WHERE id = p_lead;
    INSERT INTO public.lead_activities (lead_id, actor_id, type, note, metadata)
    VALUES (p_lead, p_actor, 'status_changed', NULL,
            jsonb_build_object('from', v_lead.status, 'to', p_new_status, 'via', 'outcome', 'outcome', p_outcome));
  END IF;

  UPDATE public.lead_tasks SET status = 'done', completed_at = now()
   WHERE lead_id = p_lead AND status = 'open' AND due_at <= now() + interval '2 hours';
  GET DIAGNOSTICS v_closed = ROW_COUNT;

  IF p_new_status IN ('booked', 'lost', 'junk') THEN
    UPDATE public.lead_tasks SET status = 'cancelled', completed_at = now() WHERE lead_id = p_lead AND status = 'open';
  END IF;

  IF p_follow_up_at IS NOT NULL THEN
    INSERT INTO public.lead_tasks (org_id, lead_id, assigned_to, kind, due_at, note, created_by)
    VALUES (v_lead.org_id, p_lead, coalesce(v_lead.assigned_to, p_actor), coalesce(p_follow_up_kind, 'call'),
            p_follow_up_at, p_note, p_actor)
    RETURNING id INTO v_task;
    INSERT INTO public.lead_activities (lead_id, actor_id, type, note, metadata)
    VALUES (p_lead, p_actor, 'follow_up_scheduled', NULL,
            jsonb_build_object('task_id', v_task, 'due_at', p_follow_up_at, 'kind', coalesce(p_follow_up_kind, 'call')));
  END IF;

  RETURN jsonb_build_object('status', p_new_status, 'task_id', v_task, 'closed_tasks', v_closed);
END;
$$;
REVOKE ALL ON FUNCTION public.log_lead_outcome(UUID, UUID, TEXT, public.lead_status, TEXT, TIMESTAMPTZ, TEXT) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.log_lead_outcome(UUID, UUID, TEXT, public.lead_status, TEXT, TIMESTAMPTZ, TEXT) TO service_role;

-- ============================================================================
-- 8. Row Level Security & privileges
-- ============================================================================
ALTER TABLE public.lead_response_settings ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.lead_tasks             ENABLE ROW LEVEL SECURITY;

REVOKE ALL ON public.lead_response_settings, public.lead_tasks FROM PUBLIC, anon, authenticated;
GRANT SELECT ON public.lead_response_settings, public.lead_tasks TO authenticated;
GRANT ALL ON public.lead_response_settings, public.lead_tasks TO service_role;

DROP POLICY IF EXISTS lead_response_settings_member_read ON public.lead_response_settings;
CREATE POLICY lead_response_settings_member_read ON public.lead_response_settings FOR SELECT TO authenticated
  USING (public.auth_is_member_of_org(org_id));

-- Managers see every task in their organisation; everyone else only their own.
DROP POLICY IF EXISTS lead_tasks_read ON public.lead_tasks;
CREATE POLICY lead_tasks_read ON public.lead_tasks FOR SELECT TO authenticated
  USING (public.auth_is_member_of_org(org_id)
         AND (assigned_to = public.auth_profile_id()
              OR public.auth_has_role_in_org(org_id, ARRAY['owner', 'admin', 'manager'])));
-- Writes go through /api/leads/* after role checks (service role).

COMMIT;
