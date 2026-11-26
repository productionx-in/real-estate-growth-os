-- 20260100_rewards.sql
-- Rewards and incentives (docs/product/SALES_ECOSYSTEM_AUDIT.md §5), on the performance ledger (20260094, 20260098).
--
--   * reward_programs: what a workspace offers — a gadget, a trip, a gift card or voucher, a cash bonus, or anything
--     else — to people or teams, with a budget, who is eligible (roles, teams), a goal and a deadline. Two kinds of
--     goal: "reach" (anyone eligible who reaches an amount of a metric between the start and the deadline) and "top"
--     (the top N on that metric when the deadline has passed).
--   * Progress is read from the ledger only (the same sums as gam_metric), never typed in.
--   * reward_claims: one per winner per programme — the database refuses a second. A claim is created by the
--     database when the goal is met (reward_qualify), never by hand, and only while the budget and the number of
--     winners allow. It then moves pending → approved | rejected; approved → fulfilled | rejected; fulfilled →
--     redeemed, and nowhere else (set_reward_claim_status). Every move is kept (reward_claim_history).
--   * Who may approve, reject, fulfil or mark redeemed is decided by the server (owners, admins, managers; the winner
--     may confirm they received it). The database checks the order of steps and keeps the history.
--   * Eligible teams must be the workspace's own; once anyone has won, a programme's goal, metric, window, scope and
--     eligibility are frozen, and a closed or cancelled programme stays closed.
--   * An hourly job qualifies winners of active programmes and closes programmes past their deadline.
-- Additive. New tables are server-only: RLS on, no client privileges.

BEGIN;

CREATE TABLE IF NOT EXISTS public.reward_programs (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id        UUID NOT NULL REFERENCES public.organisations(id) ON DELETE CASCADE,
  title         TEXT NOT NULL CHECK (length(trim(title)) BETWEEN 1 AND 120),
  description   TEXT CHECK (description IS NULL OR length(description) <= 1000),
  reward_type   TEXT NOT NULL CHECK (reward_type IN ('gadget', 'travel', 'gift_card', 'cash', 'custom')),
  reward_detail TEXT NOT NULL CHECK (length(trim(reward_detail)) BETWEEN 1 AND 200),
  unit_value    NUMERIC(15, 2) NOT NULL DEFAULT 0 CHECK (unit_value >= 0),
  budget        NUMERIC(15, 2) CHECK (budget IS NULL OR budget >= 0),
  scope         TEXT NOT NULL DEFAULT 'person' CHECK (scope IN ('person', 'team')),
  eligible_roles TEXT[] NOT NULL DEFAULT ARRAY['sales_exec', 'team_lead']::text[]
                 CHECK (eligible_roles <@ ARRAY['owner', 'admin', 'manager', 'team_lead', 'sales_exec']::text[]),
  eligible_team_ids UUID[] NOT NULL DEFAULT '{}',
  goal_kind     TEXT NOT NULL CHECK (goal_kind IN ('reach', 'top')),
  metric        TEXT NOT NULL CHECK (metric IN ('contacted', 'follow_ups', 'meetings', 'closed', 'deals', 'revenue', 'xp')),
  goal_amount   NUMERIC(15, 2) CHECK (goal_amount IS NULL OR goal_amount > 0),
  top_n         SMALLINT CHECK (top_n IS NULL OR top_n BETWEEN 1 AND 50),
  max_winners   SMALLINT CHECK (max_winners IS NULL OR max_winners BETWEEN 1 AND 1000),
  starts_on     DATE NOT NULL,
  ends_on       DATE NOT NULL,
  status        TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('draft', 'active', 'closed', 'cancelled')),
  created_by    UUID REFERENCES public.profiles(id) ON DELETE SET NULL,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
  CHECK (ends_on >= starts_on AND ends_on <= starts_on + 400),
  CHECK ((goal_kind = 'reach' AND goal_amount IS NOT NULL) OR (goal_kind = 'top' AND top_n IS NOT NULL))
);
CREATE INDEX IF NOT EXISTS idx_reward_programs_org ON public.reward_programs (org_id, status, ends_on);
ALTER TABLE public.reward_programs ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.reward_programs FROM PUBLIC, anon, authenticated;
GRANT SELECT, INSERT, UPDATE ON public.reward_programs TO service_role;

