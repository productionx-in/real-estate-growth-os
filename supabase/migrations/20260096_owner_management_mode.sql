-- 20260096_owner_management_mode.sql
-- Owners manage; they sell only if the workspace says so (Settings → Sales structure).
--   * org_settings.sales: { "ownerSells": bool, "teamsEnabled": bool }. Read by the app and by the rule below.
--   * member_can_take_leads(org, profile, role): the one rule for "may this member be given leads?" — not read-only
--     or post-sales, and not an owner while ownerSells is off. New-lead routing (including returning buyers), the
--     slow-response reassignment and the check on every change of assignee use it. route_new_lead (20260055) and
--     process_lead_responses (20260093) are copied unchanged except for that one condition.
--   * Backfill: existing workspaces keep today's behaviour — ownerSells starts on only where an owner already holds
--     open leads; teamsEnabled starts on where the workspace already has an active team.
-- Leads an owner already holds stay with them. Additive; nothing is removed.

BEGIN;

ALTER TABLE public.org_settings
  ADD COLUMN IF NOT EXISTS sales JSONB NOT NULL DEFAULT '{}'::jsonb CHECK (jsonb_typeof(sales) = 'object' AND pg_column_size(sales) < 2048);

CREATE OR REPLACE FUNCTION public.member_can_take_leads(p_org UUID, p_profile UUID, p_role public.member_role)
RETURNS BOOLEAN LANGUAGE sql STABLE SECURITY DEFINER SET search_path = pg_catalog, public, pg_temp AS $$
  SELECT p_role NOT IN ('readonly', 'post_sales')
     AND (p_role <> 'owner' OR coalesce((SELECT (s.sales ->> 'ownerSells')::boolean FROM public.org_settings s WHERE s.org_id = p_org), true))
$$;
REVOKE ALL ON FUNCTION public.member_can_take_leads(UUID, UUID, public.member_role) FROM PUBLIC, anon, authenticated;

CREATE OR REPLACE FUNCTION public.route_new_lead(p_org_id uuid, p_lead_id uuid, p_project_id uuid, p_source lead_source, p_connection_id uuid, p_campaign_id text, p_form_id text, p_phone text)
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'pg_catalog', 'public', 'pg_temp'
AS $function$
DECLARE
  v_rule        public.routing_rules%ROWTYPE;
  v_team        public.teams%ROWTYPE;
  v_phone       TEXT := public.normalize_phone_in(p_phone);
  v_sticky      UUID;
  v_assignee    UUID;
  v_day_start   TIMESTAMPTZ;
  v_local_date  DATE;
  v_candidates  INTEGER;
