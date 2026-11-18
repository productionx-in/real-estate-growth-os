-- 20260057_lead_merge_tags_timing.sql
-- Three gaps in the lead foundation:
--   1. Stage timing: when the buyer submitted (where the source says) and when our server received the lead,
--      so each step can be measured: submitted → received → saved → assigned → first action.
--   2. Tags: short labels on a lead (lowercase, up to 10, 1–30 characters), filterable.
--   3. Merge: a duplicate is merged into the main record. Nothing is deleted: the duplicate stays, marked
--      "merged into" the main lead and closed as junk, with a snapshot in the main lead's timeline and in the
--      organisation's audit log. Activities, tasks, visits, deals, bookings, holds, WhatsApp chats, touchpoints
--      and notifications move to the main lead; append-only history (routing decisions, assignment history)
--      and shared documents (whose links must keep working) stay on the merged record, which links onward.
BEGIN;

-- ── 1. Stage timing ─────────────────────────────────────────────────────────────────────────────
ALTER TABLE public.leads
  ADD COLUMN IF NOT EXISTS source_submitted_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS received_at TIMESTAMPTZ;
-- (merge columns, used by the timing report too)
ALTER TABLE public.leads
  ADD COLUMN IF NOT EXISTS merged_into_id UUID REFERENCES public.leads(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS merged_at TIMESTAMPTZ;
CREATE INDEX IF NOT EXISTS idx_leads_merged_into ON public.leads (merged_into_id) WHERE merged_into_id IS NOT NULL;

-- Seconds per stage for leads created in the period: median, 90th percentile and how many were measured.
CREATE OR REPLACE FUNCTION public.lead_pipeline_timing(p_org UUID, p_from TIMESTAMPTZ, p_to TIMESTAMPTZ)
RETURNS JSONB
LANGUAGE sql STABLE SECURITY DEFINER
SET search_path = pg_catalog, public, pg_temp
AS $$
  WITH base AS (
    SELECT extract(epoch FROM (received_at - source_submitted_at)) AS submit_to_receipt,
           extract(epoch FROM (created_at - received_at))          AS receipt_to_saved,
           extract(epoch FROM (assigned_at - created_at))          AS saved_to_assigned,
           extract(epoch FROM (first_action_at - assigned_at))     AS assigned_to_first_action
    FROM public.leads
    WHERE org_id = p_org AND created_at >= p_from AND created_at < p_to AND merged_into_id IS NULL
  ),
  stage AS (
    SELECT 'submit_to_receipt' AS k, submit_to_receipt AS s FROM base WHERE submit_to_receipt >= 0
    UNION ALL SELECT 'receipt_to_saved', receipt_to_saved FROM base WHERE receipt_to_saved >= 0
    UNION ALL SELECT 'saved_to_assigned', saved_to_assigned FROM base WHERE saved_to_assigned >= 0
    UNION ALL SELECT 'assigned_to_first_action', assigned_to_first_action FROM base WHERE assigned_to_first_action >= 0
  )
  SELECT jsonb_build_object(
    'leads', (SELECT count(*) FROM base),
    'stages', coalesce((SELECT jsonb_object_agg(k, jsonb_build_object(
        'n', n, 'p50', round(p50::numeric, 1), 'p90', round(p90::numeric, 1)))
      FROM (SELECT k, count(*) n, percentile_cont(0.5) WITHIN GROUP (ORDER BY s) p50, percentile_cont(0.9) WITHIN GROUP (ORDER BY s) p90
            FROM stage GROUP BY k) t), '{}'::jsonb),
    'saved_within_30s', (SELECT count(*) FROM base WHERE receipt_to_saved BETWEEN 0 AND 30),
    'saved_measured', (SELECT count(*) FROM base WHERE receipt_to_saved >= 0),
    'assigned_within_5s', (SELECT count(*) FROM base WHERE saved_to_assigned BETWEEN 0 AND 5),
    'assigned_measured', (SELECT count(*) FROM base WHERE saved_to_assigned >= 0)
  );
$$;

-- ── 2. Tags ─────────────────────────────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.regrow_valid_tags(p_tags TEXT[])
RETURNS BOOLEAN LANGUAGE sql IMMUTABLE SET search_path = pg_catalog, public, pg_temp
AS $$
  SELECT coalesce(cardinality(p_tags), 0) <= 10
     AND NOT EXISTS (SELECT 1 FROM unnest(coalesce(p_tags, '{}')) t WHERE t !~ '^[a-z0-9][a-z0-9 -]{0,29}$')
$$;

ALTER TABLE public.leads ADD COLUMN IF NOT EXISTS tags TEXT[] NOT NULL DEFAULT '{}';
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'leads_tags_valid') THEN
    ALTER TABLE public.leads ADD CONSTRAINT leads_tags_valid CHECK (public.regrow_valid_tags(tags));
  END IF;