-- Teams named for eligibility belong to the workspace; once anyone has won, the goal cannot be moved.
CREATE OR REPLACE FUNCTION public.guard_reward_program()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER SET search_path = pg_catalog, public, pg_temp AS $$
BEGIN
  IF EXISTS (SELECT 1 FROM unnest(NEW.eligible_team_ids) t(id)
              WHERE NOT EXISTS (SELECT 1 FROM public.teams x WHERE x.id = t.id AND x.org_id = NEW.org_id)) THEN
    RAISE EXCEPTION 'Eligible teams must belong to this organisation' USING ERRCODE = '23514';
  END IF;
  IF TG_OP = 'UPDATE' THEN
    IF NEW.org_id <> OLD.org_id THEN RAISE EXCEPTION 'A programme cannot move workspace' USING ERRCODE = '23514'; END IF;
    IF EXISTS (SELECT 1 FROM public.reward_claims c WHERE c.program_id = OLD.id)
       AND (NEW.goal_kind, NEW.metric, NEW.goal_amount, NEW.top_n, NEW.scope, NEW.starts_on, NEW.ends_on, NEW.eligible_roles, NEW.eligible_team_ids)
           IS DISTINCT FROM (OLD.goal_kind, OLD.metric, OLD.goal_amount, OLD.top_n, OLD.scope, OLD.starts_on, OLD.ends_on, OLD.eligible_roles, OLD.eligible_team_ids) THEN
      RAISE EXCEPTION 'The goal of a programme with winners cannot change' USING ERRCODE = '23514';
    END IF;
    IF OLD.status IN ('closed', 'cancelled') AND NEW.status <> OLD.status THEN
      RAISE EXCEPTION 'A closed or cancelled programme cannot be reopened' USING ERRCODE = '23514';
    END IF;
  END IF;
  NEW.updated_at := now();
  RETURN NEW;
END $$;
REVOKE ALL ON FUNCTION public.guard_reward_program() FROM PUBLIC, anon, authenticated;
DROP TRIGGER IF EXISTS trg_guard_reward_program ON public.reward_programs;
CREATE TRIGGER trg_guard_reward_program BEFORE INSERT OR UPDATE ON public.reward_programs
  FOR EACH ROW EXECUTE FUNCTION public.guard_reward_program();

CREATE TABLE IF NOT EXISTS public.reward_claims (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id        UUID NOT NULL REFERENCES public.organisations(id) ON DELETE CASCADE,
  program_id    UUID NOT NULL REFERENCES public.reward_programs(id) ON DELETE CASCADE,
  profile_id    UUID REFERENCES public.profiles(id) ON DELETE SET NULL,
  team_id       UUID REFERENCES public.teams(id) ON DELETE SET NULL,
  name          TEXT NOT NULL,
  achieved      NUMERIC(15, 2) NOT NULL,
  place         SMALLINT,
  status        TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'approved', 'rejected', 'fulfilled', 'redeemed')),
  note          TEXT CHECK (note IS NULL OR length(note) <= 500),
  decided_by    UUID REFERENCES public.profiles(id) ON DELETE SET NULL,
  decided_at    TIMESTAMPTZ,
  fulfilled_at  TIMESTAMPTZ,
  redeemed_at   TIMESTAMPTZ,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now()
);
-- One reward per winner per programme.
CREATE UNIQUE INDEX IF NOT EXISTS uq_reward_claim_person ON public.reward_claims (program_id, profile_id) WHERE profile_id IS NOT NULL;
CREATE UNIQUE INDEX IF NOT EXISTS uq_reward_claim_team ON public.reward_claims (program_id, team_id) WHERE team_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_reward_claims_org ON public.reward_claims (org_id, status, created_at DESC);
ALTER TABLE public.reward_claims ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.reward_claims FROM PUBLIC, anon, authenticated;
GRANT SELECT ON public.reward_claims TO service_role;

