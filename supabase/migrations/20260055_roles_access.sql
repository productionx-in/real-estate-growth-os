-- 20260055_roles_access.sql
-- What the two new roles (20260054) may do, enforced in the database as well as on the server.
--
-- 1. public.auth_shares_team(org, a, b): are two members in the same active team? A team lead's "team"
--    is everyone in a routing team they belong to.
-- 2. Row-level security (signed-in clients): team leads read their own and their teammates' leads, and
--    post-sales reads booked customers — leads, activities, assignment history and tasks. Existing policies
--    are untouched; these are additional policies scoped to the two roles.
-- 3. Assignment: post-sales and viewers are never given leads (by hand or by routing). A team lead may
--    assign only to themselves or a teammate, and only leads already in their team.
-- 4. Invitations may use the new roles; module entitlements are readable by them.
BEGIN;

-- ── 1. Team membership ──────────────────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.auth_shares_team(p_org UUID, p_a UUID, p_b UUID)
RETURNS BOOLEAN
LANGUAGE sql STABLE SECURITY DEFINER
SET search_path = pg_catalog, public, pg_temp
AS $$
  SELECT p_a IS NOT NULL AND p_b IS NOT NULL AND EXISTS (
    SELECT 1
    FROM public.team_members a
    JOIN public.team_members b ON b.team_id = a.team_id AND b.org_id = a.org_id
    JOIN public.teams t ON t.id = a.team_id AND t.is_active
    WHERE a.org_id = p_org AND a.profile_id = p_a AND b.profile_id = p_b
  );
$$;
REVOKE ALL ON FUNCTION public.auth_shares_team(UUID, UUID, UUID) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.auth_shares_team(UUID, UUID, UUID) TO authenticated, service_role;

-- Can the signed-in member see this lead under the two new roles? (Other roles keep their own policies.)
CREATE OR REPLACE FUNCTION public.auth_new_role_sees_lead(p_org UUID, p_assigned UUID, p_status public.lead_status)
RETURNS BOOLEAN
LANGUAGE sql STABLE SECURITY DEFINER
SET search_path = pg_catalog, public, pg_temp
AS $$
  SELECT
    (public.auth_has_role_in_org(p_org, ARRAY['team_lead'])
      AND (p_assigned = public.auth_profile_id() OR public.auth_shares_team(p_org, public.auth_profile_id(), p_assigned)))
    OR (public.auth_has_role_in_org(p_org, ARRAY['post_sales']) AND p_status = 'booked');
$$;
REVOKE ALL ON FUNCTION public.auth_new_role_sees_lead(UUID, UUID, public.lead_status) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.auth_new_role_sees_lead(UUID, UUID, public.lead_status) TO authenticated, service_role;

-- ── 2. Read policies ────────────────────────────────────────────────────────────────────────────
DROP POLICY IF EXISTS team_lead_post_sales_read_leads ON public.leads;
CREATE POLICY team_lead_post_sales_read_leads ON public.leads FOR SELECT TO authenticated
  USING (public.auth_new_role_sees_lead(org_id, assigned_to, status));

DROP POLICY IF EXISTS team_lead_post_sales_read_activities ON public.lead_activities;
CREATE POLICY team_lead_post_sales_read_activities ON public.lead_activities FOR SELECT TO authenticated
  USING (EXISTS (SELECT 1 FROM public.leads l WHERE l.id = lead_activities.lead_id
                 AND public.auth_new_role_sees_lead(l.org_id, l.assigned_to, l.status)));

DROP POLICY IF EXISTS team_lead_post_sales_read_assignments ON public.lead_assignments;
CREATE POLICY team_lead_post_sales_read_assignments ON public.lead_assignments FOR SELECT TO authenticated
  USING (EXISTS (SELECT 1 FROM public.leads l WHERE l.id = lead_assignments.lead_id
                 AND public.auth_new_role_sees_lead(l.org_id, l.assigned_to, l.status)));

