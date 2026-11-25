-- 20260093_lead_alerts.sql
-- Lead alerts (Settings → Notification defaults → Lead alerts; lib/notifications/lead-alerts.ts). Builds on the
-- notifications, job queue, web push and minute job of 20260039 / 20260041; nothing is scheduled in the browser.
--   * org_settings.alerts — the workspace's switches: everything, new-lead alerts, "not contacted yet" reminders (every
--     N minutes, default 10), follow-up reminders (N minutes before, default 5), sounds. Missing keys mean "on".
--   * New lead, from every source (the trigger on leads_all): the assignee's "New lead" alert is marked as one (so the app
--     shows it as a banner with the new-lead sound); owners, admins and managers get one too, saying who it went to — or,
--     when nobody has it, the "Unassigned lead" alert, now in every workspace (before: only workspaces with routing rules).
--     Alerts never carry the buyer's phone or e-mail (push goes through outside services): the app looks the number up
--     for the person's own "Call" button.
--   * public.lead_contact_reminders — per lead, how many "not contacted yet" reminders its current assignee has had and
--     when. Kept off the lead row so a reminder never changes the lead's "updated" time.
--   * process_lead_responses gains (e) the reminders, and (c) follows the workspace's follow-up lead time; a rescheduled
--     follow-up is reminded again for its new time, a cancelled or completed one never.
-- Additive: with no settings saved, alerts are on, as the team asked.

BEGIN;

ALTER TABLE public.org_settings
  ADD COLUMN IF NOT EXISTS alerts JSONB NOT NULL DEFAULT '{}'::jsonb CHECK (jsonb_typeof(alerts) = 'object' AND pg_column_size(alerts) < 4096);

-- A switch is on unless it, or the master switch, is explicitly false.
CREATE OR REPLACE FUNCTION public.lead_alert_on(p_alerts JSONB, p_key TEXT)
RETURNS BOOLEAN LANGUAGE sql IMMUTABLE SET search_path = pg_catalog AS $$
  SELECT NOT (coalesce(p_alerts -> 'enabled', 'true'::jsonb) = 'false'::jsonb
              OR coalesce(p_alerts -> p_key, 'true'::jsonb) = 'false'::jsonb)
$$;
-- A whole number of minutes within [lo, hi]; anything else is the default.
CREATE OR REPLACE FUNCTION public.lead_alert_minutes(p_alerts JSONB, p_key TEXT, p_default INTEGER, p_lo INTEGER, p_hi INTEGER)
RETURNS INTEGER LANGUAGE sql IMMUTABLE SET search_path = pg_catalog AS $$
  SELECT CASE WHEN jsonb_typeof(p_alerts -> p_key) = 'number'
              THEN least(p_hi, greatest(p_lo, round((p_alerts ->> p_key)::numeric)::int)) ELSE p_default END
$$;
REVOKE ALL ON FUNCTION public.lead_alert_on(JSONB, TEXT) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.lead_alert_minutes(JSONB, TEXT, INTEGER, INTEGER, INTEGER) FROM PUBLIC, anon, authenticated;

ALTER TABLE public.notifications DROP CONSTRAINT IF EXISTS notifications_type_check;
ALTER TABLE public.notifications ADD CONSTRAINT notifications_type_check CHECK (type IN (
  'lead_assigned', 'lead_unassigned', 'sla_nudge', 'sla_breach', 'follow_up_due', 'follow_up_overdue', 'document_viewed', 'plot_map',
  'lead_new', 'lead_uncontacted'));

-- Server-only bookkeeping for the reminders (the minute job writes it; nobody reads it through the API).
CREATE TABLE IF NOT EXISTS public.lead_contact_reminders (
  lead_id  UUID PRIMARY KEY REFERENCES public.leads_all(id) ON DELETE CASCADE,
  org_id   UUID NOT NULL REFERENCES public.organisations(id) ON DELETE CASCADE,
  assignee UUID NOT NULL,
  sent     INTEGER NOT NULL DEFAULT 0 CHECK (sent >= 0),
  last_at  TIMESTAMPTZ NOT NULL
);
ALTER TABLE public.lead_contact_reminders ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.lead_contact_reminders FROM PUBLIC, anon, authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.lead_contact_reminders TO service_role;
CREATE INDEX IF NOT EXISTS idx_lead_contact_reminders_org ON public.lead_contact_reminders (org_id);

