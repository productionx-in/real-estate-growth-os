-- 20260087_lead_segments.sql
-- Lead segments: named groups of leads that campaigns (later) and people can act on.
--   * dynamic — a set of lead filters (the same JSON the leads page and saved views use, lib/leads/view-filters.ts),
--               evaluated every time it is opened, so new matching leads join on their own.
--   * fixed   — a hand-picked list: explicit lead ids in lead_segment_members.
-- A segment belongs to one organisation. Every member can see the organisation's segments; only owners, admins and
-- managers create, change or delete them (checked here and in the API). Opening a segment never widens what the
-- reader may see: the app always applies the reader's lead scope (a sales executive sees only their own leads).
-- A fixed list can only hold leads of its own organisation (trigger). Archiving or deleting a lead removes it from
-- lists through the foreign key on leads_all. Writes go through the API (service role); members read through RLS.
-- Additive: two new tables, no existing row is changed.

BEGIN;

CREATE TABLE IF NOT EXISTS public.lead_segments (
  id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id       UUID NOT NULL REFERENCES public.organisations(id) ON DELETE CASCADE,
  name         TEXT NOT NULL CHECK (char_length(btrim(name)) BETWEEN 1 AND 60),
  description  TEXT CHECK (description IS NULL OR char_length(description) <= 200),
  kind         TEXT NOT NULL CHECK (kind IN ('dynamic', 'fixed')),
  filters      JSONB NOT NULL DEFAULT '{}'::jsonb
                 CHECK (jsonb_typeof(filters) = 'object' AND octet_length(filters::text) <= 4096),
  template     TEXT CHECK (template IS NULL OR template ~ '^[a-z_]{1,40}$'),
  created_by   UUID REFERENCES public.profiles(id) ON DELETE SET NULL,
  created_at   TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at   TIMESTAMPTZ NOT NULL DEFAULT now(),
  -- A fixed list is defined by its members, not by filters.
  CHECK (kind = 'dynamic' OR filters = '{}'::jsonb)
);
CREATE UNIQUE INDEX IF NOT EXISTS uq_lead_segments_name ON public.lead_segments (org_id, lower(btrim(name)));

CREATE TABLE IF NOT EXISTS public.lead_segment_members (
  segment_id  UUID NOT NULL REFERENCES public.lead_segments(id) ON DELETE CASCADE,
  org_id      UUID NOT NULL REFERENCES public.organisations(id) ON DELETE CASCADE,
  lead_id     UUID NOT NULL REFERENCES public.leads_all(id) ON DELETE CASCADE,
  added_by    UUID REFERENCES public.profiles(id) ON DELETE SET NULL,
  added_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (segment_id, lead_id)
);
CREATE INDEX IF NOT EXISTS idx_lead_segment_members_lead ON public.lead_segment_members (org_id, lead_id);

-- Segments: the creator must be an active owner, admin or manager; organisation and kind never change.
CREATE OR REPLACE FUNCTION public.guard_lead_segment()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = pg_catalog, public, pg_temp
AS $$
BEGIN
  IF TG_OP = 'UPDATE' AND (NEW.org_id <> OLD.org_id OR NEW.kind <> OLD.kind) THEN
    RAISE EXCEPTION 'segment: organisation and kind cannot change';
  END IF;
  IF TG_OP = 'INSERT' AND NEW.created_by IS NOT NULL AND NOT EXISTS (
    SELECT 1 FROM public.org_members
     WHERE org_id = NEW.org_id AND profile_id = NEW.created_by AND status = 'active'
       AND role::text IN ('owner', 'admin', 'manager')
  ) THEN
    RAISE EXCEPTION 'segment: only owners, admins and managers can create segments';
  END IF;
  NEW.name := btrim(NEW.name);
  NEW.description := nullif(btrim(coalesce(NEW.description, '')), '');
  NEW.updated_at := now();
  RETURN NEW;
END;
$$;
REVOKE ALL ON FUNCTION public.guard_lead_segment() FROM PUBLIC, anon, authenticated;
DROP TRIGGER IF EXISTS trg_guard_lead_segment ON public.lead_segments;
CREATE TRIGGER trg_guard_lead_segment BEFORE INSERT OR UPDATE ON public.lead_segments
  FOR EACH ROW EXECUTE FUNCTION public.guard_lead_segment();

-- Members: only in a fixed list, and only leads of the list's own organisation.
CREATE OR REPLACE FUNCTION public.guard_lead_segment_member()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = pg_catalog, public, pg_temp
AS $$
DECLARE s RECORD;
BEGIN
  SELECT org_id, kind INTO s FROM public.lead_segments WHERE id = NEW.segment_id;
  IF s.kind IS DISTINCT FROM 'fixed' THEN
    RAISE EXCEPTION 'segment: leads can only be added to a fixed list';
  END IF;
  IF NEW.org_id <> s.org_id OR NOT EXISTS (SELECT 1 FROM public.leads_all WHERE id = NEW.lead_id AND org_id = s.org_id) THEN
    RAISE EXCEPTION 'segment: the lead belongs to another organisation';
  END IF;
  RETURN NEW;
END;
$$;
REVOKE ALL ON FUNCTION public.guard_lead_segment_member() FROM PUBLIC, anon, authenticated;
DROP TRIGGER IF EXISTS trg_guard_lead_segment_member ON public.lead_segment_members;
CREATE TRIGGER trg_guard_lead_segment_member BEFORE INSERT OR UPDATE ON public.lead_segment_members
  FOR EACH ROW EXECUTE FUNCTION public.guard_lead_segment_member();

ALTER TABLE public.lead_segments ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.lead_segment_members ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.lead_segments, public.lead_segment_members FROM PUBLIC, anon, authenticated;
GRANT SELECT ON public.lead_segments TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.lead_segments, public.lead_segment_members TO service_role;

DROP POLICY IF EXISTS lead_segments_member_read ON public.lead_segments;
CREATE POLICY lead_segments_member_read ON public.lead_segments FOR SELECT TO authenticated
  USING (public.auth_is_member_of_org(org_id));
-- lead_segment_members has no client policy: which leads a reader may see is decided by the server (lead scope).

COMMIT;