DROP POLICY IF EXISTS team_lead_post_sales_read_tasks ON public.lead_tasks;
CREATE POLICY team_lead_post_sales_read_tasks ON public.lead_tasks FOR SELECT TO authenticated
  USING (EXISTS (SELECT 1 FROM public.leads l WHERE l.id = lead_tasks.lead_id
                 AND public.auth_new_role_sees_lead(l.org_id, l.assigned_to, l.status)));

DROP POLICY IF EXISTS org_modules_member_read ON public.org_module_entitlements;
CREATE POLICY org_modules_member_read ON public.org_module_entitlements FOR SELECT TO authenticated
  USING (public.auth_has_role_in_org(org_id, ARRAY['owner', 'admin', 'manager', 'team_lead', 'sales_exec', 'post_sales', 'readonly']));

-- Writes through a signed-in client (status changes, notes): a team lead on their own or a teammate's lead,
-- post-sales on a booked customer. Reassignment stays governed by check_lead_assignment_input.
CREATE OR REPLACE FUNCTION public.auth_new_role_works_lead(p_org UUID, p_assigned UUID, p_status public.lead_status)
RETURNS BOOLEAN
LANGUAGE sql STABLE SECURITY DEFINER
SET search_path = pg_catalog, public, pg_temp
AS $$
  SELECT public.auth_new_role_sees_lead(p_org, p_assigned, p_status);
$$;
REVOKE ALL ON FUNCTION public.auth_new_role_works_lead(UUID, UUID, public.lead_status) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.auth_new_role_works_lead(UUID, UUID, public.lead_status) TO authenticated, service_role;

DROP POLICY IF EXISTS team_lead_post_sales_update_leads ON public.leads;
CREATE POLICY team_lead_post_sales_update_leads ON public.leads FOR UPDATE TO authenticated
  USING (public.auth_new_role_works_lead(org_id, assigned_to, status))
  WITH CHECK (public.auth_has_role_in_org(org_id, ARRAY['team_lead', 'post_sales']));

DROP POLICY IF EXISTS team_lead_post_sales_insert_activities ON public.lead_activities;
CREATE POLICY team_lead_post_sales_insert_activities ON public.lead_activities FOR INSERT TO authenticated
  WITH CHECK (actor_id = public.auth_profile_id() AND EXISTS (
    SELECT 1 FROM public.leads l WHERE l.id = lead_activities.lead_id
      AND public.auth_new_role_works_lead(l.org_id, l.assigned_to, l.status)));

-- ── 3. Assignment rules ─────────────────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.check_lead_assignment_input()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'pg_catalog', 'public', 'pg_temp'
AS $function$
DECLARE
  v_caller_role public.member_role;
  v_me UUID;
