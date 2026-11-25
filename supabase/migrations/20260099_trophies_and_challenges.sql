-- 20260099_trophies_and_challenges.sql
-- Gamification, stage C (docs/product/SALES_ECOSYSTEM_AUDIT.md §4), on the performance ledger (20260094, 20260098).
--
--   * Weekly challenges and more monthly achievements join the built-in list. They are ordinary achievements with a
--     week or month window, so the engine (perf_rewards) already unlocks each one at most once per person per window,
--     and a workspace can switch any of them off (Performance → Targets & settings).
--   * Trophies: when a week or month is over, its top three salespeople — and, with team structure on, its top three
--     teams — get a trophy. Awarded once, after the period has closed, by a daily job; the database refuses a second
--     trophy for the same place in the same period, and nothing that happens later changes a trophy already given.
--     People rank as on the leaderboard (points, then deal credit, then leads contacted); teams by deal credit, then
--     revenue, then points per member. Only people who sell are ranked (an owner who only manages is not).
-- Additive. The new table is server-only: RLS on, no client privileges.

BEGIN;

-- ── Built-in achievements: + weekly challenges, + monthly achievements ──────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.builtin_achievements()
RETURNS TABLE (key TEXT, title TEXT, description TEXT, metric TEXT, threshold NUMERIC, window_kind TEXT, xp INTEGER, icon TEXT)
LANGUAGE sql IMMUTABLE SET search_path = pg_catalog AS $$
  VALUES
    ('first_contact',   'First contact',         'Called or messaged your first lead.',               'contacted',  1::numeric,  'all',   10, 'phone'),
    ('contacts_10',     '10 leads contacted',    'Reached ten different leads.',                       'contacted',  10,          'all',   30, 'phone'),
    ('contacts_100',    'Century of calls',      'Reached a hundred different leads.',                 'contacted',  100,         'all',  150, 'phone'),
    ('first_visit',     'First site visit',      'Completed your first site visit.',                   'meetings',   1,           'all',   20, 'map'),
    ('visits_10',       'Showroom regular',      'Completed ten site visits.',                         'meetings',   10,          'all',   80, 'map'),
    ('first_close',     'First booking',         'Closed your first deal.',                            'closed',     1,           'all',   75, 'trophy'),
    ('closes_10',       '10 bookings',           'Closed ten deals.',                                  'closed',     10,          'all',  300, 'trophy'),
    ('follow_up_master','Follow-up master',      'Completed fifty follow-ups.',                        'follow_ups', 50,          'all',  100, 'calendar'),
    ('consistency',     'Consistency champion',  'Completed fifteen daily missions.',                  'missions',   15,          'all',  150, 'flame'),
    ('target_hit',      'Target achieved',       'Reached one of your targets.',                       'targets',    1,           'all',   50, 'target'),
    ('targets_10',      'Target machine',        'Reached ten targets.',                               'targets',    10,          'all',  250, 'target'),
    ('month_closer',    'Closer of the month',   'Closed three deals in one month.',                   'closed',     3,           'month', 120, 'crown'),
    ('revenue_1cr',     'Crore club',            'Closed bookings worth ₹1 crore or more.',            'revenue',    10000000,    'all',  500, 'gem'),
    ('week_contacts_25','Weekly challenge: 25 conversations', 'Contacted 25 leads in one week.',         'contacted',  25,          'week',  40, 'phone'),
    ('week_visits_3',   'Weekly challenge: 3 site visits',    'Completed three site visits in one week.', 'meetings',   3,           'week',  50, 'map'),
    ('week_close',      'Weekly challenge: a booking',        'Closed a deal in one week.',               'closed',     1,           'week',  60, 'rocket'),
    ('week_missions_5', 'Weekly challenge: 5 missions',       'Completed five daily missions in one week.', 'missions', 5,           'week',  40, 'flame'),
    ('month_contacts_100','Hundred in a month',  'Contacted a hundred leads in one month.',            'contacted',  100,         'month', 100, 'star'),
    ('month_targets_3', 'Target hat-trick',      'Reached three targets in one month.',                'targets',    3,           'month', 120, 'target')
$$;

