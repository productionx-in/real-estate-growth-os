-- 20260098_shared_deal_credit.sql
-- Shared deal credit (docs/product/SALES_ECOSYSTEM_AUDIT.md §3), on the performance ledger (20260094).
--
--   * deal_credit_splits: who shares the credit for one booked lead, and how much (0.01–99.99%). The closer is never
--     listed: they hold the remainder, so the shares always total exactly 100%. Changed only through
--     set_deal_credit(), which checks the shares and keeps a history (deal_credit_history).
--   * The ledger gains `credit`: the fraction of a deal an event is worth to that person. A booking is 1 for the closer
--     (as `units` always was); un-booking is -1. Splitting writes balancing `deal_credit` rows, which move credit,
--     revenue and the deal's points from the closer to the others in proportion. `units` is untouched, so the number
--     of actual deals (one per booked lead, owned by its closer) is kept apart from fractional personal credit.
--   * perf_credit_reconcile() works out what each person should hold for the lead now — from the lead's net booking,
--     its net revenue, the booking's points and the current split — and writes only the difference. While the lead is
--     not booked the shares pause and its last closer holds everything (so revenue is never lost). It runs after a
--     split changes and after every booking, un-booking or revenue event on a split lead, so un-booking a shared deal
--     takes everyone's share back, and running it twice changes nothing. Ledger rows are never updated or deleted.
--   * "closed" now means credit (targets, missions, achievements and leaderboards read gam_metric); a new "deals"
--     metric counts actual deals. Revenue includes revenue moved by a split.
-- Additive. New tables are server-only: RLS on, no client privileges.

BEGIN;

-- ── Ledger: credit ─────────────────────────────────────────────────────────────────────────────────────────────
ALTER TABLE public.performance_events ADD COLUMN IF NOT EXISTS credit NUMERIC(7, 4) NOT NULL DEFAULT 0
  CHECK (credit BETWEEN -1 AND 1);
ALTER TABLE public.performance_events DROP CONSTRAINT IF EXISTS performance_events_kind_check;
ALTER TABLE public.performance_events ADD CONSTRAINT performance_events_kind_check CHECK (kind IN ('lead_assigned',
  'first_contact', 'follow_up_done', 'visit_done', 'deal_closed', 'deal_reversed', 'revenue', 'mission', 'achievement',
  'target_hit', 'adjustment', 'deal_credit'));

-- A booking and its reversal carry their whole deal as credit; every other kind carries what it is given (deal_credit)
-- or nothing.
CREATE OR REPLACE FUNCTION public.perf_event_credit()
RETURNS TRIGGER LANGUAGE plpgsql SET search_path = pg_catalog, public, pg_temp AS $$
BEGIN
  IF NEW.kind IN ('deal_closed', 'deal_reversed') THEN NEW.credit := NEW.units;
  ELSIF NEW.kind <> 'deal_credit' THEN NEW.credit := 0;
  END IF;
  RETURN NEW;
END $$;
REVOKE ALL ON FUNCTION public.perf_event_credit() FROM PUBLIC, anon, authenticated;
DROP TRIGGER IF EXISTS trg_perf_event_credit ON public.performance_events;
CREATE TRIGGER trg_perf_event_credit BEFORE INSERT ON public.performance_events
  FOR EACH ROW EXECUTE FUNCTION public.perf_event_credit();

-- Existing bookings and reversals (the ledger is append-only; this fills the new column once).
UPDATE public.performance_events SET credit = units WHERE kind IN ('deal_closed', 'deal_reversed') AND credit = 0;

-- ── Splits and their history ───────────────────────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.deal_credit_splits (
  org_id      UUID NOT NULL REFERENCES public.organisations(id) ON DELETE CASCADE,
  lead_id     UUID NOT NULL REFERENCES public.leads_all(id) ON DELETE CASCADE,
  profile_id  UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  share_pct   NUMERIC(5, 2) NOT NULL CHECK (share_pct > 0 AND share_pct < 100),
  created_by  UUID REFERENCES public.profiles(id) ON DELETE SET NULL,
  updated_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (lead_id, profile_id)
);
CREATE INDEX IF NOT EXISTS idx_deal_credit_splits_org ON public.deal_credit_splits (org_id, profile_id);
ALTER TABLE public.deal_credit_splits ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.deal_credit_splits FROM PUBLIC, anon, authenticated;
GRANT SELECT ON public.deal_credit_splits TO service_role;

