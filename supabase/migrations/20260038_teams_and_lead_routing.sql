-- Migration 20260038: teams_and_lead_routing
-- REGrow Lead Engine — M1-2 (teams), M1-3 (routing rules), M1-4 (router replaces legacy trigger per org),
-- M1-10 (Indian phone normalisation for stickiness/dedup).
--
-- Design
--   * Routing runs inside the existing BEFORE INSERT trigger slot (trigger_02_auto_assign_lead) so EVERY
--     lead creation path (API, CSV import, webhooks, portals) is routed in the same transaction as the insert.
--   * Organisations without an active routing rule keep the legacy behaviour (auto_assign_lead, fixed in 0037).
--   * Rule evaluation and member selection happen in one SECURITY DEFINER function that locks the target
--     team row (FOR UPDATE), so concurrent leads for the same team are distributed fairly and deterministically.
--   * Every routing outcome — including "no rule matched" and "nobody available" — is written to an
--     append-only decision log. lead_assignments (manual, manager-attributed, immutable) is left untouched.
--   * All new tables: RLS enabled, no anon access, writes restricted to owner/admin/manager, and
--     same-organisation integrity triggers. Only active memberships count (see 0037).

BEGIN;

-- ============================================================================
-- 1. Phone normalisation (India-first E.164)
-- ============================================================================
CREATE OR REPLACE FUNCTION public.normalize_phone_in(p_phone TEXT)
RETURNS TEXT
LANGUAGE plpgsql
IMMUTABLE
PARALLEL SAFE
SET search_path = pg_catalog, pg_temp
AS $$
DECLARE
  v_raw   TEXT := btrim(coalesce(p_phone, ''));
  v_plus  BOOLEAN := left(v_raw, 1) = '+' OR left(v_raw, 2) = '00';
  v_d     TEXT := regexp_replace(v_raw, '\D', '', 'g');
BEGIN
  IF v_d = '' THEN
    RETURN NULL;
  END IF;
  IF left(v_raw, 2) = '00' THEN
    v_d := substr(v_d, 3);                                  -- 00<cc><number>
  END IF;
  IF NOT v_plus THEN
    IF length(v_d) = 11 AND left(v_d, 1) = '0' THEN
      v_d := substr(v_d, 2);                                -- 0XXXXXXXXXX (Indian trunk prefix)
    END IF;
    IF length(v_d) = 10 AND left(v_d, 1) BETWEEN '6' AND '9' THEN
      RETURN '+91' || v_d;                                  -- Indian mobile without country code
    END IF;
    IF length(v_d) = 12 AND left(v_d, 2) = '91' AND substr(v_d, 3, 1) BETWEEN '6' AND '9' THEN
      RETURN '+' || v_d;                                    -- 91XXXXXXXXXX
    END IF;
  END IF;
  IF length(v_d) BETWEEN 8 AND 15 THEN
    RETURN '+' || v_d;                                      -- other international numbers
  END IF;
  RETURN NULL;                                              -- not a usable phone number
END;
$$;

ALTER TABLE public.leads
  ADD COLUMN IF NOT EXISTS phone_e164 TEXT GENERATED ALWAYS AS (public.normalize_phone_in(phone)) STORED;
CREATE INDEX IF NOT EXISTS idx_leads_org_phone_e164 ON public.leads (org_id, phone_e164, created_at DESC);

