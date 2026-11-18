-- 20260052_document_templates.sql
-- Document templates (cost sheets, quotations, letters) and the documents generated from them for a lead,
-- shared with the buyer through a private link.
--   * document_templates: per organisation; managers and above edit (enforced in the API).
--   * lead_documents: a frozen copy of the filled-in text (later price changes never rewrite what the
--     buyer was sent), plus a share link: a 256-bit random token with an expiry, which can be revoked.
--   * record_document_view(token): the public page calls this; it counts views and, on the first one,
--     logs it on the lead and notifies the salesperson. Service role only.
-- Both tables are server-only: RLS on, no client privileges or policies (as for WhatsApp, 20260043).

BEGIN;

CREATE TABLE IF NOT EXISTS public.document_templates (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id      UUID NOT NULL REFERENCES public.organisations(id) ON DELETE CASCADE,
  name        TEXT NOT NULL CHECK (char_length(btrim(name)) BETWEEN 1 AND 80),
  kind        TEXT NOT NULL DEFAULT 'cost_sheet' CHECK (kind IN ('cost_sheet', 'quotation', 'letter', 'other')),
  body        TEXT NOT NULL CHECK (char_length(body) BETWEEN 1 AND 20000),
  archived    BOOLEAN NOT NULL DEFAULT false,
  created_by  UUID REFERENCES public.profiles(id) ON DELETE SET NULL,
  updated_by  UUID REFERENCES public.profiles(id) ON DELETE SET NULL,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX IF NOT EXISTS uq_document_templates_name
  ON public.document_templates (org_id, lower(btrim(name))) WHERE NOT archived;

CREATE TABLE IF NOT EXISTS public.lead_documents (
  id               UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id           UUID NOT NULL REFERENCES public.organisations(id) ON DELETE CASCADE,
  lead_id          UUID NOT NULL REFERENCES public.leads(id) ON DELETE CASCADE,
  template_id      UUID REFERENCES public.document_templates(id) ON DELETE SET NULL,
  unit_id          UUID REFERENCES public.inventory_items(id) ON DELETE SET NULL,
  title            TEXT NOT NULL CHECK (char_length(btrim(title)) BETWEEN 1 AND 120),
  body             TEXT NOT NULL CHECK (char_length(body) BETWEEN 1 AND 40000),
  share_token      TEXT NOT NULL UNIQUE CHECK (share_token ~ '^[A-Za-z0-9_-]{43}$'),
  expires_at       TIMESTAMPTZ NOT NULL,
  revoked_at       TIMESTAMPTZ,
  view_count       INTEGER NOT NULL DEFAULT 0 CHECK (view_count >= 0),
  first_viewed_at  TIMESTAMPTZ,
  last_viewed_at   TIMESTAMPTZ,
  created_by       UUID REFERENCES public.profiles(id) ON DELETE SET NULL,
  created_at       TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_lead_documents_lead ON public.lead_documents (org_id, lead_id, created_at DESC);

-- Everything a document points at belongs to its organisation.
CREATE OR REPLACE FUNCTION public.guard_lead_document()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public, pg_temp
AS $$
BEGIN
  IF TG_OP = 'UPDATE' AND (NEW.org_id <> OLD.org_id OR NEW.lead_id <> OLD.lead_id) THEN
    RAISE EXCEPTION 'lead document: organisation and lead cannot change';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM public.leads WHERE id = NEW.lead_id AND org_id = NEW.org_id) THEN
    RAISE EXCEPTION 'lead document: lead belongs to another organisation';
  END IF;
  IF NEW.template_id IS NOT NULL AND NOT EXISTS (SELECT 1 FROM public.document_templates WHERE id = NEW.template_id AND org_id = NEW.org_id) THEN
    RAISE EXCEPTION 'lead document: template belongs to another organisation';
  END IF;
  IF NEW.unit_id IS NOT NULL AND NOT EXISTS (SELECT 1 FROM public.inventory_items WHERE id = NEW.unit_id AND org_id = NEW.org_id) THEN
    RAISE EXCEPTION 'lead document: unit belongs to another organisation';
  END IF;
  RETURN NEW;
END;
$$;
REVOKE ALL ON FUNCTION public.guard_lead_document() FROM PUBLIC, anon, authenticated;
DROP TRIGGER IF EXISTS trg_guard_lead_document ON public.lead_documents;
CREATE TRIGGER trg_guard_lead_document BEFORE INSERT OR UPDATE ON public.lead_documents
  FOR EACH ROW EXECUTE FUNCTION public.guard_lead_document();

ALTER TABLE public.notifications DROP CONSTRAINT IF EXISTS notifications_type_check;
ALTER TABLE public.notifications ADD CONSTRAINT notifications_type_check CHECK (type IN (
  'lead_assigned', 'lead_unassigned', 'sla_nudge', 'sla_breach', 'follow_up_due', 'follow_up_overdue', 'document_viewed'));

-- Counts a view of a shared document. Returns the document only while its link is live (not revoked,
-- not expired); otherwise nothing, so the public page cannot tell "expired" from "never existed".
-- The first view is logged on the lead and the salesperson is notified (once per document).
CREATE OR REPLACE FUNCTION public.record_document_view(p_token TEXT)
RETURNS TABLE (id UUID, org_id UUID, lead_id UUID, title TEXT, body TEXT, created_by UUID, created_at TIMESTAMPTZ)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public, pg_temp
AS $$
DECLARE
  d public.lead_documents%ROWTYPE;
  v_owner UUID;
  v_actor UUID;
  v_name TEXT;
BEGIN
  IF p_token IS NULL OR p_token !~ '^[A-Za-z0-9_-]{43}$' THEN
    RETURN;
  END IF;
  UPDATE public.lead_documents ld
     SET view_count = ld.view_count + 1,
         first_viewed_at = coalesce(ld.first_viewed_at, now()),
         last_viewed_at = now()
   WHERE ld.share_token = p_token AND ld.revoked_at IS NULL AND ld.expires_at > now()
  RETURNING ld.* INTO d;
  IF d.id IS NULL THEN
    RETURN;
  END IF;

  IF d.view_count = 1 THEN
    SELECT l.assigned_to, l.name INTO v_owner, v_name FROM public.leads l WHERE l.id = d.lead_id;
    v_actor := coalesce(d.created_by, v_owner);
    IF v_actor IS NOT NULL THEN
      INSERT INTO public.lead_activities (lead_id, actor_id, type, note, metadata)
      VALUES (d.lead_id, v_actor, 'note_added', 'Opened the document “' || d.title || '”',
              jsonb_build_object('document_id', d.id, 'event', 'document_viewed'));
    END IF;
    IF coalesce(v_owner, d.created_by) IS NOT NULL THEN
      PERFORM public.regrow_notify(d.org_id, coalesce(v_owner, d.created_by), 'document_viewed',
        coalesce(v_name, 'Your buyer') || ' opened “' || d.title || '”',
        'A good moment to call.', d.lead_id, 'docview:' || d.id);
    END IF;
  END IF;

  RETURN QUERY SELECT d.id, d.org_id, d.lead_id, d.title, d.body, d.created_by, d.created_at;
END;
$$;
REVOKE ALL ON FUNCTION public.record_document_view(TEXT) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.record_document_view(TEXT) TO service_role;

ALTER TABLE public.document_templates ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.lead_documents ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.document_templates, public.lead_documents FROM PUBLIC, anon, authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.document_templates, public.lead_documents TO service_role;
COMMENT ON TABLE public.document_templates IS 'Server-only (service role via /api after authorisation). No client privileges.';
COMMENT ON TABLE public.lead_documents IS 'Server-only (service role via /api after authorisation). No client privileges. share_token is a 256-bit capability.';

COMMIT;