CREATE TABLE IF NOT EXISTS public.deal_credit_history (
  id          BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  org_id      UUID NOT NULL REFERENCES public.organisations(id) ON DELETE CASCADE,
  lead_id     UUID NOT NULL REFERENCES public.leads_all(id) ON DELETE CASCADE,
  closer_id   UUID REFERENCES public.profiles(id) ON DELETE SET NULL,
  before      JSONB NOT NULL DEFAULT '[]'::jsonb,
  after       JSONB NOT NULL DEFAULT '[]'::jsonb,
  reason      TEXT CHECK (reason IS NULL OR length(reason) <= 300),
  changed_by  UUID REFERENCES public.profiles(id) ON DELETE SET NULL,
  changed_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_deal_credit_history_lead ON public.deal_credit_history (org_id, lead_id, changed_at DESC);
ALTER TABLE public.deal_credit_history ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.deal_credit_history FROM PUBLIC, anon, authenticated;
GRANT SELECT ON public.deal_credit_history TO service_role;

-- Whoever holds the lead's current booking (the latest booking not yet reversed), or NULL when it is not booked.
CREATE OR REPLACE FUNCTION public.deal_closer(p_org UUID, p_lead UUID)
RETURNS UUID LANGUAGE sql STABLE SECURITY DEFINER SET search_path = pg_catalog, public AS $$
  SELECT e.profile_id FROM public.performance_events e
   WHERE e.org_id = p_org AND e.lead_id = p_lead AND e.kind = 'deal_closed'
     AND NOT EXISTS (SELECT 1 FROM public.performance_events r WHERE r.org_id = p_org
                      AND r.dedupe_key = 'deal_reversed:' || substr(e.dedupe_key, 6))
   ORDER BY e.occurred_at DESC LIMIT 1
$$;
REVOKE ALL ON FUNCTION public.deal_closer(UUID, UUID) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.deal_closer(UUID, UUID) TO service_role;

-- Bring the ledger in line with the lead's split. Writes one deal_credit row per person whose holding differs.
CREATE OR REPLACE FUNCTION public.perf_credit_reconcile(p_org UUID, p_lead UUID, p_by UUID DEFAULT NULL)
RETURNS INTEGER LANGUAGE plpgsql SECURITY DEFINER SET search_path = pg_catalog, public, pg_temp AS $$
DECLARE
  v_closer   UUID;     -- holds the current booking, or NULL when the lead is not booked
  v_holder   UUID;     -- takes the remainder: the closer, else whoever last closed it (or was last given its revenue)
  v_credit   NUMERIC;  -- net deal on this lead (0 or 1)
  v_revenue  NUMERIC;  -- net revenue on this lead
  v_xp       INTEGER;  -- net points the booking earned
  v_others   NUMERIC := 0;
  v_written  INTEGER := 0;
  p          RECORD;
  v_want_c   NUMERIC; v_want_r NUMERIC; v_want_x INTEGER;
  v_sum_c    NUMERIC := 0; v_sum_r NUMERIC := 0; v_sum_x INTEGER := 0;
  v_n        INTEGER;
BEGIN
  -- One reconcile per lead at a time, so two changes can never both write the same difference.
  PERFORM pg_advisory_xact_lock(hashtextextended('deal_credit:' || p_lead::text, 0));
  v_closer := public.deal_closer(p_org, p_lead);
  v_holder := coalesce(v_closer,
    (SELECT e.profile_id FROM public.performance_events e WHERE e.org_id = p_org AND e.lead_id = p_lead AND e.kind = 'deal_closed' ORDER BY e.occurred_at DESC LIMIT 1),
    (SELECT e.profile_id FROM public.performance_events e WHERE e.org_id = p_org AND e.lead_id = p_lead AND e.kind = 'revenue' ORDER BY e.occurred_at DESC LIMIT 1));
  SELECT coalesce(sum(e.credit) FILTER (WHERE e.kind IN ('deal_closed', 'deal_reversed')), 0),
         coalesce(sum(e.value) FILTER (WHERE e.kind = 'revenue'), 0),
         coalesce(sum(e.xp) FILTER (WHERE e.kind IN ('deal_closed', 'deal_reversed')), 0)
    INTO v_credit, v_revenue, v_xp
    FROM public.performance_events e WHERE e.org_id = p_org AND e.lead_id = p_lead;

  -- Everyone who holds something on this lead now, or should: the closer, the split, and anyone with earlier credit.
  FOR p IN
    WITH people AS (
      SELECT v_holder AS profile_id WHERE v_holder IS NOT NULL
      UNION SELECT s.profile_id FROM public.deal_credit_splits s WHERE s.lead_id = p_lead AND s.org_id = p_org
      UNION SELECT e.profile_id FROM public.performance_events e
             WHERE e.org_id = p_org AND e.lead_id = p_lead AND e.kind IN ('deal_closed', 'deal_reversed', 'revenue', 'deal_credit'))
    SELECT pe.profile_id,
           coalesce((SELECT s.share_pct FROM public.deal_credit_splits s WHERE s.lead_id = p_lead AND s.org_id = p_org
                      AND s.profile_id = pe.profile_id AND pe.profile_id IS DISTINCT FROM v_holder), 0) / 100 AS share,
           coalesce(sum(e.credit) FILTER (WHERE e.kind IN ('deal_closed', 'deal_reversed', 'deal_credit')), 0) AS has_c,
           coalesce(sum(e.value) FILTER (WHERE e.kind IN ('revenue', 'deal_credit')), 0) AS has_r,
           coalesce(sum(e.xp) FILTER (WHERE e.kind IN ('deal_closed', 'deal_reversed', 'deal_credit')), 0) AS has_x
      FROM people pe
      LEFT JOIN public.performance_events e ON e.org_id = p_org AND e.lead_id = p_lead AND e.profile_id = pe.profile_id
     GROUP BY pe.profile_id
     -- The holder last: they take whatever the shares and rounding leave.
     ORDER BY (pe.profile_id IS NOT DISTINCT FROM v_holder), pe.profile_id
  LOOP
    IF p.profile_id IS NOT DISTINCT FROM v_holder THEN
      v_want_c := v_credit - v_sum_c; v_want_r := v_revenue - v_sum_r; v_want_x := v_xp - v_sum_x;
    ELSE
      -- Not booked (no closer) → shares are paused; the holder keeps everything until it is booked again.
      v_want_c := CASE WHEN v_closer IS NULL THEN 0 ELSE round(v_credit * p.share, 4) END;
      v_want_r := CASE WHEN v_closer IS NULL THEN 0 ELSE round(v_revenue * p.share, 2) END;
      v_want_x := CASE WHEN v_closer IS NULL THEN 0 ELSE round(v_xp * p.share)::int END;
      v_sum_c := v_sum_c + v_want_c; v_sum_r := v_sum_r + v_want_r; v_sum_x := v_sum_x + v_want_x;
    END IF;
    IF v_want_c <> p.has_c OR v_want_r <> p.has_r OR v_want_x <> p.has_x THEN
      SELECT count(*) INTO v_n FROM public.performance_events
       WHERE org_id = p_org AND lead_id = p_lead AND profile_id = p.profile_id AND kind = 'deal_credit';
      INSERT INTO public.performance_events (org_id, profile_id, lead_id, kind, units, value, xp, credit, dedupe_key, detail, created_by)
      VALUES (p_org, p.profile_id, p_lead, 'deal_credit', 0, v_want_r - p.has_r, v_want_x - p.has_x, v_want_c - p.has_c,
              'credit:' || p_lead || ':' || p.profile_id || ':' || v_n,
              jsonb_build_object('share_pct', round(p.share * 100, 2), 'closer', p.profile_id IS NOT DISTINCT FROM v_holder), p_by)
      ON CONFLICT (org_id, dedupe_key) DO NOTHING;
      IF FOUND THEN
        v_written := v_written + 1;
        IF v_want_c - p.has_c > 0 AND p.profile_id IS DISTINCT FROM v_holder THEN
          PERFORM public.perf_celebrate(p_org, p.profile_id, 'You share credit for a booking',
            round(p.share * 100, 2) || '% of the deal is credited to you.', 'credit:' || p_lead || ':' || p.profile_id || ':' || v_n);
        END IF;
      END IF;
    END IF;
  END LOOP;
  RETURN v_written;
END $$;
REVOKE ALL ON FUNCTION public.perf_credit_reconcile(UUID, UUID, UUID) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.perf_credit_reconcile(UUID, UUID, UUID) TO service_role;

-- After a booking, un-booking or revenue event on a lead that is split, move the shares again.
CREATE OR REPLACE FUNCTION public.perf_credit_follow()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER SET search_path = pg_catalog, public, pg_temp AS $$
BEGIN
  IF NEW.lead_id IS NOT NULL AND (
       EXISTS (SELECT 1 FROM public.deal_credit_splits s WHERE s.lead_id = NEW.lead_id AND s.org_id = NEW.org_id)
    OR EXISTS (SELECT 1 FROM public.performance_events e WHERE e.org_id = NEW.org_id AND e.lead_id = NEW.lead_id AND e.kind = 'deal_credit')) THEN
    PERFORM public.perf_credit_reconcile(NEW.org_id, NEW.lead_id, NULL);
  END IF;
  RETURN NULL;
END $$;
REVOKE ALL ON FUNCTION public.perf_credit_follow() FROM PUBLIC, anon, authenticated;
DROP TRIGGER IF EXISTS trg_perf_credit_follow ON public.performance_events;
CREATE TRIGGER trg_perf_credit_follow AFTER INSERT ON public.performance_events
  FOR EACH ROW WHEN (NEW.kind IN ('deal_closed', 'deal_reversed', 'revenue')) EXECUTE FUNCTION public.perf_credit_follow();

-- The one way to change a split. p_shares: [{"profileId": "...", "sharePct": 30}, …] — up to 9 people other than the
-- closer, each an active member of the workspace, totalling less than 100. An empty list gives the closer everything.
-- Returns the history row's id. Who may call it is decided by the server (owner, admin, manager, or the closer's team
-- leader); this checks everything about the shares themselves.
CREATE OR REPLACE FUNCTION public.set_deal_credit(p_org UUID, p_lead UUID, p_shares JSONB, p_by UUID, p_reason TEXT DEFAULT NULL)
RETURNS BIGINT LANGUAGE plpgsql SECURITY DEFINER SET search_path = pg_catalog, public, pg_temp AS $$
DECLARE
  v_closer UUID;
  v_before JSONB;
  v_after  JSONB;
  v_total  NUMERIC;
  v_id     BIGINT;
  x        JSONB;
