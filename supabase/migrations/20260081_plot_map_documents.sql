-- 20260081_plot_map_documents.sql
-- Interactive Plot Map, document intake (docs/product/PLOT_MAP_ADDON.md §4).
--   * Storage bucket plot-map-files: PRIVATE. No storage policies are created, so only the server (service role)
--     can read or write it; browsers get short-lived signed URLs for one object at a time. Holds the original
--     uploads and the rendered page images. Nothing here is ever public: the public map (a later PR) streams only the
--     published version's image through the app.
--   * plot_map_documents: one uploaded original (PDF, PNG or JPEG) for a map (plot_layouts row). The server checks
--     the bytes (signature, size, SHA-256, PDF structure) before it becomes `ready`; a failure keeps the reason.
--     The original is never modified or replaced.
--   * plot_map_versions: a map version = one page of one document, at a rotation, rendered to a PNG + thumbnail,
--     with its render metadata. Versions are numbered per map; uploading a new document makes a new version and
--     never touches an existing one. Workflow states are created here; review/approval/publishing arrive later.
--   * plot_layouts gains defaults for its SVG-era columns, so a map can start from a document.
-- Every row is guarded: document, version and map belong to the same organisation and project; writes need the
-- project's add-on to be active (20260080). Server-only tables (RLS on, no client privileges). Additive.

BEGIN;

INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES ('plot-map-files', 'plot-map-files', false, 26214400, ARRAY['application/pdf', 'image/png', 'image/jpeg'])
ON CONFLICT (id) DO NOTHING;

ALTER TABLE public.plot_layouts ALTER COLUMN view_box SET DEFAULT '0 0 1 1';
ALTER TABLE public.plot_layouts ALTER COLUMN geometry SET DEFAULT '{"shapes": [], "labels": []}'::jsonb;

CREATE TABLE IF NOT EXISTS public.plot_map_documents (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id        UUID NOT NULL REFERENCES public.organisations(id) ON DELETE CASCADE,
  project_id    UUID NOT NULL REFERENCES public.projects(id) ON DELETE CASCADE,
  layout_id     UUID NOT NULL REFERENCES public.plot_layouts(id) ON DELETE CASCADE,
  kind          TEXT NOT NULL CHECK (kind IN ('pdf', 'png', 'jpeg')),
  file_name     TEXT NOT NULL CHECK (char_length(file_name) BETWEEN 1 AND 200),
  byte_size     BIGINT NOT NULL CHECK (byte_size > 0 AND byte_size <= 26214400),
  storage_path  TEXT NOT NULL UNIQUE CHECK (storage_path ~ '^org/[0-9a-f-]{36}/project/[0-9a-f-]{36}/documents/[0-9a-f-]{36}/original\.(pdf|png|jpg)$'),
  sha256        TEXT CHECK (sha256 IS NULL OR sha256 ~ '^[0-9a-f]{64}$'),
  status        TEXT NOT NULL DEFAULT 'uploading' CHECK (status IN ('uploading', 'ready', 'failed')),
  error         TEXT CHECK (error IS NULL OR char_length(error) <= 300),
  page_count    INTEGER CHECK (page_count IS NULL OR page_count BETWEEN 1 AND 20),
  -- [{ "page": 1, "width": 842, "height": 595, "rotate": 0 }] in PDF points (images: pixels, one page).
  pages         JSONB NOT NULL DEFAULT '[]'::jsonb CHECK (jsonb_typeof(pages) = 'array' AND octet_length(pages::text) <= 20000),
  uploaded_by   UUID REFERENCES public.profiles(id) ON DELETE SET NULL,
  checked_at    TIMESTAMPTZ,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
  CHECK (status <> 'ready' OR (sha256 IS NOT NULL AND page_count IS NOT NULL))
);
CREATE INDEX IF NOT EXISTS idx_plot_map_documents_layout ON public.plot_map_documents (org_id, layout_id, created_at DESC);

