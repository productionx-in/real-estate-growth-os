-- 20260084_plot_map_setup.sql
-- Interactive Plot Map, setup tracking and embedding (docs/product/PLOT_MAP_ADDON.md §6).
--   * Setup stages are DERIVED from records that already exist (activation, uploads, renders, reviews) — nothing here
--     lets anyone tick a stage done. plot_map_versions.rendered_at records when a page image passed its checks.
--   * plot_map_setup_blockers: a visible reason the setup is waiting — on the customer (pauses the service clock) or
--     on REGrow (does not). Raised and resolved by Platform staff or the workspace; never deleted.
--   * plot_map_setup_assignments: which REGrow team member looks after a project's setup (metadata only).
--   * plot_layouts.embed_domains: websites allowed to embed the public map; plot_map_embed_origins(token) returns
--     them for a live share link only, so the app can send a frame-ancestors policy (anon may call it: it reveals
--     nothing the link holder could not already see).
--   * notifications learn the type 'plot_map'; customer_email_log learns the plot-map e-mail kinds.
-- Server-only tables (RLS on, no client privileges). Additive.

BEGIN;

ALTER TABLE public.plot_map_versions ADD COLUMN IF NOT EXISTS rendered_at TIMESTAMPTZ;
UPDATE public.plot_map_versions SET rendered_at = updated_at WHERE render_status = 'ready' AND rendered_at IS NULL;

CREATE TABLE IF NOT EXISTS public.plot_map_setup_blockers (
  id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id       UUID NOT NULL REFERENCES public.organisations(id) ON DELETE CASCADE,
  project_id   UUID NOT NULL REFERENCES public.projects(id) ON DELETE CASCADE,
  stage        TEXT NOT NULL CHECK (stage IN ('uploaded', 'processed', 'mapped', 'linked', 'qa', 'approved', 'published')),
  waiting_on   TEXT NOT NULL CHECK (waiting_on IN ('customer', 'regrow')),
  reason       TEXT NOT NULL CHECK (char_length(btrim(reason)) BETWEEN 5 AND 500),
  raised_by    UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  raised_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
  resolved_by  UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  resolved_at  TIMESTAMPTZ,
  resolution   TEXT CHECK (resolution IS NULL OR char_length(resolution) <= 500),
  CHECK (resolved_at IS NULL OR resolved_at >= raised_at)
);
CREATE INDEX IF NOT EXISTS idx_plot_map_setup_blockers_project ON public.plot_map_setup_blockers (project_id, raised_at DESC);
CREATE INDEX IF NOT EXISTS idx_plot_map_setup_blockers_open ON public.plot_map_setup_blockers (org_id) WHERE resolved_at IS NULL;

CREATE TABLE IF NOT EXISTS public.plot_map_setup_assignments (
  project_id    UUID PRIMARY KEY REFERENCES public.projects(id) ON DELETE CASCADE,
  org_id        UUID NOT NULL REFERENCES public.organisations(id) ON DELETE CASCADE,
  assignee_user UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  assigned_by   UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  assigned_at   TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Ownership: a blocker or assignment belongs to the project's organisation; a resolved blocker stays resolved.
CREATE OR REPLACE FUNCTION public.guard_plot_map_setup_row()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = pg_catalog, public, pg_temp AS $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM public.projects WHERE id = NEW.project_id AND org_id = NEW.org_id) THEN
    RAISE EXCEPTION 'plot map setup: project belongs to another organisation';
  END IF;
  IF TG_TABLE_NAME = 'plot_map_setup_blockers' AND TG_OP = 'UPDATE' THEN
    IF NEW.org_id <> OLD.org_id OR NEW.project_id <> OLD.project_id OR NEW.stage <> OLD.stage OR NEW.waiting_on <> OLD.waiting_on
       OR NEW.reason <> OLD.reason OR NEW.raised_at <> OLD.raised_at THEN
      RAISE EXCEPTION 'plot map setup: a blocker is not edited — resolve it and raise a new one';
    END IF;
    IF OLD.resolved_at IS NOT NULL THEN RAISE EXCEPTION 'plot map setup: this blocker is already resolved'; END IF;
  END IF;
  RETURN NEW;
END $$;
DROP TRIGGER IF EXISTS trg_guard_plot_map_setup_blocker ON public.plot_map_setup_blockers;
CREATE TRIGGER trg_guard_plot_map_setup_blocker BEFORE INSERT OR UPDATE ON public.plot_map_setup_blockers
  FOR EACH ROW EXECUTE FUNCTION public.guard_plot_map_setup_row();
DROP TRIGGER IF EXISTS trg_guard_plot_map_setup_assignment ON public.plot_map_setup_assignments;
CREATE TRIGGER trg_guard_plot_map_setup_assignment BEFORE INSERT OR UPDATE ON public.plot_map_setup_assignments
  FOR EACH ROW EXECUTE FUNCTION public.guard_plot_map_setup_row();

-- Embedding.
ALTER TABLE public.plot_layouts ADD COLUMN IF NOT EXISTS embed_domains TEXT[] NOT NULL DEFAULT '{}'
  CHECK (cardinality(embed_domains) <= 10);

CREATE OR REPLACE FUNCTION public.plot_map_embed_origins(p_token TEXT)
RETURNS TEXT[] LANGUAGE sql STABLE SECURITY DEFINER SET search_path = pg_catalog, public, pg_temp AS $$
  SELECT COALESCE((
    SELECT l.embed_domains FROM public.plot_layouts l
     WHERE p_token ~ '^[A-Za-z0-9_-]{43}$' AND l.share_token = p_token AND l.share_enabled AND l.status = 'published'
       AND public.project_addon_state(l.project_id, 'plot_maps') = 'active'
  ), '{}'::TEXT[])
$$;
REVOKE ALL ON FUNCTION public.plot_map_embed_origins(TEXT) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.plot_map_embed_origins(TEXT) TO anon, authenticated, service_role;

-- In-app notifications and e-mails about the setup.
ALTER TABLE public.notifications DROP CONSTRAINT IF EXISTS notifications_type_check;
ALTER TABLE public.notifications ADD CONSTRAINT notifications_type_check CHECK (type IN (
  'lead_assigned', 'lead_unassigned', 'sla_nudge', 'sla_breach', 'follow_up_due', 'follow_up_overdue', 'document_viewed', 'plot_map'));

ALTER TABLE public.customer_email_log DROP CONSTRAINT IF EXISTS customer_email_log_kind_check;
ALTER TABLE public.customer_email_log ADD CONSTRAINT customer_email_log_kind_check
  CHECK (kind IN ('welcome', 'trial_ending', 'trial_ended', 'invoice_issued', 'payment_received', 'payment_failed', 'workspace_state',
                  'plan_active', 'member_joined', 'daily_member', 'daily_manager', 'weekly_manager',
                  'plot_map_activated', 'plot_map_action_needed', 'plot_map_published', 'plot_map_delayed'));

REVOKE ALL ON FUNCTION public.guard_plot_map_setup_row() FROM PUBLIC, anon, authenticated;
ALTER TABLE public.plot_map_setup_blockers ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.plot_map_setup_assignments ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.plot_map_setup_blockers, public.plot_map_setup_assignments FROM PUBLIC, anon, authenticated;
GRANT SELECT, INSERT, UPDATE ON public.plot_map_setup_blockers TO service_role;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.plot_map_setup_assignments TO service_role;

COMMIT;
