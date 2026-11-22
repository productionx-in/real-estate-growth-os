-- 20260080_project_addons.sql
-- Interactive Plot Map becomes an add-on activated per developer PROJECT (it was per workspace, 20260072).
--   * project_addons: one row per (project, add-on). No row = not purchased. status is pending (requested by the
--     workspace, or prepared by REGrow), active or suspended. "Expired" is derived — an active row whose valid_until
--     has passed — so expiry needs no job and can never be missed. Written only by the server: Platform Owners
--     activate, suspend, resume and change terms (audited console route); workspace owners/admins may only request.
--   * project_addon_events: the full history, written by a trigger on every insert/update, so no code path can
--     change an entitlement without leaving a record.
--   * project_addon_state(project, addon): the one definition of the state, used by the app and by the guards below.
--   * The plot-layout guards now require the project's add-on to be active for any change that creates or alters a
--     map, links a plot, publishes or shares. Unpublishing, unsharing and deleting stay allowed in every state, so a
--     lapsed project can always take its map offline. Existing data is untouched; org_addons (20260072) is kept but
--     no longer grants anything (production holds no rows in it).
-- Server-only like the other add-on tables: RLS on, no client privileges. Additive.

BEGIN;

CREATE TABLE IF NOT EXISTS public.project_addons (
  id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id            UUID NOT NULL REFERENCES public.organisations(id) ON DELETE CASCADE,
  project_id        UUID NOT NULL REFERENCES public.projects(id) ON DELETE CASCADE,
  addon             TEXT NOT NULL CHECK (addon IN ('plot_maps')),
  status            TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'active', 'suspended')),
  valid_until       TIMESTAMPTZ,
  setup_fee_paise   BIGINT NOT NULL DEFAULT 0 CHECK (setup_fee_paise >= 0),
  monthly_fee_paise BIGINT NOT NULL DEFAULT 0 CHECK (monthly_fee_paise >= 0),
  notes             TEXT CHECK (notes IS NULL OR char_length(notes) <= 500),
  status_reason     TEXT CHECK (status_reason IS NULL OR char_length(status_reason) <= 300),
  requested_by      UUID REFERENCES public.profiles(id) ON DELETE SET NULL,
  requested_at      TIMESTAMPTZ,
  activated_at      TIMESTAMPTZ,
  updated_by        UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at        TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at        TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (project_id, addon)
);
CREATE INDEX IF NOT EXISTS idx_project_addons_org ON public.project_addons (org_id, addon);
CREATE INDEX IF NOT EXISTS idx_project_addons_status ON public.project_addons (addon, status);

CREATE TABLE IF NOT EXISTS public.project_addon_events (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id      UUID NOT NULL REFERENCES public.organisations(id) ON DELETE CASCADE,
  project_id  UUID NOT NULL REFERENCES public.projects(id) ON DELETE CASCADE,
  addon       TEXT NOT NULL,
  from_status TEXT,
  to_status   TEXT NOT NULL,
  valid_until TIMESTAMPTZ,
  reason      TEXT,
  actor_user  UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_project_addon_events_project ON public.project_addon_events (project_id, created_at DESC);

-- The project belongs to the row's organisation, and neither can change afterwards.
CREATE OR REPLACE FUNCTION public.guard_project_addon()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = pg_catalog, public, pg_temp AS $$
BEGIN
  IF TG_OP = 'UPDATE' AND (NEW.org_id <> OLD.org_id OR NEW.project_id <> OLD.project_id OR NEW.addon <> OLD.addon) THEN
    RAISE EXCEPTION 'project add-on: organisation, project and add-on cannot change';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM public.projects WHERE id = NEW.project_id AND org_id = NEW.org_id) THEN
    RAISE EXCEPTION 'project add-on: project belongs to another organisation';
  END IF;
  IF NEW.status = 'active' AND (TG_OP = 'INSERT' OR OLD.status IS DISTINCT FROM 'active') THEN
    NEW.activated_at := now();
  END IF;
  NEW.updated_at := now();
  RETURN NEW;
END $$;
DROP TRIGGER IF EXISTS trg_guard_project_addon ON public.project_addons;
CREATE TRIGGER trg_guard_project_addon BEFORE INSERT OR UPDATE ON public.project_addons
  FOR EACH ROW EXECUTE FUNCTION public.guard_project_addon();