-- ── Trophies ────────────────────────────────────────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.performance_trophies (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id        UUID NOT NULL REFERENCES public.organisations(id) ON DELETE CASCADE,
  period_kind   TEXT NOT NULL CHECK (period_kind IN ('week', 'month')),
  period_start  DATE NOT NULL,
  scope         TEXT NOT NULL CHECK (scope IN ('person', 'team')),
  place         SMALLINT NOT NULL CHECK (place BETWEEN 1 AND 3),
  profile_id    UUID REFERENCES public.profiles(id) ON DELETE SET NULL,
  team_id       UUID REFERENCES public.teams(id) ON DELETE SET NULL,
  -- The winning numbers, frozen when awarded (names too, so the cabinet survives people leaving and teams renamed).
  name          TEXT NOT NULL,
  xp            INTEGER NOT NULL DEFAULT 0,
  closed        NUMERIC(10, 4) NOT NULL DEFAULT 0,
  revenue       NUMERIC(15, 2) NOT NULL DEFAULT 0,
  awarded_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (org_id, period_kind, period_start, scope, place),
  CHECK ((scope = 'person') = (team_id IS NULL))
);
-- One trophy per person (or team) per period.
CREATE UNIQUE INDEX IF NOT EXISTS uq_trophy_person ON public.performance_trophies (org_id, period_kind, period_start, profile_id) WHERE scope = 'person';
CREATE UNIQUE INDEX IF NOT EXISTS uq_trophy_team ON public.performance_trophies (org_id, period_kind, period_start, team_id) WHERE scope = 'team';
CREATE INDEX IF NOT EXISTS idx_trophies_profile ON public.performance_trophies (org_id, profile_id);
ALTER TABLE public.performance_trophies ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.performance_trophies FROM PUBLIC, anon, authenticated;
GRANT SELECT ON public.performance_trophies TO service_role;

