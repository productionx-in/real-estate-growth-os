-- 20260085_plot_map_staff_drawing.sql
-- Interactive Plot Map, option (c) (docs/product/PLOT_MAP_ADDON.md §6): REGrow staff may draw plot boundaries and
-- plot numbers on a project's draft map versions — only after the workspace allows it for that project, only until
-- the permission ends or is withdrawn, and never touching inventory links. The customer still links every plot to
-- its unit, submits, approves and publishes.
--   * plot_map_staff_access: one row per permission (who allowed it, until when, who withdrew it). Kept as history.
--   * plot_map_staff_access_active(project): an unrevoked, unexpired permission and the add-on active.
--   * save_plot_map_shapes_as_staff(): checks that, then saves with each existing shape's confirmed link carried over
--     by shape id while its plot number is unchanged, and no link otherwise — whatever the caller sends. Staff can
--     never link or relink a unit.
-- Server-only (RLS on, no client privileges). Additive.

BEGIN;

CREATE TABLE IF NOT EXISTS public.plot_map_staff_access (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id      UUID NOT NULL REFERENCES public.organisations(id) ON DELETE CASCADE,
  project_id  UUID NOT NULL REFERENCES public.projects(id) ON DELETE CASCADE,
  granted_by  UUID REFERENCES public.profiles(id) ON DELETE SET NULL,
  granted_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
  expires_at  TIMESTAMPTZ NOT NULL,
  revoked_by  UUID REFERENCES public.profiles(id) ON DELETE SET NULL,
  revoked_at  TIMESTAMPTZ,
  CHECK (expires_at > granted_at AND expires_at <= granted_at + INTERVAL '31 days'),
  CHECK (revoked_at IS NULL OR revoked_at >= granted_at)
);
CREATE INDEX IF NOT EXISTS idx_plot_map_staff_access_project ON public.plot_map_staff_access (project_id, granted_at DESC);
-- At most one open permission per project.
CREATE UNIQUE INDEX IF NOT EXISTS uq_plot_map_staff_access_open ON public.plot_map_staff_access (project_id) WHERE revoked_at IS NULL;

CREATE OR REPLACE FUNCTION public.guard_plot_map_staff_access()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = pg_catalog, public, pg_temp AS $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM public.projects WHERE id = NEW.project_id AND org_id = NEW.org_id) THEN
    RAISE EXCEPTION 'plot map staff access: project belongs to another organisation';
  END IF;
  IF TG_OP = 'INSERT' AND public.project_addon_state(NEW.project_id, 'plot_maps') <> 'active' THEN
    RAISE EXCEPTION 'plot map staff access: the Interactive Plot Map add-on is not active for this project';
  END IF;
  IF TG_OP = 'UPDATE' THEN
    -- Only withdrawing is allowed, once.
    IF NEW.org_id <> OLD.org_id OR NEW.project_id <> OLD.project_id OR NEW.granted_by IS DISTINCT FROM OLD.granted_by
       OR NEW.granted_at <> OLD.granted_at OR NEW.expires_at <> OLD.expires_at THEN
      RAISE EXCEPTION 'plot map staff access: a permission is not edited — withdraw it and give a new one';
    END IF;
    IF OLD.revoked_at IS NOT NULL THEN RAISE EXCEPTION 'plot map staff access: already withdrawn'; END IF;
  END IF;
  RETURN NEW;
END $$;
DROP TRIGGER IF EXISTS trg_guard_plot_map_staff_access ON public.plot_map_staff_access;
CREATE TRIGGER trg_guard_plot_map_staff_access BEFORE INSERT OR UPDATE ON public.plot_map_staff_access
  FOR EACH ROW EXECUTE FUNCTION public.guard_plot_map_staff_access();

CREATE OR REPLACE FUNCTION public.plot_map_staff_access_active(p_project UUID)
RETURNS BOOLEAN LANGUAGE sql STABLE SECURITY DEFINER SET search_path = pg_catalog, public, pg_temp AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.plot_map_staff_access a
     WHERE a.project_id = p_project AND a.revoked_at IS NULL AND a.expires_at > now()
  ) AND public.project_addon_state(p_project, 'plot_maps') = 'active'
$$;

CREATE OR REPLACE FUNCTION public.save_plot_map_shapes_as_staff(p_org UUID, p_version UUID, p_actor UUID, p_shapes JSONB)
RETURNS INTEGER LANGUAGE plpgsql SECURITY DEFINER SET search_path = pg_catalog, public, pg_temp AS $$
DECLARE v RECORD; links JSONB; safe JSONB;
BEGIN
  SELECT id, project_id INTO v FROM public.plot_map_versions WHERE id = p_version AND org_id = p_org;
  IF v IS NULL THEN RAISE EXCEPTION 'plot map version not found'; END IF;
  IF NOT public.plot_map_staff_access_active(v.project_id) THEN
    RAISE EXCEPTION 'plot map staff access: the workspace has not allowed REGrow to draw on this project';
  END IF;
  IF jsonb_typeof(p_shapes) <> 'array' THEN RAISE EXCEPTION 'plot map shapes: invalid list'; END IF;
  -- The links the customer confirmed, by shape id. Anything the caller sends as unit_id is ignored. A link is kept
  -- only while the plot keeps its number; renumbering a linked plot drops the link for the customer to confirm again.
  SELECT COALESCE(jsonb_object_agg(id::text, jsonb_build_object('unit', unit_id, 'label', lower(label))), '{}'::jsonb) INTO links
    FROM public.plot_map_shapes WHERE version_id = p_version AND unit_id IS NOT NULL;
  SELECT COALESCE(jsonb_agg((e - 'unit_id') || jsonb_build_object('unit_id',
           CASE WHEN links -> (e->>'id') ->> 'label' = lower(btrim(e->>'label')) THEN links -> (e->>'id') -> 'unit' END)), '[]'::jsonb) INTO safe
    FROM jsonb_array_elements(p_shapes) e;
  RETURN public.save_plot_map_shapes(p_org, p_version, p_actor, safe);
END $$;

REVOKE ALL ON FUNCTION public.guard_plot_map_staff_access() FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.plot_map_staff_access_active(UUID) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.save_plot_map_shapes_as_staff(UUID, UUID, UUID, JSONB) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.plot_map_staff_access_active(UUID) TO service_role;
GRANT EXECUTE ON FUNCTION public.save_plot_map_shapes_as_staff(UUID, UUID, UUID, JSONB) TO service_role;

ALTER TABLE public.plot_map_staff_access ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.plot_map_staff_access FROM PUBLIC, anon, authenticated;
GRANT SELECT, INSERT, UPDATE ON public.plot_map_staff_access TO service_role;

COMMIT;