BEGIN
  IF NOT EXISTS (SELECT 1 FROM public.leads_all l WHERE l.id = p_lead AND l.org_id = p_org AND l.status = 'booked') THEN
    RAISE EXCEPTION 'not_booked' USING ERRCODE = 'P0001';
  END IF;
  v_closer := public.deal_closer(p_org, p_lead);
  IF v_closer IS NULL THEN RAISE EXCEPTION 'no_closer' USING ERRCODE = 'P0001'; END IF;
  IF jsonb_typeof(p_shares) <> 'array' OR jsonb_array_length(p_shares) > 9 THEN RAISE EXCEPTION 'invalid_shares' USING ERRCODE = 'P0001'; END IF;
  FOR x IN SELECT * FROM jsonb_array_elements(p_shares) LOOP
    IF jsonb_typeof(x -> 'sharePct') <> 'number' OR (x ->> 'sharePct')::numeric <= 0 OR (x ->> 'sharePct')::numeric >= 100
       OR round((x ->> 'sharePct')::numeric, 2) <> (x ->> 'sharePct')::numeric THEN
      RAISE EXCEPTION 'invalid_share' USING ERRCODE = 'P0001';
    END IF;
    IF (x ->> 'profileId') IS NULL OR (x ->> 'profileId') = v_closer::text THEN RAISE EXCEPTION 'invalid_person' USING ERRCODE = 'P0001'; END IF;
    IF NOT EXISTS (SELECT 1 FROM public.org_members m WHERE m.org_id = p_org AND m.profile_id::text = x ->> 'profileId' AND m.status = 'active'
                    AND m.role IN ('owner', 'admin', 'manager', 'team_lead', 'sales_exec')) THEN
      RAISE EXCEPTION 'invalid_person' USING ERRCODE = 'P0001';
    END IF;
  END LOOP;
  IF (SELECT count(DISTINCT e ->> 'profileId') FROM jsonb_array_elements(p_shares) e) <> jsonb_array_length(p_shares) THEN
    RAISE EXCEPTION 'duplicate_person' USING ERRCODE = 'P0001';
  END IF;
  SELECT coalesce(sum((e ->> 'sharePct')::numeric), 0) INTO v_total FROM jsonb_array_elements(p_shares) e;
  IF v_total >= 100 THEN RAISE EXCEPTION 'over_100' USING ERRCODE = 'P0001'; END IF;

  PERFORM pg_advisory_xact_lock(hashtextextended('deal_credit:' || p_lead::text, 0));
  SELECT coalesce(jsonb_agg(jsonb_build_object('profileId', s.profile_id, 'sharePct', s.share_pct) ORDER BY s.profile_id), '[]'::jsonb)
    INTO v_before FROM public.deal_credit_splits s WHERE s.lead_id = p_lead AND s.org_id = p_org;
  DELETE FROM public.deal_credit_splits WHERE lead_id = p_lead AND org_id = p_org;
  INSERT INTO public.deal_credit_splits (org_id, lead_id, profile_id, share_pct, created_by)
  SELECT p_org, p_lead, (e ->> 'profileId')::uuid, (e ->> 'sharePct')::numeric, p_by FROM jsonb_array_elements(p_shares) e;
  SELECT coalesce(jsonb_agg(jsonb_build_object('profileId', s.profile_id, 'sharePct', s.share_pct) ORDER BY s.profile_id), '[]'::jsonb)
    INTO v_after FROM public.deal_credit_splits s WHERE s.lead_id = p_lead AND s.org_id = p_org;
  IF v_before = v_after THEN RETURN NULL; END IF;
  INSERT INTO public.deal_credit_history (org_id, lead_id, closer_id, before, after, reason, changed_by)
  VALUES (p_org, p_lead, v_closer, v_before, v_after, nullif(left(trim(coalesce(p_reason, '')), 300), ''), p_by)
  RETURNING id INTO v_id;
  PERFORM public.perf_credit_reconcile(p_org, p_lead, p_by);
  RETURN v_id;
