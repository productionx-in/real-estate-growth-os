-- 20260042_speed_to_lead_reporting.sql
-- REGrow M3 — Prove & repeat: the numbers a developer buys REGrow for.
--
--   lead_response_report(org, from, to) → JSONB with
--     overall     : leads, contacted, never contacted, median / p90 minutes to first action, % within target, missed
--     by_rep      : the same per salesperson (current owner)
--     by_source   : the same per source + quality (junk %, qualified-or-better %, site-visit %, booked)
--     by_project  : the same per project
--     by_hour     : leads and median response by hour of arrival (organisation's local time)
--
-- "Response time" = first action − lead creation (what the buyer experiences), in minutes.
-- "Within target" = first action at or before the response deadline (sla_state = 'met').
-- Server-only (service role): the API checks the caller is a manager of the organisation first.

BEGIN;

CREATE OR REPLACE FUNCTION public.lead_response_report(p_org UUID, p_from TIMESTAMPTZ, p_to TIMESTAMPTZ)
RETURNS JSONB
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = pg_catalog, public, pg_temp
AS $$
  WITH tz AS (
    SELECT coalesce((SELECT timezone FROM public.lead_response_settings WHERE org_id = p_org), 'Asia/Kolkata') AS name
  ),
  base AS (
    SELECT l.id, l.assigned_to, l.source::text AS source, l.project_id, l.status::text AS status, l.created_at,
           l.first_action_at, l.sla_state,
           CASE WHEN l.first_action_at IS NOT NULL
                THEN greatest(0, extract(epoch FROM (l.first_action_at - l.created_at)) / 60.0) END AS response_min,
           l.status IN ('qualified', 'site_visit_scheduled', 'site_visited', 'negotiation', 'booked') AS qualified_plus,
           l.status IN ('site_visit_scheduled', 'site_visited', 'negotiation', 'booked') AS visit_plus
    FROM public.leads l
    WHERE l.org_id = p_org AND l.created_at >= p_from AND l.created_at < p_to
      AND coalesce(l.is_duplicate, false) = false
  ),
  agg AS (
    SELECT 'overall'::text AS dim, NULL::text AS key, b.* FROM base b
    UNION ALL SELECT 'rep', b.assigned_to::text, b.* FROM base b
    UNION ALL SELECT 'source', b.source, b.* FROM base b
    UNION ALL SELECT 'project', b.project_id::text, b.* FROM base b
  ),
  stats AS (
    SELECT dim, key,
           count(*)                                                     AS leads,
           count(first_action_at)                                       AS contacted,
           count(*) FILTER (WHERE first_action_at IS NULL AND status NOT IN ('junk', 'lost', 'booked')) AS never_contacted,
           round((percentile_cont(0.5) WITHIN GROUP (ORDER BY response_min))::numeric, 1) AS median_min,
           round((percentile_cont(0.9) WITHIN GROUP (ORDER BY response_min))::numeric, 1) AS p90_min,
           count(*) FILTER (WHERE sla_state = 'met')                    AS within_target,
           count(*) FILTER (WHERE sla_state = 'breached')               AS missed,
           count(*) FILTER (WHERE sla_state IS NOT NULL)                AS timed,
           count(*) FILTER (WHERE status = 'junk')                      AS junk,
           count(*) FILTER (WHERE qualified_plus)                       AS qualified_plus,
           count(*) FILTER (WHERE visit_plus)                           AS site_visits,
           count(*) FILTER (WHERE status = 'booked')                    AS booked
    FROM agg GROUP BY dim, key
  ),
  shaped AS (
    SELECT s.*,
           CASE dim WHEN 'rep' THEN (SELECT full_name FROM public.profiles WHERE id::text = s.key)
                    WHEN 'project' THEN (SELECT name FROM public.projects WHERE id::text = s.key) END AS label
    FROM stats s
  ),
  hours AS (
    SELECT extract(hour FROM b.created_at AT TIME ZONE (SELECT name FROM tz))::int AS hour,
           count(*) AS leads,
           round((percentile_cont(0.5) WITHIN GROUP (ORDER BY b.response_min))::numeric, 1) AS median_min
    FROM base b GROUP BY 1
  ),
  to_json AS (
    SELECT dim, jsonb_build_object(
      'key', key, 'label', label, 'leads', leads, 'contacted', contacted, 'never_contacted', never_contacted,
      'median_min', median_min, 'p90_min', p90_min, 'within_target', within_target, 'missed', missed, 'timed', timed,
      'junk', junk, 'qualified_plus', qualified_plus, 'site_visits', site_visits, 'booked', booked) AS row, leads
    FROM shaped
  )
  SELECT jsonb_build_object(
    'from', p_from, 'to', p_to, 'timezone', (SELECT name FROM tz),
    'overall', coalesce((SELECT row FROM to_json WHERE dim = 'overall'),
                        jsonb_build_object('leads', 0, 'contacted', 0, 'never_contacted', 0, 'within_target', 0, 'missed', 0, 'timed', 0,
                                           'junk', 0, 'qualified_plus', 0, 'site_visits', 0, 'booked', 0)),
    'by_rep',     coalesce((SELECT jsonb_agg(row ORDER BY leads DESC) FROM to_json WHERE dim = 'rep'), '[]'::jsonb),
    'by_source',  coalesce((SELECT jsonb_agg(row ORDER BY leads DESC) FROM to_json WHERE dim = 'source'), '[]'::jsonb),
    'by_project', coalesce((SELECT jsonb_agg(row ORDER BY leads DESC) FROM to_json WHERE dim = 'project'), '[]'::jsonb),
    'by_hour',    coalesce((SELECT jsonb_agg(jsonb_build_object('hour', hour, 'leads', leads, 'median_min', median_min) ORDER BY hour) FROM hours), '[]'::jsonb)
  );
$$;
REVOKE ALL ON FUNCTION public.lead_response_report(UUID, TIMESTAMPTZ, TIMESTAMPTZ) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.lead_response_report(UUID, TIMESTAMPTZ, TIMESTAMPTZ) TO service_role;

-- Reporting reads leads by organisation and creation time.
CREATE INDEX IF NOT EXISTS idx_leads_org_created ON public.leads (org_id, created_at);

COMMIT;