END $$;
CREATE INDEX IF NOT EXISTS idx_leads_tags ON public.leads USING gin (tags);

-- ── 3. Merge ────────────────────────────────────────────────────────────────────────────────────

CREATE OR REPLACE FUNCTION public.merge_leads(p_org UUID, p_target UUID, p_source UUID, p_actor_profile UUID)
RETURNS JSONB
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = pg_catalog, public, pg_temp
AS $$
DECLARE
  t RECORD; s RECORD; v_moved JSONB := '{}'::jsonb; v_n INT; v_snapshot JSONB;
BEGIN
  IF p_target = p_source THEN RAISE EXCEPTION 'merge: pick two different leads' USING ERRCODE = 'check_violation'; END IF;
  -- Lock both, in a fixed order, so two merges of the same pair cannot interleave.
  PERFORM 1 FROM public.leads WHERE id IN (p_target, p_source) ORDER BY id FOR UPDATE;
  SELECT * INTO t FROM public.leads WHERE id = p_target AND org_id = p_org;
  SELECT * INTO s FROM public.leads WHERE id = p_source AND org_id = p_org;
  IF t.id IS NULL OR s.id IS NULL THEN RAISE EXCEPTION 'merge: lead not found' USING ERRCODE = 'no_data_found'; END IF;
  IF s.merged_into_id IS NOT NULL THEN RAISE EXCEPTION 'merge: that lead was already merged' USING ERRCODE = 'check_violation'; END IF;
  IF t.merged_into_id IS NOT NULL THEN RAISE EXCEPTION 'merge: the main lead was itself merged into another' USING ERRCODE = 'check_violation'; END IF;

  v_snapshot := to_jsonb(s) - 'custom_fields' - 'source_metadata';

  UPDATE public.lead_activities SET lead_id = p_target WHERE lead_id = p_source; GET DIAGNOSTICS v_n = ROW_COUNT; v_moved := v_moved || jsonb_build_object('activities', v_n);
  UPDATE public.lead_tasks SET lead_id = p_target WHERE lead_id = p_source; GET DIAGNOSTICS v_n = ROW_COUNT; v_moved := v_moved || jsonb_build_object('tasks', v_n);
  UPDATE public.site_visits SET lead_id = p_target WHERE lead_id = p_source; GET DIAGNOSTICS v_n = ROW_COUNT; v_moved := v_moved || jsonb_build_object('site_visits', v_n);
  UPDATE public.deals SET lead_id = p_target WHERE lead_id = p_source; GET DIAGNOSTICS v_n = ROW_COUNT; v_moved := v_moved || jsonb_build_object('deals', v_n);
  UPDATE public.bookings SET lead_id = p_target WHERE lead_id = p_source; GET DIAGNOSTICS v_n = ROW_COUNT; v_moved := v_moved || jsonb_build_object('bookings', v_n);
  UPDATE public.inventory_blockings SET lead_id = p_target WHERE lead_id = p_source; GET DIAGNOSTICS v_n = ROW_COUNT; v_moved := v_moved || jsonb_build_object('holds', v_n);
  UPDATE public.lead_touchpoints SET lead_id = p_target WHERE lead_id = p_source; GET DIAGNOSTICS v_n = ROW_COUNT; v_moved := v_moved || jsonb_build_object('touchpoints', v_n);
  UPDATE public.whatsapp_conversations SET lead_id = p_target WHERE lead_id = p_source; GET DIAGNOSTICS v_n = ROW_COUNT; v_moved := v_moved || jsonb_build_object('whatsapp_conversations', v_n);
  UPDATE public.whatsapp_messages SET lead_id = p_target WHERE lead_id = p_source;
  UPDATE public.notifications SET lead_id = p_target WHERE lead_id = p_source;
  UPDATE public.leads SET duplicate_of_id = p_target WHERE duplicate_of_id = p_source AND id <> p_target;

  -- Fill the main lead's gaps from the duplicate; never overwrite what it already has.
  UPDATE public.leads SET
    email = coalesce(t.email, s.email),
    project_id = coalesce(t.project_id, s.project_id),
    budget_min = coalesce(t.budget_min, s.budget_min),
    budget_max = coalesce(t.budget_max, s.budget_max),
    req_configurations = CASE WHEN cardinality(t.req_configurations) > 0 THEN t.req_configurations ELSE s.req_configurations END,
    req_categories = CASE WHEN cardinality(t.req_categories) > 0 THEN t.req_categories ELSE s.req_categories END,
    req_locations = CASE WHEN cardinality(t.req_locations) > 0 THEN t.req_locations ELSE s.req_locations END,
    req_facing = CASE WHEN cardinality(t.req_facing) > 0 THEN t.req_facing ELSE s.req_facing END,
    req_min_area = coalesce(t.req_min_area, s.req_min_area),
    req_max_area = coalesce(t.req_max_area, s.req_max_area),
    tags = (SELECT coalesce(array_agg(DISTINCT x ORDER BY x), '{}') FROM (SELECT unnest(t.tags || s.tags) x LIMIT 10) u),
    notes = CASE WHEN coalesce(btrim(s.notes), '') = '' THEN t.notes
                 WHEN coalesce(btrim(t.notes), '') = '' THEN s.notes
                 ELSE t.notes || E'\n\n[From merged lead] ' || s.notes END,
    is_duplicate = CASE WHEN t.duplicate_of_id = p_source THEN false ELSE t.is_duplicate END,
    duplicate_of_id = CASE WHEN t.duplicate_of_id = p_source THEN NULL ELSE t.duplicate_of_id END
  WHERE id = p_target;

  UPDATE public.leads SET merged_into_id = p_target, merged_at = now(), status = 'junk',
         is_duplicate = true, duplicate_of_id = p_target, next_follow_up_at = NULL,
         sla_state = CASE WHEN sla_state = 'pending' THEN NULL ELSE sla_state END
  WHERE id = p_source;

  INSERT INTO public.lead_activities (lead_id, actor_id, type, note, metadata)
  VALUES (p_target, p_actor_profile, 'note_added', 'Merged a duplicate record into this lead: ' || s.name || ' (' || coalesce(s.phone, '') || ')',
          jsonb_build_object('merged_lead_id', p_source, 'moved', v_moved, 'snapshot', v_snapshot));
  INSERT INTO public.org_audit_logs (org_id, actor_kind, actor_profile_id, action, target_type, target_id, metadata)
  VALUES (p_org, 'member', p_actor_profile, 'lead.merged', 'lead', p_target::text,
          jsonb_build_object('merged_lead_id', p_source, 'moved', v_moved, 'snapshot', v_snapshot));
  RETURN jsonb_build_object('target', p_target, 'source', p_source, 'moved', v_moved);
END;
$$;

REVOKE ALL ON FUNCTION public.merge_leads(UUID, UUID, UUID, UUID) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.merge_leads(UUID, UUID, UUID, UUID) TO service_role;
REVOKE ALL ON FUNCTION public.lead_pipeline_timing(UUID, TIMESTAMPTZ, TIMESTAMPTZ) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.lead_pipeline_timing(UUID, TIMESTAMPTZ, TIMESTAMPTZ) TO service_role;

COMMIT;