END $$;
REVOKE ALL ON FUNCTION public.set_deal_credit(UUID, UUID, JSONB, UUID, TEXT) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.set_deal_credit(UUID, UUID, JSONB, UUID, TEXT) TO service_role;

-- ── Metrics: "closed" is credit, "deals" is actual deals, revenue includes shares ──────────────────────────────
CREATE OR REPLACE FUNCTION public.gam_metric(p_org UUID, p_profile UUID, p_metric TEXT, p_from TIMESTAMPTZ, p_to TIMESTAMPTZ)
RETURNS NUMERIC LANGUAGE sql STABLE SECURITY DEFINER SET search_path = pg_catalog, public AS $$
  SELECT coalesce(CASE p_metric
      WHEN 'revenue' THEN sum(e.value) FILTER (WHERE e.kind IN ('revenue', 'deal_credit'))
      WHEN 'xp'      THEN sum(e.xp)
      WHEN 'closed'  THEN sum(e.credit) FILTER (WHERE e.kind IN ('deal_closed', 'deal_reversed', 'deal_credit'))
      WHEN 'deals'   THEN sum(e.units) FILTER (WHERE e.kind IN ('deal_closed', 'deal_reversed'))
      ELSE sum(e.units) FILTER (WHERE e.kind = ANY (CASE p_metric
        WHEN 'assigned' THEN ARRAY['lead_assigned'] WHEN 'contacted' THEN ARRAY['first_contact']
        WHEN 'follow_ups' THEN ARRAY['follow_up_done'] WHEN 'meetings' THEN ARRAY['visit_done']
        WHEN 'missions' THEN ARRAY['mission'] WHEN 'targets' THEN ARRAY['target_hit'] ELSE ARRAY[]::text[] END))
    END, 0)
  FROM public.performance_events e
  WHERE e.org_id = p_org AND e.profile_id = p_profile AND e.occurred_at >= p_from AND e.occurred_at < p_to
$$;
REVOKE ALL ON FUNCTION public.gam_metric(UUID, UUID, TEXT, TIMESTAMPTZ, TIMESTAMPTZ) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.gam_metric(UUID, UUID, TEXT, TIMESTAMPTZ, TIMESTAMPTZ) TO service_role;

-- ── Rewards: verbatim from 20260094, with deal_credit added to what re-checks missions and targets ──────────────
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

COMMIT;
