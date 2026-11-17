-- 20260050_saved_views.sql
-- Saved views for the leads list and board: a named set of filters plus a layout (list or board).
--   * A view belongs to one organisation and one member (owner_id).
--   * A personal view is visible only to its owner. A shared view is visible to every active member
--     of the organisation; only managers and above may share one (enforced in the API and below).
--   * Filters are stored as a small JSON object and re-validated by the app on every read, so a stored
--     view can never widen what the reader is allowed to see (a sales executive still sees only their
--     own leads when opening a shared "whole team" view).
-- Writes go through the API (service role) after server-side authorisation. Members may read their
-- own and shared views through RLS. No existing row is changed.

BEGIN;

CREATE TABLE IF NOT EXISTS public.saved_views (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id      UUID NOT NULL REFERENCES public.organisations(id) ON DELETE CASCADE,
  owner_id    UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  entity      TEXT NOT NULL DEFAULT 'leads' CHECK (entity IN ('leads')),
  name        TEXT NOT NULL CHECK (char_length(btrim(name)) BETWEEN 1 AND 60),
  layout      TEXT NOT NULL DEFAULT 'list' CHECK (layout IN ('list', 'board')),
  filters     JSONB NOT NULL DEFAULT '{}'::jsonb
                CHECK (jsonb_typeof(filters) = 'object' AND octet_length(filters::text) <= 4096),
  shared      BOOLEAN NOT NULL DEFAULT false,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- One name per person per organisation (case-insensitive), so the tabs stay unambiguous.
CREATE UNIQUE INDEX IF NOT EXISTS uq_saved_views_owner_name
  ON public.saved_views (org_id, owner_id, entity, lower(btrim(name)));
CREATE INDEX IF NOT EXISTS idx_saved_views_org_shared
  ON public.saved_views (org_id, entity) WHERE shared;

-- The owner must be an active member of the view's organisation, and only managers and above
-- may share a view. Checked in the database as well as the API.
CREATE OR REPLACE FUNCTION public.guard_saved_view()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public, pg_temp
AS $$
DECLARE
  v_role TEXT;
BEGIN
  IF TG_OP = 'UPDATE' AND (NEW.org_id <> OLD.org_id OR NEW.owner_id <> OLD.owner_id) THEN
    RAISE EXCEPTION 'saved view: organisation and owner cannot change';
  END IF;

  -- Checked when a view is created and when it becomes shared. Later edits by a manager keep working
  -- even if the person who made a shared view has since changed role or left.
  IF TG_OP = 'INSERT' OR (NEW.shared AND NOT OLD.shared) THEN
    SELECT role::text INTO v_role
    FROM public.org_members
    WHERE org_id = NEW.org_id AND profile_id = NEW.owner_id AND status = 'active';

    IF v_role IS NULL THEN
      RAISE EXCEPTION 'saved view: owner is not an active member of this organisation';
    END IF;
    IF NEW.shared AND v_role NOT IN ('owner', 'admin', 'manager') THEN
      RAISE EXCEPTION 'saved view: only managers can share a view';
    END IF;
  END IF;

  NEW.name := btrim(NEW.name);
  NEW.updated_at := now();
  RETURN NEW;
END;
$$;

REVOKE ALL ON FUNCTION public.guard_saved_view() FROM PUBLIC, anon, authenticated;

DROP TRIGGER IF EXISTS trg_guard_saved_view ON public.saved_views;
CREATE TRIGGER trg_guard_saved_view
  BEFORE INSERT OR UPDATE ON public.saved_views
  FOR EACH ROW EXECUTE FUNCTION public.guard_saved_view();

ALTER TABLE public.saved_views ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.saved_views FROM PUBLIC, anon, authenticated;
GRANT SELECT ON public.saved_views TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.saved_views TO service_role;

DROP POLICY IF EXISTS saved_views_member_read ON public.saved_views;
CREATE POLICY saved_views_member_read ON public.saved_views FOR SELECT TO authenticated
  USING (
    public.auth_is_member_of_org(org_id)
    AND (owner_id = public.auth_profile_id() OR shared)
  );

COMMIT;
