-- 20260082_plot_map_shapes.sql
-- Interactive Plot Map, the editor (docs/product/PLOT_MAP_ADDON.md §5).
--   * plot_map_shapes: the plot boundaries drawn on one map version, in NORMALISED page coordinates
--     ([[x,y],…], 0–1 of the rendered page), each with its plot number and — only once a person confirmed it — the
--     inventory unit it is. Suggested matches are never stored. A unit appears at most once per version; a plot
--     number at most once per version (case-insensitive). The map never stores a status, price, hold or booking:
--     those are read live from inventory_items.
--   * Shapes can change only while their version is a draft (or was sent back), and only while the project's add-on
--     is active; the unit must belong to the same organisation and project. Published history is never touched.
--   * save_plot_map_shapes(): replaces a draft's shapes in one transaction (keeps the ids of shapes that still exist,
--     records who linked each unit and when).
-- Server-only (RLS on, no client privileges). Additive.

BEGIN;

CREATE TABLE IF NOT EXISTS public.plot_map_shapes (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id      UUID NOT NULL REFERENCES public.organisations(id) ON DELETE CASCADE,
  project_id  UUID NOT NULL REFERENCES public.projects(id) ON DELETE CASCADE,
  version_id  UUID NOT NULL REFERENCES public.plot_map_versions(id) ON DELETE CASCADE,
  label       TEXT NOT NULL CHECK (char_length(btrim(label)) BETWEEN 1 AND 40),
  kind        TEXT NOT NULL DEFAULT 'polygon' CHECK (kind IN ('polygon', 'rect')),
  points      JSONB NOT NULL CHECK (jsonb_typeof(points) = 'array' AND jsonb_array_length(points) BETWEEN 3 AND 200),
  unit_id     UUID REFERENCES public.inventory_items(id) ON DELETE SET NULL,
  linked_by   UUID REFERENCES public.profiles(id) ON DELETE SET NULL,
  linked_at   TIMESTAMPTZ,
  source      TEXT NOT NULL DEFAULT 'manual' CHECK (source IN ('manual', 'svg_import', 'ocr')),
  created_by  UUID REFERENCES public.profiles(id) ON DELETE SET NULL,
  updated_by  UUID REFERENCES public.profiles(id) ON DELETE SET NULL,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
  CHECK (unit_id IS NULL OR linked_at IS NOT NULL)
);
CREATE UNIQUE INDEX IF NOT EXISTS uq_plot_map_shapes_label ON public.plot_map_shapes (version_id, lower(btrim(label)));
CREATE UNIQUE INDEX IF NOT EXISTS uq_plot_map_shapes_unit ON public.plot_map_shapes (version_id, unit_id) WHERE unit_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_plot_map_shapes_version ON public.plot_map_shapes (org_id, version_id);
CREATE INDEX IF NOT EXISTS idx_plot_map_shapes_unit ON public.plot_map_shapes (unit_id) WHERE unit_id IS NOT NULL;

CREATE OR REPLACE FUNCTION public.guard_plot_map_shape()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = pg_catalog, public, pg_temp AS $$
DECLARE v RECORD; r RECORD;
BEGIN
  r := CASE WHEN TG_OP = 'DELETE' THEN OLD ELSE NEW END;
  IF TG_OP = 'UPDATE' AND (NEW.org_id <> OLD.org_id OR NEW.project_id <> OLD.project_id OR NEW.version_id <> OLD.version_id) THEN
    RAISE EXCEPTION 'plot map shape: organisation, project and version cannot change';
  END IF;
  SELECT org_id, project_id, status INTO v FROM public.plot_map_versions WHERE id = r.version_id;
  IF v IS NULL OR v.org_id <> r.org_id OR v.project_id <> r.project_id THEN
    RAISE EXCEPTION 'plot map shape: version belongs to another organisation or project';
  END IF;
  IF v.status NOT IN ('draft', 'rejected') THEN
    -- A version being deleted with its map takes its shapes with it (cascade); everything else is frozen.
    IF TG_OP = 'DELETE' AND NOT EXISTS (SELECT 1 FROM public.plot_map_versions WHERE id = r.version_id) THEN RETURN OLD; END IF;
    RAISE EXCEPTION 'plot map shape: only a draft version can be edited (this one is %)', v.status;
  END IF;
  IF public.project_addon_state(r.project_id, 'plot_maps') <> 'active' THEN
    RAISE EXCEPTION 'plot map shape: the Interactive Plot Map add-on is not active for this project' USING ERRCODE = 'P0001';
  END IF;
  IF TG_OP <> 'DELETE' THEN
    IF NEW.unit_id IS NOT NULL AND NOT EXISTS (SELECT 1 FROM public.inventory_items WHERE id = NEW.unit_id AND org_id = NEW.org_id AND project_id = NEW.project_id) THEN
      RAISE EXCEPTION 'plot map shape: unit belongs to another organisation or project';
    END IF;
    NEW.updated_at := now();
    RETURN NEW;
  END IF;
  RETURN OLD;