BEGIN
  -- Strict engine-level immutability: block changing org_id on UPDATE
  IF TG_OP = 'UPDATE' AND OLD.org_id IS DISTINCT FROM NEW.org_id THEN
    RAISE EXCEPTION 'Lead organisation ownership is immutable (attempted change from % to %)',
      OLD.org_id, NEW.org_id
      USING ERRCODE = 'check_violation';
  END IF;

  IF auth.uid() IS NOT NULL THEN
    v_me := public.auth_profile_id();
    SELECT om.role INTO v_caller_role
    FROM public.org_members om
    WHERE om.org_id = NEW.org_id
      AND om.profile_id = v_me;

    IF v_caller_role IN ('sales_exec', 'post_sales', 'readonly') THEN
      IF TG_OP = 'INSERT' AND NEW.assigned_to IS NOT NULL AND NEW.assigned_to IS DISTINCT FROM v_me THEN
        RAISE EXCEPTION 'Sales executives can only assign leads to themselves on creation, or leave unassigned for automatic distribution'
          USING ERRCODE = 'insufficient_privilege';
      END IF;

      IF TG_OP = 'UPDATE' AND NEW.assigned_to IS DISTINCT FROM OLD.assigned_to THEN
        RAISE EXCEPTION 'Sales executives are not permitted to reassign leads'
          USING ERRCODE = 'insufficient_privilege';
      END IF;
    ELSIF v_caller_role = 'team_lead' THEN
      -- Only within the team: the new owner must be them or a teammate, and (on reassignment) the lead must
      -- already be theirs, a teammate's, or unassigned.
      IF NEW.assigned_to IS NOT NULL AND NEW.assigned_to IS DISTINCT FROM v_me
         AND NOT public.auth_shares_team(NEW.org_id, v_me, NEW.assigned_to)
         AND (TG_OP = 'INSERT' OR NEW.assigned_to IS DISTINCT FROM OLD.assigned_to) THEN
        RAISE EXCEPTION 'Team leads can only assign leads within their team'
          USING ERRCODE = 'insufficient_privilege';
      END IF;
      IF TG_OP = 'UPDATE' AND NEW.assigned_to IS DISTINCT FROM OLD.assigned_to
         AND OLD.assigned_to IS NOT NULL AND OLD.assigned_to IS DISTINCT FROM v_me
         AND NOT public.auth_shares_team(NEW.org_id, v_me, OLD.assigned_to) THEN
        RAISE EXCEPTION 'Team leads can only reassign their team''s leads'
          USING ERRCODE = 'insufficient_privilege';
      END IF;
    END IF;
  END IF;

  RETURN NEW;
END;
$function$;

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
  END IF;
  RETURN NEW;
END;
$function$;

CREATE OR REPLACE FUNCTION public.check_lead_assignment_integrity()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'pg_catalog', 'public', 'pg_temp'
AS $function$
DECLARE
  v_lead_org UUID;
  v_assignee_role public.member_role;
  v_assigner_role public.member_role;
BEGIN
  -- Block UPDATE unconditionally
  IF TG_OP = 'UPDATE' THEN
    RAISE EXCEPTION 'lead_assignments records are immutable: UPDATE operations are prohibited'
      USING ERRCODE = 'check_violation';
  END IF;

  -- Block direct DELETE; allow parent lead cascading DELETE
  IF TG_OP = 'DELETE' THEN
    IF EXISTS (SELECT 1 FROM public.leads WHERE id = OLD.lead_id) THEN
      RAISE EXCEPTION 'Direct deletion of lead_assignments records is prohibited. Records can only be removed via parent lead deletion.'
        USING ERRCODE = 'check_violation';
    END IF;
    RETURN OLD;
  END IF;

  -- INSERT validation
  SELECT l.org_id INTO v_lead_org FROM public.leads l WHERE l.id = NEW.lead_id;
  IF v_lead_org IS NULL THEN
    RAISE EXCEPTION 'Lead % not found', NEW.lead_id USING ERRCODE = 'foreign_key_violation';
  END IF;

  SELECT om.role INTO v_assignee_role FROM public.org_members om WHERE om.org_id = v_lead_org AND om.profile_id = NEW.assigned_to;
  IF v_assignee_role IS NULL THEN
    RAISE EXCEPTION 'Assignee % is not an active member of organisation %', NEW.assigned_to, v_lead_org USING ERRCODE = 'integrity_constraint_violation';
  END IF;
  IF v_assignee_role IN ('readonly', 'post_sales') THEN
    RAISE EXCEPTION 'Assignee % cannot be assigned leads (%)', NEW.assigned_to, v_assignee_role USING ERRCODE = 'check_violation';
  END IF;

  SELECT om.role INTO v_assigner_role FROM public.org_members om WHERE om.org_id = v_lead_org AND om.profile_id = NEW.assigned_by;
  IF v_assigner_role IN ('owner', 'admin', 'manager') THEN
    RETURN NEW;
  END IF;
  IF v_assigner_role = 'team_lead'
     AND (NEW.assigned_to = NEW.assigned_by OR public.auth_shares_team(v_lead_org, NEW.assigned_by, NEW.assigned_to)) THEN
    RETURN NEW;
  END IF;
  RAISE EXCEPTION 'Assigner % lacks management role in organisation %', NEW.assigned_by, v_lead_org USING ERRCODE = 'insufficient_privilege';