BEGIN
  -- 4a. First active rule (lowest priority number, then oldest) whose criteria all match
  SELECT r.* INTO v_rule
  FROM public.routing_rules r
  JOIN public.teams t ON t.id = r.team_id AND t.is_active
  WHERE r.org_id = p_org_id
    AND r.is_active
    AND (cardinality(r.match_project_ids)    = 0 OR p_project_id    = ANY (r.match_project_ids))
    AND (cardinality(r.match_sources)        = 0 OR p_source        = ANY (r.match_sources))
    AND (cardinality(r.match_connection_ids) = 0 OR p_connection_id = ANY (r.match_connection_ids))
    AND (cardinality(r.match_campaign_ids)   = 0 OR p_campaign_id   = ANY (r.match_campaign_ids))
    AND (cardinality(r.match_form_ids)       = 0 OR p_form_id       = ANY (r.match_form_ids))
  ORDER BY r.priority ASC, r.created_at ASC
  LIMIT 1;

  IF NOT FOUND THEN
    INSERT INTO public.lead_routing_decisions (org_id, lead_id, outcome, detail)
    VALUES (p_org_id, p_lead_id, 'no_matching_rule',
            jsonb_build_object('project_id', p_project_id, 'source', p_source));
    RETURN NULL;
  END IF;

  -- 4b. Serialise all routing into this team (fair round robin under concurrency)
  SELECT * INTO v_team FROM public.teams WHERE id = v_rule.team_id FOR UPDATE;
  v_local_date := (now() AT TIME ZONE v_team.timezone)::date;
  v_day_start  := (v_local_date::timestamp AT TIME ZONE v_team.timezone);

  -- 4c. Stickiness: a returning buyer goes back to their previous owner while that owner is active
  IF v_rule.sticky_days > 0 AND v_phone IS NOT NULL THEN
    SELECT l.assigned_to INTO v_sticky
    FROM public.leads l
    JOIN public.org_members om
      ON om.org_id = l.org_id AND om.profile_id = l.assigned_to
     AND om.status = 'active' AND public.member_can_take_leads(om.org_id, om.profile_id, om.role)
    WHERE l.org_id = p_org_id
      AND l.phone_e164 = v_phone
      AND l.id <> p_lead_id
      AND l.assigned_to IS NOT NULL
      AND l.created_at >= now() - make_interval(days => v_rule.sticky_days)
    ORDER BY l.created_at DESC
    LIMIT 1;

    IF v_sticky IS NOT NULL THEN
      INSERT INTO public.lead_routing_decisions (org_id, lead_id, outcome, assigned_to, rule_id, team_id, strategy, detail)
      VALUES (p_org_id, p_lead_id, 'sticky', v_sticky, v_rule.id, v_team.id, 'sticky',
              jsonb_build_object('sticky_days', v_rule.sticky_days, 'rule_name', v_rule.name, 'team_name', v_team.name));
      UPDATE public.team_members SET last_assigned_at = now() WHERE team_id = v_team.id AND profile_id = v_sticky;
      RETURN v_sticky;
    END IF;
  END IF;

  -- 4d. Eligible members: on duty, active non-readonly membership, not on leave today, under daily capacity
  WITH eligible AS (
    SELECT tm.profile_id, tm.weight, tm.daily_capacity, tm.last_assigned_at,
           (SELECT count(*) FROM public.lead_routing_decisions d
             WHERE d.org_id = p_org_id AND d.assigned_to = tm.profile_id
               AND d.outcome IN ('assigned', 'sticky') AND d.decided_at >= v_day_start) AS assigned_today,
           (SELECT count(*) FROM public.leads l
             WHERE l.org_id = p_org_id AND l.assigned_to = tm.profile_id
               AND l.status NOT IN ('booked', 'lost', 'junk')) AS open_leads
    FROM public.team_members tm
    JOIN public.org_members om
      ON om.org_id = tm.org_id AND om.profile_id = tm.profile_id
     AND om.status = 'active' AND public.member_can_take_leads(om.org_id, om.profile_id, om.role)
    WHERE tm.team_id = v_team.id
      AND tm.is_on_duty
      AND NOT EXISTS (
        SELECT 1 FROM public.member_leaves ml
        WHERE ml.org_id = p_org_id AND ml.profile_id = tm.profile_id
          AND v_local_date BETWEEN ml.starts_on AND ml.ends_on)
  )
  SELECT e.profile_id, (SELECT count(*) FROM eligible WHERE daily_capacity IS NULL OR assigned_today < daily_capacity)
  INTO v_assignee, v_candidates
  FROM eligible e
  WHERE e.daily_capacity IS NULL OR e.assigned_today < e.daily_capacity
  ORDER BY
    CASE WHEN v_rule.strategy = 'least_open' THEN e.open_leads::numeric
         ELSE e.assigned_today::numeric / e.weight END ASC,
    e.last_assigned_at ASC NULLS FIRST,
    e.profile_id ASC
  LIMIT 1;

  IF v_assignee IS NULL THEN
    INSERT INTO public.lead_routing_decisions (org_id, lead_id, outcome, rule_id, team_id, strategy, detail)
    VALUES (p_org_id, p_lead_id, 'no_available_member', v_rule.id, v_team.id, v_rule.strategy,
            jsonb_build_object('local_date', v_local_date, 'rule_name', v_rule.name, 'team_name', v_team.name));
    RETURN NULL;
  END IF;

  UPDATE public.team_members SET last_assigned_at = now() WHERE team_id = v_team.id AND profile_id = v_assignee;
  INSERT INTO public.lead_routing_decisions (org_id, lead_id, outcome, assigned_to, rule_id, team_id, strategy, detail)
  VALUES (p_org_id, p_lead_id, 'assigned', v_assignee, v_rule.id, v_team.id, v_rule.strategy,
          jsonb_build_object('eligible_members', v_candidates, 'rule_name', v_rule.name, 'team_name', v_team.name));
  RETURN v_assignee;
END;
$function$;

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
                                  AND om.status = 'active' AND public.member_can_take_leads(om.org_id, om.profile_id, om.role)
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

CREATE OR REPLACE FUNCTION public.validate_lead_assigned_to()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'pg_catalog', 'public', 'pg_temp'
AS $function$
DECLARE
  v_assignee_role public.member_role;
BEGIN
  IF NEW.assigned_to IS NOT NULL
     AND (TG_OP = 'INSERT' OR NEW.assigned_to IS DISTINCT FROM OLD.assigned_to OR NEW.org_id IS DISTINCT FROM OLD.org_id) THEN
    SELECT om.role INTO v_assignee_role
    FROM public.org_members om
    WHERE om.org_id = NEW.org_id
      AND om.profile_id = NEW.assigned_to
      AND om.status = 'active';

    IF v_assignee_role IS NULL THEN
      RAISE EXCEPTION 'Assignment rejected: assignee is not an active member of this organisation'
        USING ERRCODE = 'integrity_constraint_violation';
    END IF;

    IF v_assignee_role IN ('readonly', 'post_sales') THEN
      RAISE EXCEPTION 'Assignment rejected: % members cannot be assigned leads', v_assignee_role
        USING ERRCODE = 'check_violation';
    END IF;

    IF NOT public.member_can_take_leads(NEW.org_id, NEW.assigned_to, v_assignee_role) THEN
      RAISE EXCEPTION 'Assignment rejected: the owner does not take leads in this workspace (Settings, Sales structure)'
        USING ERRCODE = 'check_violation';
    END IF;
  END IF;
  RETURN NEW;
END;
$function$;

-- Backfill: existing workspaces keep today's behaviour.
INSERT INTO public.org_settings (org_id, sales)
SELECT o.id, jsonb_build_object(
  'ownerSells', EXISTS (SELECT 1 FROM public.leads_all l JOIN public.org_members om ON om.org_id = l.org_id AND om.profile_id = l.assigned_to AND om.role = 'owner'
                        WHERE l.org_id = o.id AND l.deleted_at IS NULL AND l.status NOT IN ('booked', 'lost', 'junk')),
  'teamsEnabled', EXISTS (SELECT 1 FROM public.teams t WHERE t.org_id = o.id AND t.is_active))
FROM public.organisations o
ON CONFLICT (org_id) DO UPDATE SET sales = EXCLUDED.sales
  WHERE public.org_settings.sales = '{}'::jsonb;

COMMIT;