-- Award one closed period's trophies for one workspace. Returns how many were given. Refuses a period that has not
-- ended (in the workspace's time zone); running it again gives nothing more.
CREATE OR REPLACE FUNCTION public.award_period_trophies(p_org UUID, p_kind TEXT, p_start DATE)
RETURNS INTEGER LANGUAGE plpgsql SECURITY DEFINER SET search_path = pg_catalog, public, pg_temp AS $$
DECLARE
  v_tz    TEXT := public.gam_tz(p_org);
  v_start DATE;
  v_end   DATE;
  v_from  TIMESTAMPTZ;
  v_to    TIMESTAMPTZ;
  v_n     INTEGER := 0;
  v_label TEXT;
  r       RECORD;
BEGIN
  IF p_kind NOT IN ('week', 'month') THEN RAISE EXCEPTION 'invalid_period' USING ERRCODE = 'P0001'; END IF;
  v_start := CASE p_kind WHEN 'week' THEN date_trunc('week', p_start)::date ELSE date_trunc('month', p_start)::date END;
  v_end := CASE p_kind WHEN 'week' THEN v_start + 7 ELSE (v_start + interval '1 month')::date END;
  v_from := v_start::timestamp AT TIME ZONE v_tz;
  v_to := v_end::timestamp AT TIME ZONE v_tz;
  IF v_to > now() THEN RAISE EXCEPTION 'period_not_over' USING ERRCODE = 'P0001'; END IF;
  -- Points switched off: no trophies.
  IF coalesce(public.gam_settings(p_org) -> 'enabled', 'true'::jsonb) = 'false'::jsonb THEN RETURN 0; END IF;
  v_label := CASE p_kind WHEN 'week' THEN 'the week of ' || to_char(v_start, 'DD Mon') ELSE to_char(v_start, 'FMMonth YYYY') END;

  -- People.
  FOR r IN
    WITH t AS (
      SELECT e.profile_id,
             sum(e.xp)::int AS xp,
             coalesce(sum(e.credit) FILTER (WHERE e.kind IN ('deal_closed', 'deal_reversed', 'deal_credit')), 0) AS closed,
             coalesce(sum(e.units) FILTER (WHERE e.kind = 'first_contact'), 0) AS contacted,
             coalesce(sum(e.value) FILTER (WHERE e.kind IN ('revenue', 'deal_credit')), 0) AS revenue
        FROM public.performance_events e
       WHERE e.org_id = p_org AND e.occurred_at >= v_from AND e.occurred_at < v_to
       GROUP BY e.profile_id)
    SELECT t.*, coalesce(nullif(trim(p.full_name), ''), 'Team member') AS name,
           row_number() OVER (ORDER BY t.xp DESC, t.closed DESC, t.contacted DESC, p.full_name, t.profile_id) AS place
      FROM t
      JOIN public.org_members m ON m.org_id = p_org AND m.profile_id = t.profile_id AND m.status = 'active'
      JOIN public.profiles p ON p.id = t.profile_id
     WHERE t.xp > 0 AND m.role IN ('owner', 'admin', 'manager', 'team_lead', 'sales_exec')
       AND public.member_can_take_leads(p_org, t.profile_id, m.role)
     ORDER BY place LIMIT 3
  LOOP
    INSERT INTO public.performance_trophies (org_id, period_kind, period_start, scope, place, profile_id, name, xp, closed, revenue)
    VALUES (p_org, p_kind, v_start, 'person', r.place, r.profile_id, r.name, r.xp, r.closed, r.revenue)
    ON CONFLICT DO NOTHING;
    IF FOUND THEN
      v_n := v_n + 1;
      PERFORM public.perf_celebrate(p_org, r.profile_id,
        CASE r.place WHEN 1 THEN 'Gold' WHEN 2 THEN 'Silver' ELSE 'Bronze' END || ' trophy for ' || v_label,
        'You finished #' || r.place || ' on the leaderboard with ' || r.xp || ' XP.',
        'trophy:' || p_kind || ':' || v_start || ':person:' || r.place);
    END IF;
  END LOOP;

  -- Teams, while team structure is on.
  IF coalesce((SELECT (s.sales ->> 'teamsEnabled')::boolean FROM public.org_settings s WHERE s.org_id = p_org), false) THEN
    FOR r IN
      WITH members AS (
        SELECT DISTINCT tm.team_id, tm.profile_id FROM public.team_members tm
          JOIN public.teams tt ON tt.id = tm.team_id AND tt.org_id = p_org AND tt.is_active
         WHERE tm.org_id = p_org),
      t AS (
        SELECT mb.team_id,
               count(DISTINCT mb.profile_id) AS people,
               coalesce(sum(e.xp), 0)::int AS xp,
               coalesce(sum(e.credit) FILTER (WHERE e.kind IN ('deal_closed', 'deal_reversed', 'deal_credit')), 0) AS closed,
               coalesce(sum(e.value) FILTER (WHERE e.kind IN ('revenue', 'deal_credit')), 0) AS revenue
          FROM members mb
          LEFT JOIN public.performance_events e ON e.org_id = p_org AND e.profile_id = mb.profile_id
                AND e.occurred_at >= v_from AND e.occurred_at < v_to
         GROUP BY mb.team_id)
      SELECT t.*, tt.name, tt.leader_profile_id,
             row_number() OVER (ORDER BY t.closed DESC, t.revenue DESC, (t.xp::numeric / greatest(t.people, 1)) DESC, tt.name, t.team_id) AS place
        FROM t JOIN public.teams tt ON tt.id = t.team_id
       WHERE t.xp > 0 OR t.closed > 0
       ORDER BY place LIMIT 3
    LOOP
      INSERT INTO public.performance_trophies (org_id, period_kind, period_start, scope, place, team_id, name, xp, closed, revenue)
      VALUES (p_org, p_kind, v_start, 'team', r.place, r.team_id, r.name, r.xp, r.closed, r.revenue)
      ON CONFLICT DO NOTHING;
      IF FOUND THEN
        v_n := v_n + 1;
        -- Tell the team's leader and its members.
        PERFORM public.perf_celebrate(p_org, x.profile_id,
          CASE r.place WHEN 1 THEN 'Gold' WHEN 2 THEN 'Silver' ELSE 'Bronze' END || ' team trophy: ' || left(r.name, 60),
          r.name || ' finished #' || r.place || ' among teams for ' || v_label || '.',
          'trophy:' || p_kind || ':' || v_start || ':team:' || r.place)
        FROM (SELECT DISTINCT tm.profile_id FROM public.team_members tm WHERE tm.team_id = r.team_id
              UNION SELECT r.leader_profile_id WHERE r.leader_profile_id IS NOT NULL) x;
      END IF;
    END LOOP;
  END IF;
  RETURN v_n;
END $$;
REVOKE ALL ON FUNCTION public.award_period_trophies(UUID, TEXT, DATE) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.award_period_trophies(UUID, TEXT, DATE) TO service_role;

-- Daily: for every workspace with points this past ~5 weeks, award last week's and last month's trophies once they
-- have ended in that workspace's time zone. Safe to run at any time and as often as wanted.
CREATE OR REPLACE FUNCTION public.award_due_trophies()
RETURNS INTEGER LANGUAGE plpgsql SECURITY DEFINER SET search_path = pg_catalog, public, pg_temp AS $$
DECLARE
  o     RECORD;
  v_day DATE;
  v_n   INTEGER := 0;
BEGIN
  FOR o IN SELECT DISTINCT e.org_id FROM public.performance_events e WHERE e.occurred_at > now() - interval '40 days' LOOP
    v_day := (now() AT TIME ZONE public.gam_tz(o.org_id))::date;
    v_n := v_n + public.award_period_trophies(o.org_id, 'week', date_trunc('week', v_day)::date - 7);
    v_n := v_n + public.award_period_trophies(o.org_id, 'month', (date_trunc('month', v_day) - interval '1 month')::date);
  END LOOP;
  RETURN v_n;
END $$;
REVOKE ALL ON FUNCTION public.award_due_trophies() FROM PUBLIC, anon, authenticated;

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_extension WHERE extname = 'pg_cron') THEN
    PERFORM cron.unschedule(jobid) FROM cron.job WHERE jobname = 'regrow-award-trophies';
    PERFORM cron.schedule('regrow-award-trophies', '35 19 * * *', 'SELECT public.award_due_trophies()'); -- 01:05 IST
  END IF;
END $$;

COMMIT;