END;
$function$;

DROP POLICY IF EXISTS team_leads_insert_team_assignments ON public.lead_assignments;
CREATE POLICY team_leads_insert_team_assignments ON public.lead_assignments FOR INSERT TO authenticated
  WITH CHECK (assigned_by = public.auth_profile_id() AND EXISTS (
    SELECT 1 FROM public.leads l WHERE l.id = lead_assignments.lead_id
      AND public.auth_has_role_in_org(l.org_id, ARRAY['team_lead'])
      AND (lead_assignments.assigned_to = public.auth_profile_id()
           OR public.auth_shares_team(l.org_id, public.auth_profile_id(), lead_assignments.assigned_to))));

-- Routing never hands a lead to post-sales or a viewer (was: anyone but viewers).
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
     AND om.status = 'active' AND om.role NOT IN ('readonly', 'post_sales')
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
     AND om.status = 'active' AND om.role NOT IN ('readonly', 'post_sales')
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
$function$

;

CREATE OR REPLACE FUNCTION public.process_lead_responses(p_now timestamp with time zone DEFAULT now())
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'pg_catalog', 'public', 'pg_temp'
AS $function$
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
$function$

;

CREATE OR REPLACE FUNCTION public.enforce_routing_tenant_integrity()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'pg_catalog', 'public', 'pg_temp'
AS $function$
DECLARE
  v_bad INTEGER;
BEGIN
  IF TG_OP = 'UPDATE' AND OLD.org_id IS DISTINCT FROM NEW.org_id THEN
    RAISE EXCEPTION 'routing_integrity: %.org_id is immutable', TG_TABLE_NAME USING ERRCODE = 'check_violation';
  END IF;

  IF TG_TABLE_NAME = 'team_members' THEN
    IF NOT EXISTS (SELECT 1 FROM public.teams t WHERE t.id = NEW.team_id AND t.org_id = NEW.org_id) THEN
      RAISE EXCEPTION 'routing_integrity: team is not valid for this organisation' USING ERRCODE = 'check_violation';
    END IF;
    IF (TG_OP = 'INSERT' OR NEW.profile_id IS DISTINCT FROM OLD.profile_id) AND NOT EXISTS (
      SELECT 1 FROM public.org_members om
      WHERE om.org_id = NEW.org_id AND om.profile_id = NEW.profile_id
        AND om.status = 'active' AND om.role NOT IN ('readonly', 'post_sales')
    ) THEN
      RAISE EXCEPTION 'routing_integrity: team member must be an active, non-readonly member of this organisation' USING ERRCODE = 'check_violation';
    END IF;

  ELSIF TG_TABLE_NAME = 'member_leaves' THEN
    IF NOT EXISTS (SELECT 1 FROM public.org_members om WHERE om.org_id = NEW.org_id AND om.profile_id = NEW.profile_id) THEN
      RAISE EXCEPTION 'routing_integrity: leave must belong to a member of this organisation' USING ERRCODE = 'check_violation';
    END IF;

  ELSIF TG_TABLE_NAME = 'routing_rules' THEN
    IF NOT EXISTS (SELECT 1 FROM public.teams t WHERE t.id = NEW.team_id AND t.org_id = NEW.org_id) THEN
      RAISE EXCEPTION 'routing_integrity: team is not valid for this organisation' USING ERRCODE = 'check_violation';
    END IF;
    SELECT count(*) INTO v_bad FROM unnest(NEW.match_project_ids) pid
      WHERE NOT EXISTS (SELECT 1 FROM public.projects p WHERE p.id = pid AND p.org_id = NEW.org_id);
    IF v_bad > 0 THEN
      RAISE EXCEPTION 'routing_integrity: match_project_ids contains a project that is not valid for this organisation' USING ERRCODE = 'check_violation';
    END IF;
    SELECT count(*) INTO v_bad FROM unnest(NEW.match_connection_ids) cid
      WHERE NOT EXISTS (SELECT 1 FROM public.integration_connections c WHERE c.id = cid AND c.org_id = NEW.org_id);
    IF v_bad > 0 THEN
      RAISE EXCEPTION 'routing_integrity: match_connection_ids contains a connection that is not valid for this organisation' USING ERRCODE = 'check_violation';
    END IF;
  END IF;

  RETURN NEW;