CREATE TABLE IF NOT EXISTS public.reward_claim_history (
  id          BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  org_id      UUID NOT NULL REFERENCES public.organisations(id) ON DELETE CASCADE,
  claim_id    UUID NOT NULL REFERENCES public.reward_claims(id) ON DELETE CASCADE,
  from_status TEXT,
  to_status   TEXT NOT NULL,
  note        TEXT,
  changed_by  UUID REFERENCES public.profiles(id) ON DELETE SET NULL,
  changed_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_reward_claim_history ON public.reward_claim_history (claim_id, changed_at);
ALTER TABLE public.reward_claim_history ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.reward_claim_history FROM PUBLIC, anon, authenticated;
GRANT SELECT ON public.reward_claim_history TO service_role;

-- A programme's window in the workspace's time zone: from the start of starts_on to the end of ends_on.
CREATE OR REPLACE FUNCTION public.reward_window(p_org UUID, p_starts DATE, p_ends DATE, OUT w_from TIMESTAMPTZ, OUT w_to TIMESTAMPTZ)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = pg_catalog, public AS $$
  SELECT p_starts::timestamp AT TIME ZONE public.gam_tz(p_org), (p_ends + 1)::timestamp AT TIME ZONE public.gam_tz(p_org)
$$;
REVOKE ALL ON FUNCTION public.reward_window(UUID, DATE, DATE) FROM PUBLIC, anon, authenticated;

-- Everyone (or every team) eligible for a programme, with their progress on its metric in its window.
CREATE OR REPLACE FUNCTION public.reward_standings(p_program UUID)
RETURNS TABLE (profile_id UUID, team_id UUID, name TEXT, achieved NUMERIC)
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = pg_catalog, public, pg_temp AS $$
DECLARE
  g      public.reward_programs%ROWTYPE;
  v_from TIMESTAMPTZ;
  v_to   TIMESTAMPTZ;
BEGIN
  SELECT * INTO g FROM public.reward_programs WHERE id = p_program;
  IF NOT FOUND THEN RETURN; END IF;
  SELECT w.w_from, w.w_to INTO v_from, v_to FROM public.reward_window(g.org_id, g.starts_on, g.ends_on) w;
  IF g.scope = 'person' THEN
    RETURN QUERY
      SELECT m.profile_id, NULL::uuid, coalesce(nullif(trim(p.full_name), ''), 'Team member'),
             round(public.gam_metric(g.org_id, m.profile_id, g.metric, v_from, v_to), 2)
        FROM public.org_members m JOIN public.profiles p ON p.id = m.profile_id
       WHERE m.org_id = g.org_id AND m.status = 'active' AND m.role::text = ANY (g.eligible_roles)
         AND public.member_can_take_leads(g.org_id, m.profile_id, m.role)
         AND (cardinality(g.eligible_team_ids) = 0 OR EXISTS (
               SELECT 1 FROM public.team_members tm WHERE tm.profile_id = m.profile_id AND tm.team_id = ANY (g.eligible_team_ids)));
  ELSE
    RETURN QUERY
      SELECT NULL::uuid, t.id, t.name,
             round(coalesce((SELECT sum(public.gam_metric(g.org_id, x.profile_id, g.metric, v_from, v_to))
                               FROM (SELECT DISTINCT tm.profile_id FROM public.team_members tm WHERE tm.team_id = t.id) x), 0), 2)
        FROM public.teams t
       WHERE t.org_id = g.org_id AND t.is_active
         AND (cardinality(g.eligible_team_ids) = 0 OR t.id = ANY (g.eligible_team_ids));
  END IF;
END $$;
REVOKE ALL ON FUNCTION public.reward_standings(UUID) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.reward_standings(UUID) TO service_role;

-- Create claims for whoever has met the goal, within the budget and the number of winners. "Reach" goals qualify as
-- soon as the amount is reached (before the deadline); "top" goals only once the deadline has passed. Returns the
-- number of new claims. Safe to run any time: one claim per winner per programme.
CREATE OR REPLACE FUNCTION public.reward_qualify(p_program UUID)
RETURNS INTEGER LANGUAGE plpgsql SECURITY DEFINER SET search_path = pg_catalog, public, pg_temp AS $$
DECLARE
  g       public.reward_programs%ROWTYPE;
  v_to    TIMESTAMPTZ;
  v_taken INTEGER;
  v_n     INTEGER := 0;
  r       RECORD;
BEGIN
  SELECT * INTO g FROM public.reward_programs WHERE id = p_program FOR UPDATE;
  IF NOT FOUND OR g.status <> 'active' THEN RETURN 0; END IF;
  SELECT w.w_to INTO v_to FROM public.reward_window(g.org_id, g.starts_on, g.ends_on) w;
  IF g.goal_kind = 'top' AND v_to > now() THEN RETURN 0; END IF;
  FOR r IN
    SELECT s.*, row_number() OVER (ORDER BY s.achieved DESC, s.name, coalesce(s.profile_id, s.team_id)) AS place
      FROM public.reward_standings(p_program) s
     WHERE s.achieved > 0 AND (g.goal_kind = 'top' OR s.achieved >= g.goal_amount)
     ORDER BY place
  LOOP
    EXIT WHEN g.goal_kind = 'top' AND r.place > g.top_n;
    CONTINUE WHEN EXISTS (SELECT 1 FROM public.reward_claims c WHERE c.program_id = g.id
                           AND (c.profile_id = r.profile_id OR c.team_id = r.team_id));
    -- Claims still standing (not rejected) count against the number of winners and the budget.
    SELECT count(*) INTO v_taken FROM public.reward_claims c WHERE c.program_id = g.id AND c.status <> 'rejected';
    EXIT WHEN g.max_winners IS NOT NULL AND v_taken >= g.max_winners;
    EXIT WHEN g.budget IS NOT NULL AND (v_taken + 1) * g.unit_value > g.budget;
    INSERT INTO public.reward_claims (org_id, program_id, profile_id, team_id, name, achieved, place)
    VALUES (g.org_id, g.id, r.profile_id, r.team_id, r.name, r.achieved, CASE WHEN g.goal_kind = 'top' THEN r.place END)
    ON CONFLICT DO NOTHING;
    IF FOUND THEN
      v_n := v_n + 1;
      INSERT INTO public.reward_claim_history (org_id, claim_id, from_status, to_status, note)
      SELECT g.org_id, c.id, NULL, 'pending', 'Goal met' FROM public.reward_claims c
       WHERE c.program_id = g.id AND (c.profile_id = r.profile_id OR c.team_id = r.team_id);
      PERFORM public.perf_celebrate(g.org_id, x.who, 'You won: ' || left(g.title, 80),
               left(g.reward_detail, 120) || ' — waiting for approval.', 'reward:' || g.id || ':' || coalesce(r.profile_id, r.team_id))
        FROM (SELECT r.profile_id AS who WHERE r.profile_id IS NOT NULL
              UNION SELECT tm.profile_id FROM public.team_members tm WHERE tm.team_id = r.team_id
              UNION SELECT t.leader_profile_id FROM public.teams t WHERE t.id = r.team_id AND t.leader_profile_id IS NOT NULL) x;
    END IF;
  END LOOP;
  RETURN v_n;
END $$;
REVOKE ALL ON FUNCTION public.reward_qualify(UUID) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.reward_qualify(UUID) TO service_role;

-- Move a claim one step. Only these steps exist: pending → approved | rejected; approved → fulfilled | rejected;
-- fulfilled → redeemed. Returns the new status. The server decides who may call it.
CREATE OR REPLACE FUNCTION public.set_reward_claim_status(p_org UUID, p_claim UUID, p_to TEXT, p_by UUID, p_note TEXT DEFAULT NULL)
RETURNS TEXT LANGUAGE plpgsql SECURITY DEFINER SET search_path = pg_catalog, public, pg_temp AS $$
DECLARE
  c public.reward_claims%ROWTYPE;
BEGIN
  SELECT * INTO c FROM public.reward_claims WHERE id = p_claim AND org_id = p_org FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'not_found' USING ERRCODE = 'P0001'; END IF;
  IF NOT ((c.status = 'pending' AND p_to IN ('approved', 'rejected'))
       OR (c.status = 'approved' AND p_to IN ('fulfilled', 'rejected'))
       OR (c.status = 'fulfilled' AND p_to = 'redeemed')) THEN
    RAISE EXCEPTION 'invalid_step' USING ERRCODE = 'P0001';
  END IF;
  UPDATE public.reward_claims SET status = p_to,
         note = coalesce(nullif(left(trim(coalesce(p_note, '')), 500), ''), note),
         decided_by = CASE WHEN p_to IN ('approved', 'rejected') THEN p_by ELSE decided_by END,
         decided_at = CASE WHEN p_to IN ('approved', 'rejected') THEN now() ELSE decided_at END,
         fulfilled_at = CASE WHEN p_to = 'fulfilled' THEN now() ELSE fulfilled_at END,
         redeemed_at = CASE WHEN p_to = 'redeemed' THEN now() ELSE redeemed_at END
   WHERE id = c.id;
  INSERT INTO public.reward_claim_history (org_id, claim_id, from_status, to_status, note, changed_by)
  VALUES (p_org, c.id, c.status, p_to, nullif(left(trim(coalesce(p_note, '')), 500), ''), p_by);
  IF c.profile_id IS NOT NULL AND p_to IN ('approved', 'rejected', 'fulfilled') THEN
    PERFORM public.perf_celebrate(p_org, c.profile_id,
      CASE p_to WHEN 'approved' THEN 'Reward approved' WHEN 'rejected' THEN 'Reward not approved' ELSE 'Reward on its way' END,
      (SELECT left(g.title, 80) FROM public.reward_programs g WHERE g.id = c.program_id), 'reward:' || c.id || ':' || p_to);
  END IF;
  RETURN p_to;
END $$;
REVOKE ALL ON FUNCTION public.set_reward_claim_status(UUID, UUID, TEXT, UUID, TEXT) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.set_reward_claim_status(UUID, UUID, TEXT, UUID, TEXT) TO service_role;

-- Hourly: qualify winners of active programmes; close those whose deadline has passed (after a last check).
CREATE OR REPLACE FUNCTION public.reward_sweep()
RETURNS INTEGER LANGUAGE plpgsql SECURITY DEFINER SET search_path = pg_catalog, public, pg_temp AS $$
DECLARE
  g   RECORD;
  v_n INTEGER := 0;
BEGIN
  FOR g IN SELECT id, org_id, starts_on, ends_on FROM public.reward_programs WHERE status = 'active' LOOP
    v_n := v_n + public.reward_qualify(g.id);
    IF (SELECT w.w_to FROM public.reward_window(g.org_id, g.starts_on, g.ends_on) w) <= now() THEN
      UPDATE public.reward_programs SET status = 'closed', updated_at = now() WHERE id = g.id;
    END IF;
  END LOOP;
  RETURN v_n;
END $$;
REVOKE ALL ON FUNCTION public.reward_sweep() FROM PUBLIC, anon, authenticated;

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_extension WHERE extname = 'pg_cron') THEN
    PERFORM cron.unschedule(jobid) FROM cron.job WHERE jobname = 'regrow-reward-sweep';
    PERFORM cron.schedule('regrow-reward-sweep', '7 * * * *', 'SELECT public.reward_sweep()');
  END IF;
END $$;

COMMIT;