-- Moving a follow-up re-arms its reminders.
CREATE OR REPLACE FUNCTION public.rearm_lead_task_reminders()
RETURNS TRIGGER LANGUAGE plpgsql SET search_path = pg_catalog, public, pg_temp AS $$
BEGIN
  IF NEW.due_at IS DISTINCT FROM OLD.due_at THEN
    NEW.reminded_at := NULL;
    NEW.overdue_alerted_at := NULL;
  END IF;
  RETURN NEW;
END;
$$;
REVOKE ALL ON FUNCTION public.rearm_lead_task_reminders() FROM PUBLIC, anon, authenticated;
DROP TRIGGER IF EXISTS trg_lead_tasks_reschedule ON public.lead_tasks;
CREATE TRIGGER trg_lead_tasks_reschedule BEFORE UPDATE OF due_at ON public.lead_tasks
  FOR EACH ROW EXECUTE FUNCTION public.rearm_lead_task_reminders();

-- New and reassigned leads.
CREATE OR REPLACE FUNCTION public.notify_lead_assignment()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public, pg_temp
AS $$
DECLARE
  v_project  TEXT;
  v_actor    UUID := public.auth_profile_id();   -- NULL for service-role / system writes
  v_title    TEXT;
  v_body     TEXT;
  v_notif    UUID;
  v_mgr      RECORD;
  v_routed   BOOLEAN;
  v_rich     BOOLEAN;
  v_assignee TEXT;
  v_source   TEXT := replace(NEW.source::text, '_', ' ');
  v_data     JSONB;