CREATE TABLE IF NOT EXISTS public.plot_map_versions (
  id             UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id         UUID NOT NULL REFERENCES public.organisations(id) ON DELETE CASCADE,
  project_id     UUID NOT NULL REFERENCES public.projects(id) ON DELETE CASCADE,
  layout_id      UUID NOT NULL REFERENCES public.plot_layouts(id) ON DELETE CASCADE,
  document_id    UUID NOT NULL REFERENCES public.plot_map_documents(id) ON DELETE RESTRICT,
  version_no     INTEGER NOT NULL CHECK (version_no >= 1),
  page           INTEGER NOT NULL CHECK (page BETWEEN 1 AND 20),
  rotation       INTEGER NOT NULL DEFAULT 0 CHECK (rotation IN (0, 90, 180, 270)),
  status         TEXT NOT NULL DEFAULT 'draft' CHECK (status IN ('draft', 'in_review', 'approved', 'published', 'superseded', 'rejected')),
  render_status  TEXT NOT NULL DEFAULT 'pending' CHECK (render_status IN ('pending', 'ready', 'failed')),
  render_error   TEXT CHECK (render_error IS NULL OR char_length(render_error) <= 300),
  image_path     TEXT NOT NULL UNIQUE CHECK (image_path ~ '^org/[0-9a-f-]{36}/project/[0-9a-f-]{36}/versions/[0-9a-f-]{36}/page\.png$'),
  thumb_path     TEXT NOT NULL UNIQUE CHECK (thumb_path ~ '^org/[0-9a-f-]{36}/project/[0-9a-f-]{36}/versions/[0-9a-f-]{36}/thumb\.png$'),
  image_width    INTEGER CHECK (image_width IS NULL OR image_width BETWEEN 256 AND 8192),
  image_height   INTEGER CHECK (image_height IS NULL OR image_height BETWEEN 256 AND 8192),
  -- { renderer, rendererVersion, scale, sourceWidth, sourceHeight, sourceRotate, longEdge } — how the image was made.
  render         JSONB NOT NULL DEFAULT '{}'::jsonb CHECK (jsonb_typeof(render) = 'object' AND octet_length(render::text) <= 4000),
  created_by     UUID REFERENCES public.profiles(id) ON DELETE SET NULL,
  created_at     TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at     TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (layout_id, version_no),
  CHECK (render_status <> 'ready' OR (image_width IS NOT NULL AND image_height IS NOT NULL))
);
CREATE INDEX IF NOT EXISTS idx_plot_map_versions_layout ON public.plot_map_versions (org_id, layout_id, version_no DESC);

-- Same organisation and project everywhere; identity columns never change; writes need an active add-on.
CREATE OR REPLACE FUNCTION public.guard_plot_map_document()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = pg_catalog, public, pg_temp AS $$
BEGIN
  IF TG_OP = 'UPDATE' AND (NEW.org_id <> OLD.org_id OR NEW.project_id <> OLD.project_id OR NEW.layout_id <> OLD.layout_id
      OR NEW.storage_path <> OLD.storage_path OR NEW.kind <> OLD.kind
      OR (OLD.sha256 IS NOT NULL AND NEW.sha256 IS DISTINCT FROM OLD.sha256)) THEN
    RAISE EXCEPTION 'plot map document: the original and its identity cannot change';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM public.plot_layouts WHERE id = NEW.layout_id AND org_id = NEW.org_id AND project_id = NEW.project_id) THEN
    RAISE EXCEPTION 'plot map document: map belongs to another organisation or project';
  END IF;
  IF public.project_addon_state(NEW.project_id, 'plot_maps') <> 'active' THEN
    RAISE EXCEPTION 'plot map document: the Interactive Plot Map add-on is not active for this project' USING ERRCODE = 'P0001';
  END IF;
  NEW.updated_at := now();
  RETURN NEW;