-- ============================================================================
-- 2. Teams, members, leave, rules, decision log
-- ============================================================================
CREATE TABLE IF NOT EXISTS public.teams (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id      UUID NOT NULL REFERENCES public.organisations(id) ON DELETE CASCADE,
  name        TEXT NOT NULL CHECK (length(btrim(name)) BETWEEN 1 AND 80),
  description TEXT,
  timezone    TEXT NOT NULL DEFAULT 'Asia/Kolkata',
  is_active   BOOLEAN NOT NULL DEFAULT true,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX IF NOT EXISTS uq_teams_org_name ON public.teams (org_id, lower(name));

CREATE TABLE IF NOT EXISTS public.team_members (
  id               UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id           UUID NOT NULL REFERENCES public.organisations(id) ON DELETE CASCADE,
  team_id          UUID NOT NULL REFERENCES public.teams(id) ON DELETE CASCADE,
  profile_id       UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  weight           INTEGER NOT NULL DEFAULT 1 CHECK (weight BETWEEN 1 AND 10),
  daily_capacity   INTEGER CHECK (daily_capacity IS NULL OR daily_capacity > 0),
  is_on_duty       BOOLEAN NOT NULL DEFAULT true,
  last_assigned_at TIMESTAMPTZ,
  created_at       TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at       TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (team_id, profile_id)
);
CREATE INDEX IF NOT EXISTS idx_team_members_org_profile ON public.team_members (org_id, profile_id);

CREATE TABLE IF NOT EXISTS public.member_leaves (
  id         UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id     UUID NOT NULL REFERENCES public.organisations(id) ON DELETE CASCADE,
  profile_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  starts_on  DATE NOT NULL,
  ends_on    DATE NOT NULL,
  reason     TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CHECK (ends_on >= starts_on)
);
CREATE INDEX IF NOT EXISTS idx_member_leaves_lookup ON public.member_leaves (org_id, profile_id, starts_on, ends_on);

CREATE TABLE IF NOT EXISTS public.routing_rules (
  id                   UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id               UUID NOT NULL REFERENCES public.organisations(id) ON DELETE CASCADE,
  name                 TEXT NOT NULL CHECK (length(btrim(name)) BETWEEN 1 AND 120),
  priority             INTEGER NOT NULL DEFAULT 100,
  is_active            BOOLEAN NOT NULL DEFAULT true,
  -- Empty array = "any". All non-empty criteria must match (AND); values within a criterion are OR.
  match_project_ids    UUID[] NOT NULL DEFAULT '{}',
  match_sources        public.lead_source[] NOT NULL DEFAULT '{}',
  match_connection_ids UUID[] NOT NULL DEFAULT '{}',
  match_campaign_ids   TEXT[] NOT NULL DEFAULT '{}',
  match_form_ids       TEXT[] NOT NULL DEFAULT '{}',
  team_id              UUID NOT NULL REFERENCES public.teams(id) ON DELETE RESTRICT,
  strategy             TEXT NOT NULL DEFAULT 'round_robin' CHECK (strategy IN ('round_robin', 'least_open')),
  sticky_days          INTEGER NOT NULL DEFAULT 90 CHECK (sticky_days BETWEEN 0 AND 365),
  created_at           TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at           TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_routing_rules_eval ON public.routing_rules (org_id, is_active, priority, created_at);

CREATE TABLE IF NOT EXISTS public.lead_routing_decisions (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id      UUID NOT NULL REFERENCES public.organisations(id) ON DELETE CASCADE,
  -- Deferred: the decision is written in the BEFORE INSERT trigger, before the lead row exists.
  lead_id     UUID NOT NULL REFERENCES public.leads(id) ON DELETE CASCADE DEFERRABLE INITIALLY DEFERRED,
  decided_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
  outcome     TEXT NOT NULL CHECK (outcome IN ('assigned', 'sticky', 'no_matching_rule', 'no_available_member')),
  assigned_to UUID REFERENCES public.profiles(id) ON DELETE SET NULL,
  rule_id     UUID REFERENCES public.routing_rules(id) ON DELETE SET NULL,
  team_id     UUID REFERENCES public.teams(id) ON DELETE SET NULL,
  strategy    TEXT,
  detail      JSONB NOT NULL DEFAULT '{}'::jsonb
);
CREATE INDEX IF NOT EXISTS idx_routing_decisions_lead ON public.lead_routing_decisions (lead_id, decided_at DESC);
CREATE INDEX IF NOT EXISTS idx_routing_decisions_assignee_day ON public.lead_routing_decisions (org_id, assigned_to, decided_at);

-- updated_at maintenance
DROP TRIGGER IF EXISTS teams_updated_at ON public.teams;
CREATE TRIGGER teams_updated_at BEFORE UPDATE ON public.teams FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
DROP TRIGGER IF EXISTS team_members_updated_at ON public.team_members;
CREATE TRIGGER team_members_updated_at BEFORE UPDATE ON public.team_members FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
DROP TRIGGER IF EXISTS routing_rules_updated_at ON public.routing_rules;
CREATE TRIGGER routing_rules_updated_at BEFORE UPDATE ON public.routing_rules FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- ============================================================================
-- 3. Same-organisation integrity for the new tables
-- ============================================================================
CREATE OR REPLACE FUNCTION public.enforce_routing_tenant_integrity()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public, pg_temp
AS $$
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
        AND om.status = 'active' AND om.role <> 'readonly'
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
$$;
REVOKE ALL ON FUNCTION public.enforce_routing_tenant_integrity() FROM PUBLIC, anon, authenticated;

DROP TRIGGER IF EXISTS trg_teams_routing_integrity ON public.teams;
CREATE TRIGGER trg_teams_routing_integrity BEFORE INSERT OR UPDATE ON public.teams
  FOR EACH ROW EXECUTE FUNCTION public.enforce_routing_tenant_integrity();
DROP TRIGGER IF EXISTS trg_team_members_routing_integrity ON public.team_members;
CREATE TRIGGER trg_team_members_routing_integrity BEFORE INSERT OR UPDATE ON public.team_members
  FOR EACH ROW EXECUTE FUNCTION public.enforce_routing_tenant_integrity();
DROP TRIGGER IF EXISTS trg_member_leaves_routing_integrity ON public.member_leaves;
CREATE TRIGGER trg_member_leaves_routing_integrity BEFORE INSERT OR UPDATE ON public.member_leaves
  FOR EACH ROW EXECUTE FUNCTION public.enforce_routing_tenant_integrity();
DROP TRIGGER IF EXISTS trg_routing_rules_routing_integrity ON public.routing_rules;
CREATE TRIGGER trg_routing_rules_routing_integrity BEFORE INSERT OR UPDATE ON public.routing_rules
  FOR EACH ROW EXECUTE FUNCTION public.enforce_routing_tenant_integrity();

-- Decision log is append-only (rows disappear only through their lead's deletion).
-- The ONLY permitted update is the database's own ON DELETE SET NULL cascade when a referenced rule, team
-- or profile is deleted: it runs nested inside the foreign-key trigger (pg_trigger_depth() > 1) and may only
-- null those references. Rule and team names are snapshotted in `detail`, so history stays readable.
CREATE OR REPLACE FUNCTION public.prevent_routing_decision_mutation()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public, pg_temp
AS $$
BEGIN
  IF TG_OP = 'UPDATE' THEN
    IF pg_trigger_depth() > 1
       AND NEW.id = OLD.id AND NEW.org_id = OLD.org_id AND NEW.lead_id = OLD.lead_id
       AND NEW.decided_at = OLD.decided_at AND NEW.outcome = OLD.outcome
       AND NEW.strategy IS NOT DISTINCT FROM OLD.strategy AND NEW.detail = OLD.detail
       AND (NEW.rule_id     IS NOT DISTINCT FROM OLD.rule_id     OR NEW.rule_id IS NULL)
       AND (NEW.team_id     IS NOT DISTINCT FROM OLD.team_id     OR NEW.team_id IS NULL)
       AND (NEW.assigned_to IS NOT DISTINCT FROM OLD.assigned_to OR NEW.assigned_to IS NULL) THEN
      RETURN NEW;
    END IF;
    RAISE EXCEPTION 'lead_routing_decisions is append-only' USING ERRCODE = 'check_violation';
  END IF;
  IF EXISTS (SELECT 1 FROM public.leads WHERE id = OLD.lead_id) THEN
    RAISE EXCEPTION 'lead_routing_decisions rows can only be removed with their lead' USING ERRCODE = 'check_violation';
  END IF;
  RETURN OLD;
END;
$$;
REVOKE ALL ON FUNCTION public.prevent_routing_decision_mutation() FROM PUBLIC, anon, authenticated;
DROP TRIGGER IF EXISTS trg_routing_decisions_append_only ON public.lead_routing_decisions;
CREATE TRIGGER trg_routing_decisions_append_only BEFORE UPDATE OR DELETE ON public.lead_routing_decisions
  FOR EACH ROW EXECUTE FUNCTION public.prevent_routing_decision_mutation();

-- ============================================================================
-- 4. The router
-- ============================================================================
-- Selects an assignee for a new lead and records the decision. Called only from the leads trigger.
CREATE OR REPLACE FUNCTION public.route_new_lead(
  p_org_id        UUID,
  p_lead_id       UUID,
  p_project_id    UUID,
  p_source        public.lead_source,
  p_connection_id UUID,
  p_campaign_id   TEXT,
  p_form_id       TEXT,
  p_phone         TEXT
)
RETURNS UUID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public, pg_temp
AS $$
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
     AND om.status = 'active' AND om.role <> 'readonly'
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
     AND om.status = 'active' AND om.role <> 'readonly'
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
$$;
REVOKE ALL ON FUNCTION public.route_new_lead(UUID, UUID, UUID, public.lead_source, UUID, TEXT, TEXT, TEXT) FROM PUBLIC, anon, authenticated;

-- Dispatcher in the existing trigger slot: rules engine when the org has an active rule, legacy otherwise.
CREATE OR REPLACE FUNCTION public.auto_assign_lead()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public, pg_temp
AS $$
DECLARE
  v_assignee_id UUID;
BEGIN
  IF NEW.assigned_to IS NOT NULL THEN
    RETURN NEW;                       -- explicit assignment (manual entry / import) is respected
  END IF;

  IF EXISTS (SELECT 1 FROM public.routing_rules r WHERE r.org_id = NEW.org_id AND r.is_active) THEN
    NEW.assigned_to := public.route_new_lead(
      NEW.org_id, NEW.id, NEW.project_id, NEW.source, NEW.connection_id, NEW.campaign_id, NEW.form_id, NEW.phone);
    RETURN NEW;
  END IF;

  -- Legacy distribution (active sales executives, fewest open leads)
  SELECT om.profile_id INTO v_assignee_id
  FROM public.org_members om
  WHERE om.org_id = NEW.org_id AND om.role = 'sales_exec' AND om.status = 'active'
  ORDER BY (
    SELECT count(*) FROM public.leads l
    WHERE l.assigned_to = om.profile_id AND l.org_id = NEW.org_id
      AND l.status NOT IN ('booked', 'lost', 'junk')
  ) ASC, om.joined_at ASC
  LIMIT 1;

  IF v_assignee_id IS NOT NULL THEN
    NEW.assigned_to := v_assignee_id;
  END IF;
  RETURN NEW;
END;
$$;
REVOKE ALL ON FUNCTION public.auto_assign_lead() FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.auto_assign_lead() TO postgres, service_role;

-- ============================================================================
-- 5. Row Level Security & privileges
-- ============================================================================
ALTER TABLE public.teams                  ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.team_members           ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.member_leaves          ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.routing_rules          ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.lead_routing_decisions ENABLE ROW LEVEL SECURITY;

REVOKE ALL ON public.teams, public.team_members, public.member_leaves, public.routing_rules, public.lead_routing_decisions
  FROM PUBLIC, anon, authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.teams, public.team_members, public.member_leaves, public.routing_rules TO authenticated;
GRANT SELECT ON public.lead_routing_decisions TO authenticated;
GRANT ALL ON public.teams, public.team_members, public.member_leaves, public.routing_rules, public.lead_routing_decisions TO service_role;

-- Read: any active member of the organisation (routing must be transparent to the sales team)
CREATE POLICY teams_select ON public.teams FOR SELECT TO authenticated USING (public.auth_is_member_of_org(org_id));
CREATE POLICY team_members_select ON public.team_members FOR SELECT TO authenticated USING (public.auth_is_member_of_org(org_id));
CREATE POLICY routing_rules_select ON public.routing_rules FOR SELECT TO authenticated USING (public.auth_is_member_of_org(org_id));
-- Leaves: managers see all; members see their own
CREATE POLICY member_leaves_select ON public.member_leaves FOR SELECT TO authenticated
  USING (public.auth_has_role_in_org(org_id, ARRAY['owner', 'admin', 'manager'])
         OR (profile_id = public.auth_profile_id() AND public.auth_is_member_of_org(org_id)));
-- Decisions: managers see all; members see decisions that assigned leads to them
CREATE POLICY lead_routing_decisions_select ON public.lead_routing_decisions FOR SELECT TO authenticated
  USING (public.auth_has_role_in_org(org_id, ARRAY['owner', 'admin', 'manager'])
         OR (assigned_to = public.auth_profile_id() AND public.auth_is_member_of_org(org_id)));

-- Write: owner / admin / manager only
CREATE POLICY teams_write ON public.teams FOR ALL TO authenticated
  USING (public.auth_has_role_in_org(org_id, ARRAY['owner', 'admin', 'manager']))
  WITH CHECK (public.auth_has_role_in_org(org_id, ARRAY['owner', 'admin', 'manager']));
CREATE POLICY team_members_write ON public.team_members FOR ALL TO authenticated
  USING (public.auth_has_role_in_org(org_id, ARRAY['owner', 'admin', 'manager']))
  WITH CHECK (public.auth_has_role_in_org(org_id, ARRAY['owner', 'admin', 'manager']));
CREATE POLICY member_leaves_write ON public.member_leaves FOR ALL TO authenticated
  USING (public.auth_has_role_in_org(org_id, ARRAY['owner', 'admin', 'manager']))
  WITH CHECK (public.auth_has_role_in_org(org_id, ARRAY['owner', 'admin', 'manager']));
CREATE POLICY routing_rules_write ON public.routing_rules FOR ALL TO authenticated
  USING (public.auth_has_role_in_org(org_id, ARRAY['owner', 'admin', 'manager']))
  WITH CHECK (public.auth_has_role_in_org(org_id, ARRAY['owner', 'admin', 'manager']));

COMMIT;
