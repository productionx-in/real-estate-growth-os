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
--   * Fix: a level-up is celebrated once the level is reached, even when the same event also unlocked achievements.
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

-- ── Level-ups: verbatim from 20260098 except the level block, which judged a crossing from one event's points and
--    missed it when achievements unlocked by that same event had already added theirs (nested triggers). ─────────────
CREATE OR REPLACE FUNCTION public.perf_rewards()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER SET search_path = pg_catalog, public, pg_temp AS $$
DECLARE
  v_s      JSONB := public.gam_settings(NEW.org_id);
  v_tz     TEXT := public.gam_tz(NEW.org_id);
  v_on     BOOLEAN := coalesce(v_s -> 'enabled', 'true'::jsonb) <> 'false'::jsonb;
  v_day    DATE := (NEW.occurred_at AT TIME ZONE v_tz)::date;
  v_m      JSONB;
  a        RECORD;
  t        RECORD;
  v_from   TIMESTAMPTZ;
  v_to     TIMESTAMPTZ;
  v_wstart DATE;
  v_have   NUMERIC;
  v_total  INTEGER;
  v_level  TEXT;
BEGIN
  IF NOT v_on THEN RETURN NULL; END IF;

  IF NEW.kind IN ('first_contact', 'follow_up_done', 'visit_done', 'deal_closed', 'deal_reversed', 'revenue', 'lead_assigned', 'deal_credit') THEN
    -- Daily missions (defaults when the workspace has not set its own).
    FOR v_m IN SELECT * FROM jsonb_array_elements(coalesce(v_s -> 'missions',
        '[{"key":"contact5","title":"Contact 5 leads","metric":"contacted","count":5,"xp":20},
          {"key":"followups3","title":"Complete 3 follow-ups","metric":"follow_ups","count":3,"xp":15},
          {"key":"visit1","title":"Complete a site visit","metric":"meetings","count":1,"xp":25}]'::jsonb))
    LOOP
      CONTINUE WHEN jsonb_typeof(v_m -> 'count') <> 'number' OR v_m ->> 'key' IS NULL;
      v_from := v_day::timestamp AT TIME ZONE v_tz;
      IF public.gam_metric(NEW.org_id, NEW.profile_id, v_m ->> 'metric', v_from, v_from + interval '1 day') >= (v_m ->> 'count')::numeric THEN
        IF public.record_performance_event(NEW.org_id, NEW.profile_id, NULL, 'mission', 'mission:' || (v_m ->> 'key') || ':' || NEW.profile_id || ':' || v_day,
             NEW.occurred_at, 1, 0, least(1000, greatest(0, coalesce((v_m ->> 'xp')::int, 0))), jsonb_build_object('mission', v_m ->> 'key', 'title', v_m ->> 'title')) IS NOT NULL THEN
          PERFORM public.perf_celebrate(NEW.org_id, NEW.profile_id, 'Mission complete: ' || left(v_m ->> 'title', 80),
            '+' || coalesce((v_m ->> 'xp')::int, 0) || ' XP', 'mission:' || (v_m ->> 'key') || ':' || v_day);
        END IF;
      END IF;
    END LOOP;

    -- Targets that apply to this person now: their own, their team's, or everyone's. A personal target for the same
    -- metric and period overrides a team one, which overrides an everyone one.
    FOR t IN
      SELECT DISTINCT ON (pt.metric, pt.period) pt.*
      FROM public.performance_targets pt
      WHERE pt.org_id = NEW.org_id AND pt.archived_at IS NULL AND pt.starts_on <= v_day AND (pt.ends_on IS NULL OR pt.ends_on >= v_day)
        AND (pt.profile_id = NEW.profile_id OR pt.scope = 'everyone'
             OR pt.team_id IN (SELECT tm.team_id FROM public.team_members tm WHERE tm.profile_id = NEW.profile_id))
      ORDER BY pt.metric, pt.period, CASE pt.scope WHEN 'member' THEN 0 WHEN 'team' THEN 1 ELSE 2 END, pt.updated_at DESC
    LOOP
      v_wstart := CASE t.period WHEN 'day' THEN v_day WHEN 'week' THEN date_trunc('week', v_day)::date
                                WHEN 'month' THEN date_trunc('month', v_day)::date ELSE t.starts_on END;
      v_from := v_wstart::timestamp AT TIME ZONE v_tz;
      v_to := (CASE t.period WHEN 'day' THEN v_wstart + 1 WHEN 'week' THEN v_wstart + 7
                             WHEN 'month' THEN (v_wstart + interval '1 month')::date ELSE t.ends_on + 1 END)::timestamp AT TIME ZONE v_tz;
      v_have := public.gam_metric(NEW.org_id, NEW.profile_id, t.metric, v_from, v_to);
      IF v_have >= t.amount THEN
        IF public.record_performance_event(NEW.org_id, NEW.profile_id, NULL, 'target_hit', 'target:' || t.id || ':' || NEW.profile_id || ':' || v_wstart,
             NEW.occurred_at, 1, 0, NULL, jsonb_build_object('target_id', t.id, 'metric', t.metric, 'period', t.period, 'amount', t.amount)) IS NOT NULL THEN
          PERFORM public.perf_celebrate(NEW.org_id, NEW.profile_id, 'Target reached!',
            'Your ' || t.period || ' ' || replace(t.metric, '_', ' ') || ' target is done.', 'target:' || t.id || ':' || v_wstart);
        END IF;
      END IF;
    END LOOP;
  END IF;

  -- Achievements: the built-ins the workspace did not switch off, plus its own.
  IF NEW.kind NOT IN ('achievement', 'adjustment') THEN
    FOR a IN
      SELECT b.key, b.title, b.description, b.metric, b.threshold, b.window_kind, b.xp FROM public.builtin_achievements() b
       WHERE NOT EXISTS (SELECT 1 FROM public.achievement_defs d WHERE d.org_id = NEW.org_id AND d.key = b.key)
      UNION ALL
      SELECT d.key, d.title, d.description, d.metric, d.threshold, d.window_kind, d.xp FROM public.achievement_defs d
       WHERE d.org_id = NEW.org_id AND d.active
    LOOP
      v_wstart := CASE a.window_kind WHEN 'week' THEN date_trunc('week', v_day)::date WHEN 'month' THEN date_trunc('month', v_day)::date ELSE DATE '2000-01-01' END;
      CONTINUE WHEN EXISTS (SELECT 1 FROM public.achievement_unlocks u WHERE u.org_id = NEW.org_id AND u.profile_id = NEW.profile_id AND u.key = a.key AND u.window_start = v_wstart);
      v_from := CASE WHEN a.window_kind = 'all' THEN '-infinity'::timestamptz ELSE v_wstart::timestamp AT TIME ZONE v_tz END;
      v_to := CASE a.window_kind WHEN 'week' THEN (v_wstart + 7)::timestamp AT TIME ZONE v_tz
                                 WHEN 'month' THEN (v_wstart + interval '1 month')::date::timestamp AT TIME ZONE v_tz ELSE 'infinity'::timestamptz END;
      IF public.gam_metric(NEW.org_id, NEW.profile_id, a.metric, v_from, v_to) >= a.threshold THEN
        INSERT INTO public.achievement_unlocks (org_id, profile_id, key, window_start, title, xp, unlocked_at)
        VALUES (NEW.org_id, NEW.profile_id, a.key, v_wstart, a.title, a.xp, NEW.occurred_at)
        ON CONFLICT DO NOTHING;
        IF FOUND THEN
          PERFORM public.record_performance_event(NEW.org_id, NEW.profile_id, NULL, 'achievement', 'achievement:' || a.key || ':' || NEW.profile_id || ':' || v_wstart,
            NEW.occurred_at, 1, 0, a.xp, jsonb_build_object('key', a.key, 'title', a.title));
          PERFORM public.perf_celebrate(NEW.org_id, NEW.profile_id, 'Achievement unlocked: ' || a.title,
            a.description || CASE WHEN a.xp > 0 THEN ' +' || a.xp || ' XP' ELSE '' END, 'achievement:' || a.key || ':' || v_wstart);
        END IF;
      END IF;
    END LOOP;
  END IF;

  -- Level up: the highest level the person has reached, celebrated once (the notice's dedupe key). Judged from the
  -- running total, not from this one event: points from achievements unlocked by the same event land first (nested),
  -- so "before this event" cannot be worked out reliably (fixed in 20260099).
  IF NEW.xp > 0 THEN
    SELECT coalesce(sum(xp), 0) INTO v_total FROM public.performance_events WHERE org_id = NEW.org_id AND profile_id = NEW.profile_id;
    SELECT l ->> 'name' INTO v_level
      FROM jsonb_array_elements(coalesce(v_s -> 'levels',
        '[{"name":"Beginner","xp":0},{"name":"Rising Star","xp":200},{"name":"Performer","xp":600},{"name":"Sales Expert","xp":1500},{"name":"Elite Closer","xp":3500},{"name":"Sales Champion","xp":7000}]'::jsonb)) l
     WHERE jsonb_typeof(l -> 'xp') = 'number' AND (l ->> 'xp')::int > 0 AND (l ->> 'xp')::int <= v_total
     ORDER BY (l ->> 'xp')::int DESC LIMIT 1;
    IF v_level IS NOT NULL AND NOT EXISTS (SELECT 1 FROM public.notifications n WHERE n.recipient_profile_id = NEW.profile_id
                                             AND n.dedupe_key = 'level:' || NEW.profile_id || ':' || v_level) THEN
      PERFORM public.perf_celebrate(NEW.org_id, NEW.profile_id, 'Level up: ' || left(v_level, 40) || '!', v_total || ' XP so far.',
        'level:' || NEW.profile_id || ':' || v_level);
    END IF;
  END IF
;
  RETURN NULL;
END $$;
REVOKE ALL ON FUNCTION public.perf_rewards() FROM PUBLIC, anon, authenticated;

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
