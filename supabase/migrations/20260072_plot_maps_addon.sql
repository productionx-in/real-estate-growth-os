-- 20260072_plot_maps_addon.sql
-- Interactive plot maps: a paid add-on (one-time setup per layout + monthly per live layout).
--   * org_addons: which add-ons a workspace has, with the fees agreed. Unlike modules (20260047, ON unless switched
--     off), an add-on is OFF unless a row says enabled. Written only by Platform Owners through an audited console
--     route; read by the server. Holds REGrow's commercial terms, no customer business data.
--   * plot_layouts: a project's layout as plain geometry (lib/plots/svg.ts turns the uploaded SVG into numbers;
--     the SVG itself is never stored), its status (draft/published) and an optional public share link.
--   * plot_layout_links: which shape is which unit. Both sides must belong to the same organisation and project.
-- All three are server-only: RLS on, no client privileges (as for documents, 20260052). Additive only.

BEGIN;

CREATE TABLE IF NOT EXISTS public.org_addons (
  org_id            UUID NOT NULL REFERENCES public.organisations(id) ON DELETE CASCADE,
  addon             TEXT NOT NULL CHECK (addon IN ('plot_maps')),
  enabled           BOOLEAN NOT NULL DEFAULT false,
  setup_fee_paise   BIGINT NOT NULL DEFAULT 0 CHECK (setup_fee_paise >= 0),
  monthly_fee_paise BIGINT NOT NULL DEFAULT 0 CHECK (monthly_fee_paise >= 0),
  included_layouts  INTEGER NOT NULL DEFAULT 1 CHECK (included_layouts BETWEEN 0 AND 100),
  notes             TEXT CHECK (notes IS NULL OR char_length(notes) <= 500),
  updated_by        UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  enabled_at        TIMESTAMPTZ,
  updated_at        TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (org_id, addon)
);

CREATE TABLE IF NOT EXISTS public.plot_layouts (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id        UUID NOT NULL REFERENCES public.organisations(id) ON DELETE CASCADE,
  project_id    UUID NOT NULL REFERENCES public.projects(id) ON DELETE CASCADE,
  name          TEXT NOT NULL CHECK (char_length(btrim(name)) BETWEEN 1 AND 80),
  view_box      TEXT NOT NULL CHECK (view_box ~ '^-?[0-9.eE+-]+ -?[0-9.eE+-]+ [0-9.eE+-]+ [0-9.eE+-]+$'),
  geometry      JSONB NOT NULL CHECK (jsonb_typeof(geometry) = 'object' AND octet_length(geometry::text) <= 4000000),
  status        TEXT NOT NULL DEFAULT 'draft' CHECK (status IN ('draft', 'published')),
  share_token   TEXT UNIQUE CHECK (share_token IS NULL OR share_token ~ '^[A-Za-z0-9_-]{43}$'),
  share_enabled BOOLEAN NOT NULL DEFAULT false,
  show_prices   BOOLEAN NOT NULL DEFAULT false,
  published_at  TIMESTAMPTZ,
  created_by    UUID REFERENCES public.profiles(id) ON DELETE SET NULL,
  updated_by    UUID REFERENCES public.profiles(id) ON DELETE SET NULL,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at    TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX IF NOT EXISTS uq_plot_layouts_name ON public.plot_layouts (project_id, lower(btrim(name)));
CREATE INDEX IF NOT EXISTS idx_plot_layouts_org ON public.plot_layouts (org_id, project_id);

CREATE TABLE IF NOT EXISTS public.plot_layout_links (
  layout_id  UUID NOT NULL REFERENCES public.plot_layouts(id) ON DELETE CASCADE,
  org_id     UUID NOT NULL REFERENCES public.organisations(id) ON DELETE CASCADE,
  shape_key  TEXT NOT NULL CHECK (char_length(shape_key) BETWEEN 1 AND 40),
  unit_id    UUID NOT NULL REFERENCES public.inventory_items(id) ON DELETE CASCADE,
  PRIMARY KEY (layout_id, shape_key),
  UNIQUE (layout_id, unit_id)
);

-- A layout's project, and every linked unit, belong to the layout's organisation (and project).
CREATE OR REPLACE FUNCTION public.guard_plot_layout()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = pg_catalog, public, pg_temp AS $$
BEGIN
  IF TG_OP = 'UPDATE' AND (NEW.org_id <> OLD.org_id OR NEW.project_id <> OLD.project_id) THEN
    RAISE EXCEPTION 'plot layout: organisation and project cannot change';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM public.projects WHERE id = NEW.project_id AND org_id = NEW.org_id) THEN
    RAISE EXCEPTION 'plot layout: project belongs to another organisation';
  END IF;
  NEW.updated_at := now();
  RETURN NEW;
END $$;
DROP TRIGGER IF EXISTS trg_guard_plot_layout ON public.plot_layouts;
CREATE TRIGGER trg_guard_plot_layout BEFORE INSERT OR UPDATE ON public.plot_layouts FOR EACH ROW EXECUTE FUNCTION public.guard_plot_layout();

CREATE OR REPLACE FUNCTION public.guard_plot_layout_link()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = pg_catalog, public, pg_temp AS $$
DECLARE v_project UUID;
BEGIN
  SELECT project_id INTO v_project FROM public.plot_layouts WHERE id = NEW.layout_id AND org_id = NEW.org_id;
  IF v_project IS NULL THEN RAISE EXCEPTION 'plot layout link: layout belongs to another organisation'; END IF;
  IF NOT EXISTS (SELECT 1 FROM public.inventory_items WHERE id = NEW.unit_id AND org_id = NEW.org_id AND project_id = v_project) THEN
    RAISE EXCEPTION 'plot layout link: unit belongs to another organisation or project';
  END IF;
  RETURN NEW;
END $$;
DROP TRIGGER IF EXISTS trg_guard_plot_layout_link ON public.plot_layout_links;
CREATE TRIGGER trg_guard_plot_layout_link BEFORE INSERT OR UPDATE ON public.plot_layout_links FOR EACH ROW EXECUTE FUNCTION public.guard_plot_layout_link();

REVOKE ALL ON FUNCTION public.guard_plot_layout() FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.guard_plot_layout_link() FROM PUBLIC, anon, authenticated;

ALTER TABLE public.org_addons ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.plot_layouts ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.plot_layout_links ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.org_addons, public.plot_layouts, public.plot_layout_links FROM PUBLIC, anon, authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.org_addons, public.plot_layouts, public.plot_layout_links TO service_role;

COMMIT;