-- Every change is recorded (status, validity or terms).
CREATE OR REPLACE FUNCTION public.log_project_addon()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = pg_catalog, public, pg_temp AS $$
BEGIN
  IF TG_OP = 'UPDATE' AND NEW.status IS NOT DISTINCT FROM OLD.status AND NEW.valid_until IS NOT DISTINCT FROM OLD.valid_until
     AND NEW.setup_fee_paise = OLD.setup_fee_paise AND NEW.monthly_fee_paise = OLD.monthly_fee_paise
     AND NEW.notes IS NOT DISTINCT FROM OLD.notes AND NEW.status_reason IS NOT DISTINCT FROM OLD.status_reason THEN
    RETURN NEW;
  END IF;
  INSERT INTO public.project_addon_events (org_id, project_id, addon, from_status, to_status, valid_until, reason, actor_user)
  VALUES (NEW.org_id, NEW.project_id, NEW.addon, CASE WHEN TG_OP = 'UPDATE' THEN OLD.status END, NEW.status, NEW.valid_until,
          NEW.status_reason, NEW.updated_by);
  RETURN NEW;
END $$;
DROP TRIGGER IF EXISTS trg_log_project_addon ON public.project_addons;
CREATE TRIGGER trg_log_project_addon AFTER INSERT OR UPDATE ON public.project_addons
  FOR EACH ROW EXECUTE FUNCTION public.log_project_addon();

-- not_purchased | pending | active | suspended | expired
CREATE OR REPLACE FUNCTION public.project_addon_state(p_project UUID, p_addon TEXT)
RETURNS TEXT LANGUAGE sql STABLE SECURITY DEFINER SET search_path = pg_catalog, public, pg_temp AS $$
  SELECT COALESCE((
    SELECT CASE WHEN a.status = 'active' AND a.valid_until IS NOT NULL AND a.valid_until <= now() THEN 'expired' ELSE a.status END
    FROM public.project_addons a WHERE a.project_id = p_project AND a.addon = p_addon
  ), 'not_purchased')
$$;

-- Plot layouts: creating or changing a map, publishing or sharing needs the project's add-on to be active.
CREATE OR REPLACE FUNCTION public.guard_plot_layout()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = pg_catalog, public, pg_temp AS $$
BEGIN
  IF TG_OP = 'UPDATE' AND (NEW.org_id <> OLD.org_id OR NEW.project_id <> OLD.project_id) THEN
    RAISE EXCEPTION 'plot layout: organisation and project cannot change';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM public.projects WHERE id = NEW.project_id AND org_id = NEW.org_id) THEN
    RAISE EXCEPTION 'plot layout: project belongs to another organisation';
  END IF;
  IF (TG_OP = 'INSERT'
      OR NEW.geometry IS DISTINCT FROM OLD.geometry OR NEW.view_box IS DISTINCT FROM OLD.view_box
      OR NEW.name IS DISTINCT FROM OLD.name OR NEW.show_prices IS DISTINCT FROM OLD.show_prices
      OR NEW.share_token IS DISTINCT FROM OLD.share_token
      OR (NEW.status = 'published' AND OLD.status IS DISTINCT FROM 'published')
      OR (NEW.share_enabled AND NOT OLD.share_enabled))
     AND public.project_addon_state(NEW.project_id, 'plot_maps') <> 'active' THEN
    RAISE EXCEPTION 'plot layout: the Interactive Plot Map add-on is not active for this project' USING ERRCODE = 'P0001';
  END IF;
  NEW.updated_at := now();
  RETURN NEW;
END $$;

CREATE OR REPLACE FUNCTION public.guard_plot_layout_link()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = pg_catalog, public, pg_temp AS $$
DECLARE v_project UUID;
BEGIN
  SELECT project_id INTO v_project FROM public.plot_layouts WHERE id = NEW.layout_id AND org_id = NEW.org_id;
  IF v_project IS NULL THEN RAISE EXCEPTION 'plot layout link: layout belongs to another organisation'; END IF;
  IF NOT EXISTS (SELECT 1 FROM public.inventory_items WHERE id = NEW.unit_id AND org_id = NEW.org_id AND project_id = v_project) THEN
    RAISE EXCEPTION 'plot layout link: unit belongs to another organisation or project';
  END IF;
  IF public.project_addon_state(v_project, 'plot_maps') <> 'active' THEN
    RAISE EXCEPTION 'plot layout link: the Interactive Plot Map add-on is not active for this project' USING ERRCODE = 'P0001';
  END IF;
  RETURN NEW;
END $$;

REVOKE ALL ON FUNCTION public.guard_project_addon() FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.log_project_addon() FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.project_addon_state(UUID, TEXT) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.project_addon_state(UUID, TEXT) TO service_role;

ALTER TABLE public.project_addons ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.project_addon_events ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.project_addons, public.project_addon_events FROM PUBLIC, anon, authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.project_addons TO service_role;
GRANT SELECT, INSERT ON public.project_addon_events TO service_role;

COMMIT;
