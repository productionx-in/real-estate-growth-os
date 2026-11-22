-- 20260083_plot_map_publishing.sql
-- Interactive Plot Map, review and publishing (docs/product/PLOT_MAP_ADDON.md §5).
--   * plot_map_reviews: an append-only record of every step a version takes — submitted, QA passed/failed,
--     approved, rejected (sent back), published — with who and when and an optional comment.
--   * plot_map_version_action(): the only way a version changes state, in one transaction:
--       submit   draft|rejected → in_review (needs at least one plot)
--       qa_pass  in_review → in_review (recorded; required before approval)
--       qa_fail  in_review → rejected
--       approve  in_review → approved (needs a QA pass after the last submit)
--       reject   in_review|approved → rejected (editable again)
--       publish  approved → published; the map's previous published version → superseded; the map points at it
--     Who may do which step is enforced by the app (managers submit and record QA; owners and admins approve,
--     send back and publish); the database enforces the order and the add-on.
--   * plot_layouts.published_version_id: the version the team and buyers see. At most one published version per map.
-- Previous versions keep their geometry and links (frozen by 20260081/20260082). Server-only. Additive.

BEGIN;

ALTER TABLE public.plot_layouts ADD COLUMN IF NOT EXISTS published_version_id UUID REFERENCES public.plot_map_versions(id) ON DELETE SET NULL;
CREATE UNIQUE INDEX IF NOT EXISTS uq_plot_map_versions_published ON public.plot_map_versions (layout_id) WHERE status = 'published';

CREATE TABLE IF NOT EXISTS public.plot_map_reviews (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id      UUID NOT NULL REFERENCES public.organisations(id) ON DELETE CASCADE,
  project_id  UUID NOT NULL REFERENCES public.projects(id) ON DELETE CASCADE,
  version_id  UUID NOT NULL REFERENCES public.plot_map_versions(id) ON DELETE CASCADE,
  action      TEXT NOT NULL CHECK (action IN ('submitted', 'qa_passed', 'qa_failed', 'approved', 'rejected', 'published', 'superseded')),
  from_status TEXT NOT NULL,
  to_status   TEXT NOT NULL,
  comment     TEXT CHECK (comment IS NULL OR char_length(comment) <= 1000),
  actor       UUID REFERENCES public.profiles(id) ON DELETE SET NULL,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT clock_timestamp()
);
CREATE INDEX IF NOT EXISTS idx_plot_map_reviews_version ON public.plot_map_reviews (version_id, created_at);