END $$;
DROP TRIGGER IF EXISTS trg_guard_plot_map_shape ON public.plot_map_shapes;
CREATE TRIGGER trg_guard_plot_map_shape BEFORE INSERT OR UPDATE OR DELETE ON public.plot_map_shapes
  FOR EACH ROW EXECUTE FUNCTION public.guard_plot_map_shape();

-- Replace a draft's shapes in one go. p_shapes: [{ id?, label, kind, points, unit_id }]. Shapes not in the list are
-- removed; listed ids that belong to this version are updated (others get a new id). The app validates geometry first;
-- the guards and unique indexes re-check ownership, state, duplicates.
CREATE OR REPLACE FUNCTION public.save_plot_map_shapes(p_org UUID, p_version UUID, p_actor UUID, p_shapes JSONB)
RETURNS INTEGER LANGUAGE plpgsql SECURITY DEFINER SET search_path = pg_catalog, public, pg_temp AS $$
DECLARE v RECORD; s JSONB; sid UUID; n INTEGER := 0; new_unit UUID; prev JSONB; was JSONB;
BEGIN
  SELECT id, org_id, project_id, status INTO v FROM public.plot_map_versions WHERE id = p_version AND org_id = p_org FOR UPDATE;
  IF v IS NULL THEN RAISE EXCEPTION 'plot map version not found'; END IF;
  IF v.status NOT IN ('draft', 'rejected') THEN RAISE EXCEPTION 'plot map shape: only a draft version can be edited (this one is %)', v.status; END IF;
  IF jsonb_typeof(p_shapes) <> 'array' OR jsonb_array_length(p_shapes) > 2000 THEN RAISE EXCEPTION 'plot map shapes: invalid list'; END IF;

  -- Who linked what, before the save: an unchanged link keeps its original person and time.
  SELECT COALESCE(jsonb_object_agg(id::text, jsonb_build_object('unit', unit_id, 'by', linked_by, 'at', linked_at)), '{}'::jsonb)
    INTO prev FROM public.plot_map_shapes WHERE version_id = p_version;

  DELETE FROM public.plot_map_shapes
   WHERE version_id = p_version
     AND id NOT IN (SELECT (e->>'id')::uuid FROM jsonb_array_elements(p_shapes) e WHERE e->>'id' ~ '^[0-9a-f-]{36}$');
  -- Free every label and unit first, so swaps between existing shapes cannot trip the unique indexes mid-way.
  UPDATE public.plot_map_shapes SET label = '~' || left(id::text, 30), unit_id = NULL, linked_by = NULL, linked_at = NULL
   WHERE version_id = p_version;

  FOR s IN SELECT * FROM jsonb_array_elements(p_shapes) LOOP
    sid := CASE WHEN s->>'id' ~ '^[0-9a-f-]{36}$' THEN (s->>'id')::uuid END;
    new_unit := NULLIF(s->>'unit_id', '')::uuid;
    was := CASE WHEN sid IS NOT NULL THEN prev -> sid::text END;
    IF sid IS NOT NULL AND EXISTS (SELECT 1 FROM public.plot_map_shapes WHERE id = sid AND version_id = p_version) THEN
      UPDATE public.plot_map_shapes SET
        label = btrim(s->>'label'), kind = COALESCE(s->>'kind', 'polygon'), points = s->'points', unit_id = new_unit,
        linked_by = CASE WHEN new_unit IS NULL THEN NULL
                         WHEN (was->>'unit')::uuid IS NOT DISTINCT FROM new_unit THEN (was->>'by')::uuid ELSE p_actor END,
        linked_at = CASE WHEN new_unit IS NULL THEN NULL
                         WHEN (was->>'unit')::uuid IS NOT DISTINCT FROM new_unit THEN COALESCE((was->>'at')::timestamptz, now()) ELSE now() END,
        updated_by = p_actor
      WHERE id = sid;
    ELSE
      INSERT INTO public.plot_map_shapes (org_id, project_id, version_id, label, kind, points, unit_id, linked_by, linked_at, created_by, updated_by)
      VALUES (v.org_id, v.project_id, p_version, btrim(s->>'label'), COALESCE(s->>'kind', 'polygon'), s->'points', new_unit,
              CASE WHEN new_unit IS NOT NULL THEN p_actor END, CASE WHEN new_unit IS NOT NULL THEN now() END, p_actor, p_actor);
    END IF;
    n := n + 1;
  END LOOP;
  IF v.status = 'rejected' THEN UPDATE public.plot_map_versions SET status = 'draft' WHERE id = p_version; END IF;
  RETURN n;
END $$;

REVOKE ALL ON FUNCTION public.guard_plot_map_shape() FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.save_plot_map_shapes(UUID, UUID, UUID, JSONB) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.save_plot_map_shapes(UUID, UUID, UUID, JSONB) TO service_role;

ALTER TABLE public.plot_map_shapes ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.plot_map_shapes FROM PUBLIC, anon, authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.plot_map_shapes TO service_role;

COMMIT;