END $$;
DROP TRIGGER IF EXISTS trg_guard_plot_map_document ON public.plot_map_documents;
CREATE TRIGGER trg_guard_plot_map_document BEFORE INSERT OR UPDATE ON public.plot_map_documents
  FOR EACH ROW EXECUTE FUNCTION public.guard_plot_map_document();

CREATE OR REPLACE FUNCTION public.guard_plot_map_version()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = pg_catalog, public, pg_temp AS $$
DECLARE d RECORD;
BEGIN
  IF TG_OP = 'UPDATE' AND (NEW.org_id <> OLD.org_id OR NEW.project_id <> OLD.project_id OR NEW.layout_id <> OLD.layout_id
      OR NEW.document_id <> OLD.document_id OR NEW.version_no <> OLD.version_no OR NEW.page <> OLD.page OR NEW.rotation <> OLD.rotation
      OR NEW.image_path <> OLD.image_path OR NEW.thumb_path <> OLD.thumb_path) THEN
    RAISE EXCEPTION 'plot map version: its source, page and rotation cannot change (make a new version)';
  END IF;
  -- Once published or superseded a version is history: only the published -> superseded step is allowed.
  IF TG_OP = 'UPDATE' AND OLD.status IN ('published', 'superseded')
     AND NOT (OLD.status = 'published' AND NEW.status = 'superseded' AND NEW.render IS NOT DISTINCT FROM OLD.render) THEN
    RAISE EXCEPTION 'plot map version: a published or superseded version cannot be changed';
  END IF;
  SELECT org_id, project_id, layout_id, status, page_count INTO d FROM public.plot_map_documents WHERE id = NEW.document_id;
  IF d IS NULL OR d.org_id <> NEW.org_id OR d.project_id <> NEW.project_id OR d.layout_id <> NEW.layout_id THEN
    RAISE EXCEPTION 'plot map version: document belongs to another organisation, project or map';
  END IF;
  IF TG_OP = 'INSERT' AND (d.status <> 'ready' OR NEW.page > d.page_count) THEN
    RAISE EXCEPTION 'plot map version: the document is not ready or has no page %', NEW.page;
  END IF;
  IF public.project_addon_state(NEW.project_id, 'plot_maps') <> 'active' THEN
    RAISE EXCEPTION 'plot map version: the Interactive Plot Map add-on is not active for this project' USING ERRCODE = 'P0001';
  END IF;
  NEW.updated_at := now();
  RETURN NEW;
END $$;
DROP TRIGGER IF EXISTS trg_guard_plot_map_version ON public.plot_map_versions;
CREATE TRIGGER trg_guard_plot_map_version BEFORE INSERT OR UPDATE ON public.plot_map_versions
  FOR EACH ROW EXECUTE FUNCTION public.guard_plot_map_version();

-- The next version number for a map, taken under a row lock on the map so two uploads never get the same number.
CREATE OR REPLACE FUNCTION public.next_plot_map_version_no(p_layout UUID)
RETURNS INTEGER LANGUAGE plpgsql SECURITY DEFINER SET search_path = pg_catalog, public, pg_temp AS $$
DECLARE n INTEGER;
BEGIN
  PERFORM 1 FROM public.plot_layouts WHERE id = p_layout FOR UPDATE;
  SELECT COALESCE(max(version_no), 0) + 1 INTO n FROM public.plot_map_versions WHERE layout_id = p_layout;
  RETURN n;
END $$;

REVOKE ALL ON FUNCTION public.guard_plot_map_document() FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.guard_plot_map_version() FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.next_plot_map_version_no(UUID) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.next_plot_map_version_no(UUID) TO service_role;

ALTER TABLE public.plot_map_documents ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.plot_map_versions ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.plot_map_documents, public.plot_map_versions FROM PUBLIC, anon, authenticated;
GRANT SELECT, INSERT, UPDATE ON public.plot_map_documents, public.plot_map_versions TO service_role;

COMMIT;