CREATE OR REPLACE FUNCTION public.plot_map_version_action(p_org UUID, p_version UUID, p_actor UUID, p_action TEXT, p_comment TEXT)
RETURNS TEXT LANGUAGE plpgsql SECURITY DEFINER SET search_path = pg_catalog, public, pg_temp AS $$
DECLARE v RECORD; prev UUID; last_submit TIMESTAMPTZ; nxt TEXT; act TEXT;
BEGIN
  SELECT id, org_id, project_id, layout_id, status, render_status INTO v FROM public.plot_map_versions WHERE id = p_version AND org_id = p_org FOR UPDATE;
  IF v IS NULL THEN RAISE EXCEPTION 'plot map version not found'; END IF;
  IF public.project_addon_state(v.project_id, 'plot_maps') <> 'active' THEN
    RAISE EXCEPTION 'plot map review: the Interactive Plot Map add-on is not active for this project' USING ERRCODE = 'P0001';
  END IF;
  IF p_comment IS NOT NULL AND char_length(p_comment) > 1000 THEN RAISE EXCEPTION 'plot map review: comment too long'; END IF;

  IF p_action = 'submit' THEN
    IF v.status NOT IN ('draft', 'rejected') THEN RAISE EXCEPTION 'plot map review: only a draft can be submitted (this one is %)', v.status; END IF;
    IF v.render_status <> 'ready' THEN RAISE EXCEPTION 'plot map review: the page image is not ready'; END IF;
    IF NOT EXISTS (SELECT 1 FROM public.plot_map_shapes WHERE version_id = p_version) THEN RAISE EXCEPTION 'plot map review: draw at least one plot first'; END IF;
    nxt := 'in_review'; act := 'submitted';
  ELSIF p_action IN ('qa_pass', 'qa_fail') THEN
    IF v.status <> 'in_review' THEN RAISE EXCEPTION 'plot map review: QA is recorded on a version in review (this one is %)', v.status; END IF;
    nxt := CASE WHEN p_action = 'qa_pass' THEN 'in_review' ELSE 'rejected' END;
    act := CASE WHEN p_action = 'qa_pass' THEN 'qa_passed' ELSE 'qa_failed' END;
  ELSIF p_action = 'approve' THEN
    IF v.status <> 'in_review' THEN RAISE EXCEPTION 'plot map review: only a version in review can be approved (this one is %)', v.status; END IF;
    SELECT max(created_at) INTO last_submit FROM public.plot_map_reviews WHERE version_id = p_version AND action = 'submitted';
    IF NOT EXISTS (SELECT 1 FROM public.plot_map_reviews WHERE version_id = p_version AND action = 'qa_passed' AND created_at >= COALESCE(last_submit, '-infinity')) THEN
      RAISE EXCEPTION 'plot map review: record a QA pass before approving';
    END IF;
    nxt := 'approved'; act := 'approved';
  ELSIF p_action = 'reject' THEN
    IF v.status NOT IN ('in_review', 'approved') THEN RAISE EXCEPTION 'plot map review: only a version in review or approved can be sent back (this one is %)', v.status; END IF;
    nxt := 'rejected'; act := 'rejected';
  ELSIF p_action = 'publish' THEN
    IF v.status <> 'approved' THEN RAISE EXCEPTION 'plot map review: only an approved version can be published (this one is %)', v.status; END IF;
    SELECT id INTO prev FROM public.plot_map_versions WHERE layout_id = v.layout_id AND status = 'published' FOR UPDATE;
    IF prev IS NOT NULL THEN
      UPDATE public.plot_map_versions SET status = 'superseded' WHERE id = prev;
      INSERT INTO public.plot_map_reviews (org_id, project_id, version_id, action, from_status, to_status, comment, actor)
      VALUES (v.org_id, v.project_id, prev, 'superseded', 'published', 'superseded', 'Replaced by a newer version', p_actor);
    END IF;
    nxt := 'published'; act := 'published';
  ELSE
    RAISE EXCEPTION 'plot map review: unknown action %', p_action;
  END IF;

  IF nxt <> v.status THEN UPDATE public.plot_map_versions SET status = nxt WHERE id = p_version; END IF;
  IF p_action = 'publish' THEN
    UPDATE public.plot_layouts SET published_version_id = p_version, status = 'published', published_at = now(), updated_by = p_actor
     WHERE id = v.layout_id AND org_id = p_org;
  END IF;
  INSERT INTO public.plot_map_reviews (org_id, project_id, version_id, action, from_status, to_status, comment, actor)
  VALUES (v.org_id, v.project_id, p_version, act, v.status, nxt, NULLIF(btrim(p_comment), ''), p_actor);
  RETURN nxt;
END $$;

-- Reviews are history: insert only (through the function), never changed.
CREATE OR REPLACE FUNCTION public.plot_map_reviews_append_only()
RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN RAISE EXCEPTION 'plot map reviews are append-only'; END $$;
DROP TRIGGER IF EXISTS trg_plot_map_reviews_append_only ON public.plot_map_reviews;
CREATE TRIGGER trg_plot_map_reviews_append_only BEFORE UPDATE OR DELETE ON public.plot_map_reviews
  FOR EACH ROW WHEN (pg_trigger_depth() = 0) EXECUTE FUNCTION public.plot_map_reviews_append_only();

REVOKE ALL ON FUNCTION public.plot_map_version_action(UUID, UUID, UUID, TEXT, TEXT) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.plot_map_version_action(UUID, UUID, UUID, TEXT, TEXT) TO service_role;
REVOKE ALL ON FUNCTION public.plot_map_reviews_append_only() FROM PUBLIC, anon, authenticated;

ALTER TABLE public.plot_map_reviews ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.plot_map_reviews FROM PUBLIC, anon, authenticated;
GRANT SELECT, INSERT ON public.plot_map_reviews TO service_role;

COMMIT;