END;
$function$

;

-- Invitations may use the new roles (owner still cannot be invited).
CREATE OR REPLACE FUNCTION public.reserve_employee_seat_atomic(p_org_id uuid, p_email text, p_role member_role, p_expires_at timestamp with time zone)
 RETURNS TABLE(success boolean, invitation_id uuid, raw_token text, error_message text)
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'extensions', 'pg_temp'
AS $function$
DECLARE
  v_caller_auth_id UUID;
  v_caller_profile_id UUID;
  v_caller_role public.member_role;
  v_sub RECORD;
  v_total_allowed_seats INTEGER;
  v_purchased_additional_seats INTEGER;
  v_active_members INTEGER;
  v_pending_invites INTEGER;
  v_new_invitation_id UUID;
  v_raw_token TEXT;
  v_token_hash TEXT;
BEGIN
  -- 1. Derive caller identity strictly from authenticated auth.uid()
  v_caller_auth_id := auth.uid();
  IF v_caller_auth_id IS NULL THEN
    RETURN QUERY SELECT false, NULL::UUID, NULL::TEXT, 'Unauthorised: Authentication required.'::TEXT;
    RETURN;
  END IF;

  -- 2. Verify caller is an ACTIVE member of the specified organisation and resolve profile
  SELECT p.id, om.role INTO v_caller_profile_id, v_caller_role
  FROM public.profiles p
  JOIN public.org_members om ON om.profile_id = p.id
  WHERE p.auth_user_id = v_caller_auth_id
    AND om.org_id = p_org_id
    AND om.status = 'active';

  IF NOT FOUND THEN
    RETURN QUERY SELECT false, NULL::UUID, NULL::TEXT, 'Forbidden: Caller is not an active member of this organisation.'::TEXT;
    RETURN;
  END IF;

  -- 3. Verify invitation authority (only owner or admin can invite)
  IF v_caller_role NOT IN ('owner'::public.member_role, 'admin'::public.member_role) THEN
    RETURN QUERY SELECT false, NULL::UUID, NULL::TEXT, 'Forbidden: Only owners and admins can invite team members.'::TEXT;
    RETURN;
  END IF;

  -- 4. Reject assigning owner role through ordinary employee invitation
  -- The owner role cannot be assigned via employee invitation. Only non-owner roles are permitted.
  IF p_role = 'owner'::public.member_role THEN
    RETURN QUERY SELECT false, NULL::UUID, NULL::TEXT, 'Forbidden: The owner role cannot be assigned via employee invitation.'::TEXT;
    RETURN;
  END IF;

  -- 5. Validate the requested role against approved invitation roles
  IF p_role NOT IN ('admin'::public.member_role, 'manager'::public.member_role, 'team_lead'::public.member_role, 'sales_exec'::public.member_role, 'post_sales'::public.member_role, 'readonly'::public.member_role) THEN
    RETURN QUERY SELECT false, NULL::UUID, NULL::TEXT, 'Invalid role: Requested role is not an approved member invitation role.'::TEXT;
    RETURN;
  END IF;

  -- 6. CRITICAL CONCURRENCY SAFEGUARD: Lock subscription row FIRST to serialize reservations
  SELECT s.id, s.status, s.is_read_only, s.included_seats, s.additional_seats
  INTO v_sub
  FROM public.org_subscriptions s
  WHERE s.org_id = p_org_id
  FOR UPDATE OF s;

  IF NOT FOUND THEN
    RETURN QUERY SELECT false, NULL::UUID, NULL::TEXT, 'No active subscription found for organisation.'::TEXT;
    RETURN;
  END IF;

  IF v_sub.is_read_only THEN
    RETURN QUERY SELECT false, NULL::UUID, NULL::TEXT, 'Workspace is locked in read-only mode due to expired subscription.'::TEXT;
    RETURN;
  END IF;

  IF v_sub.status NOT IN ('active', 'trial') THEN
    RETURN QUERY SELECT false, NULL::UUID, NULL::TEXT, 'Subscription status does not permit adding new members.'::TEXT;
    RETURN;
  END IF;

  -- 7. RECHECK UNDER LOCK: Verify no existing active pending invitation for this email in this org
  IF EXISTS (
    SELECT 1 FROM public.org_invitations
    WHERE org_id = p_org_id
      AND lower(email) = lower(trim(p_email))
      AND status = 'pending'
      AND expires_at > now()
  ) THEN
    RETURN QUERY SELECT false, NULL::UUID, NULL::TEXT, 'An active pending invitation already exists for this email address.'::TEXT;
    RETURN;
  END IF;

  -- 8. RECHECK UNDER LOCK: Verify target email is not already an active member in this org
  IF EXISTS (
    SELECT 1 FROM public.org_members om
    JOIN public.profiles p ON p.id = om.profile_id
    JOIN auth.users u ON u.id = p.auth_user_id
    WHERE om.org_id = p_org_id
      AND om.status = 'active'
      AND lower(u.email) = lower(trim(p_email))
  ) THEN
    RETURN QUERY SELECT false, NULL::UUID, NULL::TEXT, 'User is already an active member of this organisation.'::TEXT;
    RETURN;
  END IF;

  -- 9. Compute total seats preserving organisation-specific contract & add-ons
  SELECT COALESCE(SUM(seats_added), 0)::INTEGER INTO v_purchased_additional_seats
  FROM public.org_subscription_seat_purchases
  WHERE org_id = p_org_id AND status = 'active';

  v_total_allowed_seats := v_sub.included_seats + v_sub.additional_seats + v_purchased_additional_seats;

  -- 10. Count active members and unexpired pending invitations under lock
  SELECT COUNT(*)::INTEGER INTO v_active_members
  FROM public.org_members
  WHERE org_id = p_org_id AND status = 'active';

  SELECT COUNT(*)::INTEGER INTO v_pending_invites
  FROM public.org_invitations
  WHERE org_id = p_org_id AND status = 'pending' AND expires_at > now();

  -- 11. Assert capacity
  IF (v_active_members + v_pending_invites + 1) > v_total_allowed_seats THEN
    RETURN QUERY SELECT false, NULL::UUID, NULL::TEXT,
      format('Seat limit reached (%s/%s seats). Please purchase additional seats before inviting staff.',
             (v_active_members + v_pending_invites), v_total_allowed_seats)::TEXT;
    RETURN;
  END IF;

  -- 12. Cryptographically Secure Server-Side Token Generation
  v_raw_token := encode(gen_random_bytes(32), 'hex');
  v_token_hash := encode(digest(v_raw_token, 'sha256'), 'hex');

  -- 13. Atomically insert invitation reservation
  INSERT INTO public.org_invitations (
    org_id, invited_by, email, role, token_hash, status, expires_at
  ) VALUES (
    p_org_id, v_caller_profile_id, lower(trim(p_email)), p_role, v_token_hash, 'pending', p_expires_at
  ) RETURNING id INTO v_new_invitation_id;

  RETURN QUERY SELECT true, v_new_invitation_id, v_raw_token, NULL::TEXT;
END;
$function$

;

COMMIT;