BEGIN
  SELECT p.name INTO v_project FROM public.projects p WHERE p.id = NEW.project_id;
  v_body := concat_ws(' · ', coalesce(v_project, 'No project'), v_source);
  -- New-lead alerts (Settings → Lead alerts): on unless the workspace turned them off.
  v_rich := TG_OP = 'INSERT' AND public.lead_alert_on((SELECT os.alerts FROM public.org_settings os WHERE os.org_id = NEW.org_id), 'newLead');
  v_data := jsonb_build_object('lead_id', NEW.id, 'project_id', NEW.project_id, 'source', NEW.source)
            || CASE WHEN v_rich THEN jsonb_build_object('event', 'new_lead') ELSE '{}'::jsonb END;

  -- (a) Someone now owns this lead → tell them (unless they assigned it to themselves)
  IF NEW.assigned_to IS NOT NULL
     AND (TG_OP = 'INSERT' OR NEW.assigned_to IS DISTINCT FROM OLD.assigned_to)
     AND NEW.assigned_to IS DISTINCT FROM v_actor THEN
    v_title := CASE WHEN TG_OP = 'INSERT' THEN 'New lead: ' ELSE 'Lead reassigned to you: ' END || left(NEW.name, 80);
    INSERT INTO public.notifications (org_id, recipient_profile_id, type, title, body, lead_id, data, dedupe_key)
    VALUES (NEW.org_id, NEW.assigned_to, 'lead_assigned', v_title, v_body, NEW.id, v_data,
            'lead_assigned:' || NEW.id || ':' || NEW.assigned_to || ':' || txid_current())
    ON CONFLICT (recipient_profile_id, dedupe_key) DO NOTHING
    RETURNING id INTO v_notif;
    IF v_notif IS NOT NULL THEN
      PERFORM public.enqueue_job('notification.dispatch', jsonb_build_object('notification_id', v_notif), NEW.org_id, now(), 'dispatch:' || v_notif);
    END IF;
  END IF;

  -- (b) Every new lead → the workspace's owners, admins and managers: who has it, or that nobody has it yet.
  IF v_rich THEN
    SELECT p.full_name INTO v_assignee FROM public.profiles p WHERE p.id = NEW.assigned_to;
    FOR v_mgr IN
      SELECT om.profile_id FROM public.org_members om
      WHERE om.org_id = NEW.org_id AND om.status = 'active' AND om.role IN ('owner', 'admin', 'manager')
        AND om.profile_id IS DISTINCT FROM NEW.assigned_to
        AND (NEW.assigned_to IS NULL OR om.profile_id IS DISTINCT FROM v_actor)
    LOOP
      IF NEW.assigned_to IS NULL THEN
        INSERT INTO public.notifications (org_id, recipient_profile_id, type, title, body, lead_id, data, dedupe_key)
        VALUES (NEW.org_id, v_mgr.profile_id, 'lead_unassigned', 'Unassigned lead: ' || left(NEW.name, 80), v_body, NEW.id,
                v_data, 'lead_unassigned:' || NEW.id)
        ON CONFLICT (recipient_profile_id, dedupe_key) DO NOTHING
        RETURNING id INTO v_notif;
      ELSE
        INSERT INTO public.notifications (org_id, recipient_profile_id, type, title, body, lead_id, data, dedupe_key)
        VALUES (NEW.org_id, v_mgr.profile_id, 'lead_new', 'New lead: ' || left(NEW.name, 80),
                concat_ws(' · ', v_body, 'Assigned to ' || coalesce(v_assignee, 'a teammate')), NEW.id,
                v_data || jsonb_build_object('assigned_to', NEW.assigned_to), 'lead_new:' || NEW.id)
        ON CONFLICT (recipient_profile_id, dedupe_key) DO NOTHING
        RETURNING id INTO v_notif;
      END IF;
      IF v_notif IS NOT NULL THEN
        PERFORM public.enqueue_job('notification.dispatch', jsonb_build_object('notification_id', v_notif), NEW.org_id, now(), 'dispatch:' || v_notif);
      END IF;
    END LOOP;

  -- (b') New-lead alerts off: as before, only a routed workspace's managers hear about a lead nobody got.
  ELSIF TG_OP = 'INSERT' AND NEW.assigned_to IS NULL THEN
    SELECT EXISTS (SELECT 1 FROM public.routing_rules r WHERE r.org_id = NEW.org_id AND r.is_active) INTO v_routed;
    IF v_routed THEN
      FOR v_mgr IN
        SELECT om.profile_id FROM public.org_members om
        WHERE om.org_id = NEW.org_id AND om.status = 'active' AND om.role IN ('owner', 'admin', 'manager')
      LOOP
        INSERT INTO public.notifications (org_id, recipient_profile_id, type, title, body, lead_id, data, dedupe_key)
        VALUES (NEW.org_id, v_mgr.profile_id, 'lead_unassigned', 'Unassigned lead: ' || left(NEW.name, 80), v_body, NEW.id,
                v_data, 'lead_unassigned:' || NEW.id)
        ON CONFLICT (recipient_profile_id, dedupe_key) DO NOTHING
        RETURNING id INTO v_notif;
        IF v_notif IS NOT NULL THEN
          PERFORM public.enqueue_job('notification.dispatch', jsonb_build_object('notification_id', v_notif), NEW.org_id, now(), 'dispatch:' || v_notif);
        END IF;
      END LOOP;
    END IF;
  END IF;

  RETURN NEW;
END;
$$;
REVOKE ALL ON FUNCTION public.notify_lead_assignment() FROM PUBLIC, anon, authenticated;

-- The minute job (from 20260055) with (c) following the workspace's settings and (e) the reminders.
CREATE OR REPLACE FUNCTION public.process_lead_responses(p_now timestamp with time zone DEFAULT now())
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'pg_catalog', 'public', 'pg_temp'
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
  v_reminded   INTEGER := 0;
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
                                  AND om.status = 'active' AND om.role NOT IN ('readonly', 'post_sales')
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

  -- (c) Follow-up reminder shortly before it is due: Settings → Notification defaults → Lead alerts decides whether and
  --     how many minutes before (default 5). A rescheduled follow-up is reminded again for its new time (the key
  --     carries the due time; trg_lead_tasks_reschedule clears reminded_at); a cancelled or done one never is.
  FOR r IN
    SELECT t.id, t.org_id, t.lead_id, t.assigned_to, t.kind, t.due_at, l.name
    FROM public.lead_tasks t
    JOIN public.leads l ON l.id = t.lead_id
    LEFT JOIN public.org_settings os ON os.org_id = t.org_id
    WHERE t.status = 'open' AND t.reminded_at IS NULL AND t.assigned_to IS NOT NULL
      AND public.lead_alert_on(os.alerts, 'followUp')
      AND t.due_at <= p_now + make_interval(mins => public.lead_alert_minutes(os.alerts, 'followUpMinutes', 5, 1, 60))
    ORDER BY t.due_at
    LIMIT 500
    FOR UPDATE OF t SKIP LOCKED
  LOOP
    PERFORM public.regrow_notify(r.org_id, r.assigned_to, 'follow_up_due',
      'Follow up: ' || left(r.name, 80),
      initcap(replace(r.kind, '_', ' ')) || ' at ' || to_char(r.due_at AT TIME ZONE 'Asia/Kolkata', 'HH12:MI AM'),
      r.lead_id, 'follow_up_due:' || r.id || ':' || floor(extract(epoch FROM r.due_at))::bigint);
    UPDATE public.lead_tasks SET reminded_at = p_now WHERE id = r.id;
    v_due := v_due + 1;
  END LOOP;

  -- (d) Follow-up 15 minutes overdue
  FOR r IN
    SELECT t.id, t.org_id, t.lead_id, t.assigned_to, t.due_at, l.name
    FROM public.lead_tasks t JOIN public.leads l ON l.id = t.lead_id
    WHERE t.status = 'open' AND t.overdue_alerted_at IS NULL AND t.assigned_to IS NOT NULL
      AND t.due_at <= p_now - interval '15 minutes'
    ORDER BY t.due_at
    LIMIT 500
    FOR UPDATE OF t SKIP LOCKED
  LOOP
    PERFORM public.regrow_notify(r.org_id, r.assigned_to, 'follow_up_overdue',
      'Overdue follow-up: ' || left(r.name, 80), 'This follow-up is past due',
      r.lead_id, 'follow_up_overdue:' || r.id || ':' || floor(extract(epoch FROM r.due_at))::bigint);
    UPDATE public.lead_tasks SET overdue_alerted_at = p_now WHERE id = r.id;
    v_overdue := v_overdue + 1;
  END LOOP;

  -- (e) Not contacted yet: remind the assignee every N minutes (default 10) until someone calls, messages or moves the
  --     lead on, for at most 24 hours after it was assigned. The count belongs to one assignee: when the lead is
  --     reassigned, the old owner's reminders stop and the new owner's start from their own assignment time.
  FOR r IN
    SELECT l.id, l.org_id, l.name, l.source, l.assigned_to, l.assigned_at,
           CASE WHEN cr.assignee = l.assigned_to THEN cr.sent ELSE 0 END AS sent
    FROM public.leads l
    LEFT JOIN public.org_settings os ON os.org_id = l.org_id
    LEFT JOIN public.lead_contact_reminders cr ON cr.lead_id = l.id
    WHERE l.first_action_at IS NULL AND l.status = 'new' AND l.assigned_to IS NOT NULL AND l.assigned_at IS NOT NULL
      AND NOT coalesce(l.custom_fields ? 'imported_at', false)
      AND public.lead_alert_on(os.alerts, 'uncontacted')
      AND p_now < l.assigned_at + interval '24 hours'
      AND p_now >= CASE WHEN cr.assignee = l.assigned_to THEN cr.last_at ELSE l.assigned_at END
                   + make_interval(mins => public.lead_alert_minutes(os.alerts, 'uncontactedMinutes', 10, 5, 60))
    ORDER BY l.assigned_at
    LIMIT 500
    FOR UPDATE OF l SKIP LOCKED
  LOOP
    -- The previous reminder about this lead is superseded: keep the inbox to one unread reminder per lead.
    UPDATE public.notifications SET read_at = p_now
     WHERE recipient_profile_id = r.assigned_to AND lead_id = r.id AND type = 'lead_uncontacted' AND read_at IS NULL;
    PERFORM public.regrow_notify(r.org_id, r.assigned_to, 'lead_uncontacted',
      'Still not contacted: ' || left(r.name, 80),
      concat_ws(' · ', replace(r.source::text, '_', ' '),
                'waiting ' || greatest(1, floor(extract(epoch FROM (p_now - r.assigned_at)) / 60))::int || ' min'),
      r.id, 'lead_uncontacted:' || r.id || ':' || r.assigned_to || ':' || (r.sent + 1));
    INSERT INTO public.lead_contact_reminders (lead_id, org_id, assignee, sent, last_at)
    VALUES (r.id, r.org_id, r.assigned_to, r.sent + 1, p_now)
    ON CONFLICT (lead_id) DO UPDATE SET assignee = EXCLUDED.assignee, sent = EXCLUDED.sent, last_at = EXCLUDED.last_at;
    v_reminded := v_reminded + 1;
  END LOOP;

  RETURN jsonb_build_object('nudged', v_nudged, 'breached', v_breached, 'reassigned', v_reassigned,
                            'follow_up_due', v_due, 'follow_up_overdue', v_overdue, 'uncontacted_reminders', v_reminded);
END;
$$;
REVOKE ALL ON FUNCTION public.process_lead_responses(TIMESTAMPTZ) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.process_lead_responses(TIMESTAMPTZ) TO service_role;

COMMIT;
