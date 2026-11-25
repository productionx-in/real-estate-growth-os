-- 20260094_performance_engine.sql
-- Sales performance and achievements (lib/performance/*). An event-driven ledger fed only by real CRM events, so
-- points, targets, missions, achievements, levels and leaderboards all read one trustworthy record.
--
--   public.performance_events — one row per qualifying event, never duplicated (unique dedupe key):
--     lead_assigned    a lead becomes someone's (0 points: an assignment is not a sale)
--     first_contact    the first logged call or WhatsApp by a person on a lead (once per lead and person)
--     follow_up_done   a follow-up marked done (once per follow-up; points capped per day)
--     visit_done       a site visit completed (once per visit), credited to the visit's salesperson
--     deal_closed      the lead is booked (credited to its owner at that moment); un-booking it reverses the points
--     deal_reversed    …that reversal. Re-booking credits again, so the net is never more than one deal per lead
--     revenue          a booking's value, credited to whoever closed the lead; a cancelled booking reverses it
--     mission / achievement / target_hit / adjustment — rewards and audited manual corrections
--   units (+1/−1) and value (₹) carry the counts and money; xp the points, fixed when the event happens, so later
--   changes to the points table never rewrite history.
--   public.performance_targets (+ history) — targets per person, per team or for everyone, by period.
--   public.achievement_defs — a workspace's own achievements (and switched-off built-ins); achievement_unlocks.
--   org_settings.gamification — on/off, points, daily caps, levels, daily missions, leaderboard visibility.
-- Reporting days, weeks and months follow the workspace's time zone (lead_response_settings.timezone, India default).
-- Server-only tables: RLS on, no client privileges. Additive.

BEGIN;

ALTER TABLE public.org_settings
  ADD COLUMN IF NOT EXISTS gamification JSONB NOT NULL DEFAULT '{}'::jsonb
    CHECK (jsonb_typeof(gamification) = 'object' AND pg_column_size(gamification) < 16384);

ALTER TABLE public.notifications DROP CONSTRAINT IF EXISTS notifications_type_check;
ALTER TABLE public.notifications ADD CONSTRAINT notifications_type_check CHECK (type IN (
  'lead_assigned', 'lead_unassigned', 'sla_nudge', 'sla_breach', 'follow_up_due', 'follow_up_overdue', 'document_viewed', 'plot_map',
  'lead_new', 'lead_uncontacted', 'achievement'));

-- ── Ledger ─────────────────────────────────────────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.performance_events (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id      UUID NOT NULL REFERENCES public.organisations(id) ON DELETE CASCADE,
  profile_id  UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  lead_id     UUID REFERENCES public.leads_all(id) ON DELETE SET NULL,
  kind        TEXT NOT NULL CHECK (kind IN ('lead_assigned', 'first_contact', 'follow_up_done', 'visit_done', 'deal_closed',
                'deal_reversed', 'revenue', 'mission', 'achievement', 'target_hit', 'adjustment')),
  units       INTEGER NOT NULL DEFAULT 1 CHECK (units BETWEEN -1 AND 1),
  value       NUMERIC(15, 2) NOT NULL DEFAULT 0,
  xp          INTEGER NOT NULL DEFAULT 0 CHECK (xp BETWEEN -100000 AND 100000),
  occurred_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  dedupe_key  TEXT NOT NULL,
  detail      JSONB NOT NULL DEFAULT '{}'::jsonb CHECK (pg_column_size(detail) < 2048),
  created_by  UUID REFERENCES public.profiles(id) ON DELETE SET NULL,
  UNIQUE (org_id, dedupe_key)
);
CREATE INDEX IF NOT EXISTS idx_perf_events_person ON public.performance_events (org_id, profile_id, occurred_at);
CREATE INDEX IF NOT EXISTS idx_perf_events_org_time ON public.performance_events (org_id, occurred_at);
CREATE INDEX IF NOT EXISTS idx_perf_events_lead ON public.performance_events (lead_id, kind);
ALTER TABLE public.performance_events ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.performance_events FROM PUBLIC, anon, authenticated;
GRANT SELECT, INSERT ON public.performance_events TO service_role;

-- ── Targets (and their history) ────────────────────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.performance_targets (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id      UUID NOT NULL REFERENCES public.organisations(id) ON DELETE CASCADE,
  scope       TEXT NOT NULL CHECK (scope IN ('member', 'team', 'everyone')),
  profile_id  UUID REFERENCES public.profiles(id) ON DELETE CASCADE,
  team_id     UUID REFERENCES public.teams(id) ON DELETE CASCADE,
  metric      TEXT NOT NULL CHECK (metric IN ('assigned', 'contacted', 'follow_ups', 'meetings', 'closed', 'revenue')),
  amount      NUMERIC(15, 2) NOT NULL CHECK (amount > 0 AND amount < 1e13),
  period      TEXT NOT NULL CHECK (period IN ('day', 'week', 'month', 'custom')),
  starts_on   DATE NOT NULL,
  ends_on     DATE,
  archived_at TIMESTAMPTZ,
  created_by  UUID REFERENCES public.profiles(id) ON DELETE SET NULL,
  updated_by  UUID REFERENCES public.profiles(id) ON DELETE SET NULL,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
  CHECK ((scope = 'member') = (profile_id IS NOT NULL) AND (scope = 'team') = (team_id IS NOT NULL)),
  CHECK (ends_on IS NULL OR ends_on >= starts_on),
  CHECK (period <> 'custom' OR ends_on IS NOT NULL)
);
CREATE INDEX IF NOT EXISTS idx_perf_targets_org ON public.performance_targets (org_id) WHERE archived_at IS NULL;
ALTER TABLE public.performance_targets ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.performance_targets FROM PUBLIC, anon, authenticated;
GRANT SELECT, INSERT, UPDATE ON public.performance_targets TO service_role;

CREATE TABLE IF NOT EXISTS public.performance_target_history (
  id         BIGSERIAL PRIMARY KEY,
  target_id  UUID NOT NULL,
  org_id     UUID NOT NULL REFERENCES public.organisations(id) ON DELETE CASCADE,
  action     TEXT NOT NULL CHECK (action IN ('created', 'changed', 'archived')),
  before     JSONB,
  after      JSONB,
  changed_by UUID REFERENCES public.profiles(id) ON DELETE SET NULL,
  changed_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_perf_target_history ON public.performance_target_history (org_id, changed_at DESC);
ALTER TABLE public.performance_target_history ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.performance_target_history FROM PUBLIC, anon, authenticated;
GRANT SELECT, INSERT ON public.performance_target_history TO service_role;

-- Same-workspace integrity, and every change kept.
CREATE OR REPLACE FUNCTION public.guard_performance_target()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER SET search_path = pg_catalog, public, pg_temp AS $$
BEGIN
  IF NEW.profile_id IS NOT NULL AND NOT EXISTS (SELECT 1 FROM public.org_members m WHERE m.org_id = NEW.org_id AND m.profile_id = NEW.profile_id) THEN
    RAISE EXCEPTION 'performance_targets: person is not in this workspace' USING ERRCODE = 'check_violation';
  END IF;
  IF NEW.team_id IS NOT NULL AND NOT EXISTS (SELECT 1 FROM public.teams t WHERE t.id = NEW.team_id AND t.org_id = NEW.org_id) THEN
    RAISE EXCEPTION 'performance_targets: team is not in this workspace' USING ERRCODE = 'check_violation';
  END IF;
  IF TG_OP = 'UPDATE' THEN
    IF NEW.org_id <> OLD.org_id THEN RAISE EXCEPTION 'performance_targets: cannot move between workspaces' USING ERRCODE = 'check_violation'; END IF;
    NEW.updated_at := now();
  END IF;
  RETURN NEW;
END $$;
REVOKE ALL ON FUNCTION public.guard_performance_target() FROM PUBLIC, anon, authenticated;
DROP TRIGGER IF EXISTS trg_guard_performance_target ON public.performance_targets;
CREATE TRIGGER trg_guard_performance_target BEFORE INSERT OR UPDATE ON public.performance_targets
  FOR EACH ROW EXECUTE FUNCTION public.guard_performance_target();

CREATE OR REPLACE FUNCTION public.log_performance_target()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER SET search_path = pg_catalog, public, pg_temp AS $$
BEGIN
  INSERT INTO public.performance_target_history (target_id, org_id, action, before, after, changed_by)
  VALUES (NEW.id, NEW.org_id,
          CASE WHEN TG_OP = 'INSERT' THEN 'created' WHEN NEW.archived_at IS NOT NULL AND OLD.archived_at IS NULL THEN 'archived' ELSE 'changed' END,
          CASE WHEN TG_OP = 'UPDATE' THEN to_jsonb(OLD) - 'created_at' END, to_jsonb(NEW) - 'created_at',
          coalesce(NEW.updated_by, NEW.created_by));
  RETURN NULL;
END $$;
REVOKE ALL ON FUNCTION public.log_performance_target() FROM PUBLIC, anon, authenticated;
DROP TRIGGER IF EXISTS trg_log_performance_target ON public.performance_targets;
CREATE TRIGGER trg_log_performance_target AFTER INSERT OR UPDATE ON public.performance_targets
  FOR EACH ROW EXECUTE FUNCTION public.log_performance_target();

-- ── Achievements ───────────────────────────────────────────────────────────────────────────────────────────────
-- A workspace's own achievements, and built-ins it switched off (same key, active = false).
CREATE TABLE IF NOT EXISTS public.achievement_defs (
  org_id      UUID NOT NULL REFERENCES public.organisations(id) ON DELETE CASCADE,
  key         TEXT NOT NULL CHECK (key ~ '^[a-z0-9_]{2,40}$'),
  title       TEXT NOT NULL CHECK (char_length(title) BETWEEN 2 AND 60),
  description TEXT NOT NULL DEFAULT '' CHECK (char_length(description) <= 200),
  metric      TEXT NOT NULL CHECK (metric IN ('assigned', 'contacted', 'follow_ups', 'meetings', 'closed', 'revenue', 'missions', 'targets', 'xp')),
  threshold   NUMERIC(15, 2) NOT NULL CHECK (threshold > 0),
  window_kind TEXT NOT NULL DEFAULT 'all' CHECK (window_kind IN ('all', 'week', 'month')),
  xp          INTEGER NOT NULL DEFAULT 0 CHECK (xp BETWEEN 0 AND 10000),
  icon        TEXT NOT NULL DEFAULT 'trophy' CHECK (icon ~ '^[a-z_]{2,20}$'),
  reward_note TEXT CHECK (reward_note IS NULL OR char_length(reward_note) <= 120),
  active      BOOLEAN NOT NULL DEFAULT true,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (org_id, key)
);
ALTER TABLE public.achievement_defs ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.achievement_defs FROM PUBLIC, anon, authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.achievement_defs TO service_role;

CREATE TABLE IF NOT EXISTS public.achievement_unlocks (
  org_id      UUID NOT NULL REFERENCES public.organisations(id) ON DELETE CASCADE,
  profile_id  UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  key         TEXT NOT NULL,
  window_start DATE NOT NULL DEFAULT '2000-01-01',
  title       TEXT NOT NULL,
  xp          INTEGER NOT NULL DEFAULT 0,
  unlocked_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (org_id, profile_id, key, window_start)
);
ALTER TABLE public.achievement_unlocks ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.achievement_unlocks FROM PUBLIC, anon, authenticated;
GRANT SELECT, INSERT ON public.achievement_unlocks TO service_role;

-- The built-in achievements (lib/performance/rules.ts shows the same list).
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
    ('revenue_1cr',     'Crore club',            'Closed bookings worth ₹1 crore or more.',            'revenue',    10000000,    'all',  500, 'gem')
$$;

-- ── Settings helpers (a missing value means the default; the form in lib/performance/rules.ts saves these keys) ──
CREATE OR REPLACE FUNCTION public.gam_settings(p_org UUID)
RETURNS JSONB LANGUAGE sql STABLE SECURITY DEFINER SET search_path = pg_catalog, public AS $$
  SELECT coalesce((SELECT gamification FROM public.org_settings WHERE org_id = p_org), '{}'::jsonb)
$$;
CREATE OR REPLACE FUNCTION public.gam_tz(p_org UUID)
RETURNS TEXT LANGUAGE sql STABLE SECURITY DEFINER SET search_path = pg_catalog, public AS $$
  SELECT coalesce((SELECT timezone FROM public.lead_response_settings WHERE org_id = p_org), 'Asia/Kolkata')
$$;
CREATE OR REPLACE FUNCTION public.gam_xp(p_settings JSONB, p_kind TEXT)
RETURNS INTEGER LANGUAGE sql IMMUTABLE SET search_path = pg_catalog AS $$
  SELECT CASE WHEN coalesce(p_settings -> 'enabled', 'true'::jsonb) = 'false'::jsonb THEN 0
              WHEN jsonb_typeof(p_settings -> 'xp' -> p_kind) = 'number' THEN least(1000, greatest(0, round((p_settings -> 'xp' ->> p_kind)::numeric)::int))
              ELSE CASE p_kind WHEN 'first_contact' THEN 10 WHEN 'follow_up_done' THEN 5 WHEN 'visit_done' THEN 25
                               WHEN 'deal_closed' THEN 100 WHEN 'target_hit' THEN 50 ELSE 0 END END
$$;
REVOKE ALL ON FUNCTION public.gam_settings(UUID) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.gam_tz(UUID) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.gam_xp(JSONB, TEXT) FROM PUBLIC, anon, authenticated;

-- A metric for one person between two moments.
CREATE OR REPLACE FUNCTION public.gam_metric(p_org UUID, p_profile UUID, p_metric TEXT, p_from TIMESTAMPTZ, p_to TIMESTAMPTZ)
RETURNS NUMERIC LANGUAGE sql STABLE SECURITY DEFINER SET search_path = pg_catalog, public AS $$
  SELECT coalesce(CASE p_metric
      WHEN 'revenue' THEN sum(e.value) FILTER (WHERE e.kind = 'revenue')
      WHEN 'xp'      THEN sum(e.xp)
      ELSE sum(e.units) FILTER (WHERE e.kind = ANY (CASE p_metric
        WHEN 'assigned' THEN ARRAY['lead_assigned'] WHEN 'contacted' THEN ARRAY['first_contact']
        WHEN 'follow_ups' THEN ARRAY['follow_up_done'] WHEN 'meetings' THEN ARRAY['visit_done']
        WHEN 'closed' THEN ARRAY['deal_closed', 'deal_reversed'] WHEN 'missions' THEN ARRAY['mission']
        WHEN 'targets' THEN ARRAY['target_hit'] ELSE ARRAY[]::text[] END))
    END, 0)
  FROM public.performance_events e
  WHERE e.org_id = p_org AND e.profile_id = p_profile AND e.occurred_at >= p_from AND e.occurred_at < p_to
$$;
REVOKE ALL ON FUNCTION public.gam_metric(UUID, UUID, TEXT, TIMESTAMPTZ, TIMESTAMPTZ) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.gam_metric(UUID, UUID, TEXT, TIMESTAMPTZ, TIMESTAMPTZ) TO service_role;

-- The one way an event enters the ledger. Only for members of the workspace; once per dedupe key.
CREATE OR REPLACE FUNCTION public.record_performance_event(
  p_org UUID, p_profile UUID, p_lead UUID, p_kind TEXT, p_dedupe TEXT, p_at TIMESTAMPTZ DEFAULT now(),
  p_units INTEGER DEFAULT 1, p_value NUMERIC DEFAULT 0, p_xp INTEGER DEFAULT NULL, p_detail JSONB DEFAULT '{}'::jsonb, p_by UUID DEFAULT NULL)
RETURNS UUID LANGUAGE plpgsql SECURITY DEFINER SET search_path = pg_catalog, public, pg_temp AS $$
DECLARE
  v_s    JSONB;
  v_xp   INTEGER;
  v_cap  INTEGER;
  v_tz   TEXT;
  v_id   UUID;
BEGIN
  IF p_profile IS NULL OR NOT EXISTS (SELECT 1 FROM public.org_members m WHERE m.org_id = p_org AND m.profile_id = p_profile) THEN
    RETURN NULL;
  END IF;
  v_s := public.gam_settings(p_org);
  v_xp := coalesce(p_xp, public.gam_xp(v_s, p_kind));
  -- Daily caps stop volume farming (default: 20 follow-ups a day earn points; more still count, without points).
  IF p_kind = 'follow_up_done' AND v_xp > 0 THEN
    v_cap := CASE WHEN jsonb_typeof(v_s -> 'caps' -> 'follow_up_done') = 'number' THEN (v_s -> 'caps' ->> 'follow_up_done')::int ELSE 20 END;
    v_tz := public.gam_tz(p_org);
    IF (SELECT count(*) FROM public.performance_events e
         WHERE e.org_id = p_org AND e.profile_id = p_profile AND e.kind = 'follow_up_done' AND e.xp > 0
           AND (e.occurred_at AT TIME ZONE v_tz)::date = (p_at AT TIME ZONE v_tz)::date) >= v_cap THEN
      v_xp := 0;
    END IF;
  END IF;
  INSERT INTO public.performance_events (org_id, profile_id, lead_id, kind, units, value, xp, occurred_at, dedupe_key, detail, created_by)
  VALUES (p_org, p_profile, p_lead, p_kind, p_units, coalesce(p_value, 0), v_xp, p_at, p_dedupe, coalesce(p_detail, '{}'::jsonb), p_by)
  ON CONFLICT (org_id, dedupe_key) DO NOTHING
  RETURNING id INTO v_id;
  RETURN v_id;
END $$;
REVOKE ALL ON FUNCTION public.record_performance_event(UUID, UUID, UUID, TEXT, TEXT, TIMESTAMPTZ, INTEGER, NUMERIC, INTEGER, JSONB, UUID) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.record_performance_event(UUID, UUID, UUID, TEXT, TEXT, TIMESTAMPTZ, INTEGER, NUMERIC, INTEGER, JSONB, UUID) TO service_role;

-- ── Feeds from the CRM ─────────────────────────────────────────────────────────────────────────────────────────
-- Assignment and closing (leads_all). Imported history never earns points.
CREATE OR REPLACE FUNCTION public.perf_from_lead()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER SET search_path = pg_catalog, public, pg_temp AS $$
DECLARE
  v_round INTEGER;
  v_closer UUID;
  v_xp INTEGER;
BEGIN
  IF coalesce(NEW.custom_fields ? 'imported_at', false) AND TG_OP = 'INSERT' THEN RETURN NULL; END IF;
  IF NEW.assigned_to IS NOT NULL AND (TG_OP = 'INSERT' OR NEW.assigned_to IS DISTINCT FROM OLD.assigned_to) THEN
    PERFORM public.record_performance_event(NEW.org_id, NEW.assigned_to, NEW.id, 'lead_assigned',
      'assigned:' || NEW.id || ':' || NEW.assigned_to);
  END IF;
  IF TG_OP = 'UPDATE' AND NEW.status IS DISTINCT FROM OLD.status THEN
    -- How many times this lead was un-booked before: each round may close once and reverse once, so flipping the
    -- status back and forth never nets more than one deal.
    SELECT count(*) INTO v_round FROM public.performance_events WHERE lead_id = NEW.id AND kind = 'deal_reversed';
    IF NEW.status = 'booked' THEN
      PERFORM public.record_performance_event(NEW.org_id, NEW.assigned_to, NEW.id, 'deal_closed',
        'deal:' || NEW.id || ':' || v_round);
    ELSIF OLD.status = 'booked' THEN
      SELECT profile_id, xp INTO v_closer, v_xp FROM public.performance_events
       WHERE org_id = NEW.org_id AND dedupe_key = 'deal:' || NEW.id || ':' || v_round;
      IF v_closer IS NOT NULL THEN
        PERFORM public.record_performance_event(NEW.org_id, v_closer, NEW.id, 'deal_reversed',
          'deal_reversed:' || NEW.id || ':' || v_round, now(), -1, 0, -v_xp);
      END IF;
    END IF;
  END IF;
  RETURN NULL;
END $$;
REVOKE ALL ON FUNCTION public.perf_from_lead() FROM PUBLIC, anon, authenticated;
DROP TRIGGER IF EXISTS trg_perf_from_lead ON public.leads_all;
CREATE TRIGGER trg_perf_from_lead AFTER INSERT OR UPDATE OF assigned_to, status ON public.leads_all
  FOR EACH ROW EXECUTE FUNCTION public.perf_from_lead();

-- First contact: the first logged call or WhatsApp by this person on this lead.
CREATE OR REPLACE FUNCTION public.perf_from_activity()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER SET search_path = pg_catalog, public, pg_temp AS $$
DECLARE v_org UUID;
BEGIN
  IF NEW.type::text IN ('call_logged', 'whatsapp_logged') THEN
    SELECT org_id INTO v_org FROM public.leads_all WHERE id = NEW.lead_id;
    PERFORM public.record_performance_event(v_org, NEW.actor_id, NEW.lead_id, 'first_contact',
      'contact:' || NEW.lead_id || ':' || NEW.actor_id, NEW.created_at);
  END IF;
  RETURN NULL;
END $$;
REVOKE ALL ON FUNCTION public.perf_from_activity() FROM PUBLIC, anon, authenticated;
DROP TRIGGER IF EXISTS trg_perf_from_activity ON public.lead_activities;
CREATE TRIGGER trg_perf_from_activity AFTER INSERT ON public.lead_activities
  FOR EACH ROW EXECUTE FUNCTION public.perf_from_activity();

-- Follow-ups done (once per follow-up, credited to whoever it belongs to).
CREATE OR REPLACE FUNCTION public.perf_from_task()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER SET search_path = pg_catalog, public, pg_temp AS $$
BEGIN
  IF NEW.status = 'done' AND OLD.status IS DISTINCT FROM 'done' THEN
    PERFORM public.record_performance_event(NEW.org_id, NEW.assigned_to, NEW.lead_id, 'follow_up_done',
      'follow_up:' || NEW.id, coalesce(NEW.completed_at, now()));
  END IF;
  RETURN NULL;
END $$;
REVOKE ALL ON FUNCTION public.perf_from_task() FROM PUBLIC, anon, authenticated;
DROP TRIGGER IF EXISTS trg_perf_from_task ON public.lead_tasks;
CREATE TRIGGER trg_perf_from_task AFTER UPDATE OF status ON public.lead_tasks
  FOR EACH ROW EXECUTE FUNCTION public.perf_from_task();

-- Site visits completed (once per visit), credited to the visit's salesperson, else the lead's owner.
CREATE OR REPLACE FUNCTION public.perf_from_visit()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER SET search_path = pg_catalog, public, pg_temp AS $$
BEGIN
  IF NEW.status = 'completed' AND (TG_OP = 'INSERT' OR OLD.status IS DISTINCT FROM 'completed') THEN
    PERFORM public.record_performance_event(NEW.org_id,
      coalesce(NEW.assigned_to, (SELECT assigned_to FROM public.leads_all WHERE id = NEW.lead_id)), NEW.lead_id, 'visit_done',
      'visit:' || NEW.id);
  END IF;
  RETURN NULL;
END $$;
REVOKE ALL ON FUNCTION public.perf_from_visit() FROM PUBLIC, anon, authenticated;
DROP TRIGGER IF EXISTS trg_perf_from_visit ON public.site_visits;
CREATE TRIGGER trg_perf_from_visit AFTER INSERT OR UPDATE OF status ON public.site_visits
  FOR EACH ROW EXECUTE FUNCTION public.perf_from_visit();

-- Revenue: a booking's value goes to whoever closed the lead (else its owner); a cancellation reverses it once.
CREATE OR REPLACE FUNCTION public.perf_from_booking()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER SET search_path = pg_catalog, public, pg_temp AS $$
DECLARE v_closer UUID;
BEGIN
  SELECT profile_id INTO v_closer FROM public.performance_events
   WHERE lead_id = NEW.lead_id AND kind = 'deal_closed' ORDER BY occurred_at DESC LIMIT 1;
  v_closer := coalesce(v_closer, (SELECT assigned_to FROM public.leads_all WHERE id = NEW.lead_id));
  IF NEW.status IN ('confirmed', 'agreement_signed', 'registered') AND (TG_OP = 'INSERT' OR OLD.status IN ('draft', 'cancelled')) THEN
    PERFORM public.record_performance_event(NEW.org_id, v_closer, NEW.lead_id, 'revenue',
      'revenue:' || NEW.id || ':' || (SELECT count(*) FROM public.performance_events WHERE dedupe_key LIKE 'revenue:' || NEW.id || ':%'),
      now(), 0, NEW.total_amount, 0);
  ELSIF TG_OP = 'UPDATE' AND NEW.status = 'cancelled' AND OLD.status IN ('confirmed', 'agreement_signed', 'registered') THEN
    PERFORM public.record_performance_event(NEW.org_id, v_closer, NEW.lead_id, 'revenue',
      'revenue:' || NEW.id || ':' || (SELECT count(*) FROM public.performance_events WHERE dedupe_key LIKE 'revenue:' || NEW.id || ':%'),
      now(), 0, -NEW.total_amount, 0, '{"cancelled": true}'::jsonb);
  END IF;
  RETURN NULL;
END $$;
REVOKE ALL ON FUNCTION public.perf_from_booking() FROM PUBLIC, anon, authenticated;
DROP TRIGGER IF EXISTS trg_perf_from_booking ON public.bookings;
CREATE TRIGGER trg_perf_from_booking AFTER INSERT OR UPDATE OF status ON public.bookings
  FOR EACH ROW EXECUTE FUNCTION public.perf_from_booking();

-- ── Rewards: missions, achievements, targets and levels, checked as each event lands ──────────────────────────
-- Celebrations are in-app alerts (no buyer data). During the history backfill below they are recorded silently.
CREATE OR REPLACE FUNCTION public.perf_celebrate(p_org UUID, p_profile UUID, p_title TEXT, p_body TEXT, p_dedupe TEXT)
RETURNS VOID LANGUAGE plpgsql SECURITY DEFINER SET search_path = pg_catalog, public, pg_temp AS $$
BEGIN
  IF current_setting('regrow.perf_backfill', true) = 'on' THEN RETURN; END IF;
  PERFORM public.regrow_notify(p_org, p_profile, 'achievement', p_title, p_body, NULL, p_dedupe);
END $$;
REVOKE ALL ON FUNCTION public.perf_celebrate(UUID, UUID, TEXT, TEXT, TEXT) FROM PUBLIC, anon, authenticated;

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
  v_before INTEGER;
  v_level  TEXT;
BEGIN
  IF NOT v_on THEN RETURN NULL; END IF;

  IF NEW.kind IN ('first_contact', 'follow_up_done', 'visit_done', 'deal_closed', 'deal_reversed', 'revenue', 'lead_assigned') THEN
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

  -- Level up: the highest level whose XP the person has now reached, if it is new.
  IF NEW.xp > 0 THEN
    SELECT coalesce(sum(xp), 0) INTO v_total FROM public.performance_events WHERE org_id = NEW.org_id AND profile_id = NEW.profile_id;
    v_before := v_total - NEW.xp;
    SELECT l ->> 'name' INTO v_level
      FROM jsonb_array_elements(coalesce(v_s -> 'levels',
        '[{"name":"Beginner","xp":0},{"name":"Rising Star","xp":200},{"name":"Performer","xp":600},{"name":"Sales Expert","xp":1500},{"name":"Elite Closer","xp":3500},{"name":"Sales Champion","xp":7000}]'::jsonb)) l
     WHERE jsonb_typeof(l -> 'xp') = 'number' AND (l ->> 'xp')::int > v_before AND (l ->> 'xp')::int <= v_total
     ORDER BY (l ->> 'xp')::int DESC LIMIT 1;
    IF v_level IS NOT NULL THEN
      PERFORM public.perf_celebrate(NEW.org_id, NEW.profile_id, 'Level up: ' || left(v_level, 40) || '!', v_total || ' XP so far.',
        'level:' || NEW.profile_id || ':' || v_level);
    END IF;
  END IF;
  RETURN NULL;
END $$;
REVOKE ALL ON FUNCTION public.perf_rewards() FROM PUBLIC, anon, authenticated;
DROP TRIGGER IF EXISTS trg_perf_rewards ON public.performance_events;
CREATE TRIGGER trg_perf_rewards AFTER INSERT ON public.performance_events
  FOR EACH ROW EXECUTE FUNCTION public.perf_rewards();

-- ── History: the ledger starts complete (events at their real times; celebrations are not sent for the past) ────
SELECT set_config('regrow.perf_backfill', 'on', true);
SELECT public.record_performance_event(l.org_id, l.assigned_to, l.id, 'lead_assigned', 'assigned:' || l.id || ':' || l.assigned_to, coalesce(l.assigned_at, l.created_at))
  FROM public.leads_all l WHERE l.assigned_to IS NOT NULL AND NOT coalesce(l.custom_fields ? 'imported_at', false);
SELECT DISTINCT ON (a.lead_id, a.actor_id) public.record_performance_event(l.org_id, a.actor_id, a.lead_id, 'first_contact', 'contact:' || a.lead_id || ':' || a.actor_id, a.created_at)
  FROM public.lead_activities a JOIN public.leads_all l ON l.id = a.lead_id
 WHERE a.type::text IN ('call_logged', 'whatsapp_logged') ORDER BY a.lead_id, a.actor_id, a.created_at;
SELECT public.record_performance_event(t.org_id, t.assigned_to, t.lead_id, 'follow_up_done', 'follow_up:' || t.id, coalesce(t.completed_at, t.created_at))
  FROM public.lead_tasks t WHERE t.status = 'done';
SELECT public.record_performance_event(v.org_id, coalesce(v.assigned_to, l.assigned_to), v.lead_id, 'visit_done', 'visit:' || v.id, v.updated_at)
  FROM public.site_visits v JOIN public.leads_all l ON l.id = v.lead_id WHERE v.status = 'completed';
SELECT public.record_performance_event(l.org_id, l.assigned_to, l.id, 'deal_closed', 'deal:' || l.id || ':0', l.updated_at)
  FROM public.leads_all l WHERE l.status = 'booked' AND l.assigned_to IS NOT NULL;
SELECT public.record_performance_event(b.org_id, l.assigned_to, b.lead_id, 'revenue', 'revenue:' || b.id || ':0', b.created_at, 0, b.total_amount, 0)
  FROM public.bookings b JOIN public.leads_all l ON l.id = b.lead_id WHERE b.status IN ('confirmed', 'agreement_signed', 'registered');
-- The monthly targets set before this (member_targets) carry over as personal monthly targets.
INSERT INTO public.performance_targets (org_id, scope, profile_id, metric, amount, period, starts_on, ends_on, created_by)
SELECT mt.org_id, 'member', mt.profile_id, x.metric, x.amount, 'month', mt.month, (mt.month + interval '1 month - 1 day')::date, mt.updated_by
  FROM public.member_targets mt
  CROSS JOIN LATERAL (VALUES ('meetings', mt.site_visits::numeric), ('closed', mt.bookings::numeric), ('revenue', mt.booking_value)) x(metric, amount)
 WHERE x.amount IS NOT NULL AND x.amount > 0
   AND EXISTS (SELECT 1 FROM public.org_members m WHERE m.org_id = mt.org_id AND m.profile_id = mt.profile_id);
SELECT set_config('regrow.perf_backfill', 'off', true);

COMMIT;
