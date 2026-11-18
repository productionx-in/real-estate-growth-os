-- 20260051_whatsapp_inbox.sql
-- The WhatsApp inbox: conversation summaries kept in step with messages, and two integrity rules.
--   * whatsapp_conversations gains the inbox summary (who, last message, unread count, last read);
--     a trigger on whatsapp_messages keeps it current, so the inbox list is one indexed query.
--   * A message can only belong to a conversation of the same organisation (checked on every write).
--   * Delivery ticks only move forward (sent → delivered → read); Meta may report them out of order.
--     "failed" always applies.
-- Both tables stay server-only (20260043): no client privileges or policies; the app reads and writes
-- through the API after authorisation. New columns are nullable or defaulted; existing rows are backfilled.

BEGIN;

ALTER TABLE public.whatsapp_conversations
  ADD COLUMN IF NOT EXISTS contact_name TEXT,
  ADD COLUMN IF NOT EXISTS last_message_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS last_message_preview TEXT,
  ADD COLUMN IF NOT EXISTS last_direction TEXT CHECK (last_direction IN ('inbound', 'outbound')),
  ADD COLUMN IF NOT EXISTS unread_count INTEGER NOT NULL DEFAULT 0 CHECK (unread_count >= 0),
  ADD COLUMN IF NOT EXISTS last_read_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS last_read_by UUID REFERENCES public.profiles(id) ON DELETE SET NULL;

ALTER TABLE public.whatsapp_messages
  ADD COLUMN IF NOT EXISTS sent_by UUID REFERENCES public.profiles(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_whatsapp_conversations_inbox
  ON public.whatsapp_conversations (org_id, last_message_at DESC NULLS LAST);
CREATE INDEX IF NOT EXISTS idx_whatsapp_messages_thread
  ON public.whatsapp_messages (conversation_id, received_at);

-- A message and its conversation belong to the same organisation.
CREATE OR REPLACE FUNCTION public.guard_whatsapp_message()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public, pg_temp
AS $$
DECLARE
  v_org UUID;
  rank_old INT;
  rank_new INT;
BEGIN
  IF NEW.conversation_id IS NOT NULL AND (TG_OP = 'INSERT' OR NEW.conversation_id IS DISTINCT FROM OLD.conversation_id) THEN
    SELECT org_id INTO v_org FROM public.whatsapp_conversations WHERE id = NEW.conversation_id;
    IF v_org IS DISTINCT FROM NEW.org_id THEN
      RAISE EXCEPTION 'whatsapp message: conversation belongs to another organisation';
    END IF;
  END IF;
  IF TG_OP = 'UPDATE' AND NEW.org_id <> OLD.org_id THEN
    RAISE EXCEPTION 'whatsapp message: organisation cannot change';
  END IF;
  -- Ticks only move forward; a late "delivered" after "read" is ignored. "failed" always applies.
  IF TG_OP = 'UPDATE' AND NEW.delivery_status IS DISTINCT FROM OLD.delivery_status AND NEW.delivery_status <> 'failed' THEN
    rank_old := CASE OLD.delivery_status WHEN 'sent' THEN 1 WHEN 'delivered' THEN 2 WHEN 'read' THEN 3 ELSE 0 END;
    rank_new := CASE NEW.delivery_status WHEN 'sent' THEN 1 WHEN 'delivered' THEN 2 WHEN 'read' THEN 3 ELSE 0 END;
    IF rank_new < rank_old THEN
      NEW.delivery_status := OLD.delivery_status;
    END IF;
  END IF;
  RETURN NEW;
END;
$$;
REVOKE ALL ON FUNCTION public.guard_whatsapp_message() FROM PUBLIC, anon, authenticated;

DROP TRIGGER IF EXISTS trg_guard_whatsapp_message ON public.whatsapp_messages;
CREATE TRIGGER trg_guard_whatsapp_message
  BEFORE INSERT OR UPDATE ON public.whatsapp_messages
  FOR EACH ROW EXECUTE FUNCTION public.guard_whatsapp_message();

-- Keep the inbox summary in step: newest message, preview, and unread count (a reply clears it).
CREATE OR REPLACE FUNCTION public.whatsapp_conversation_rollup()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public, pg_temp
AS $$
BEGIN
  IF NEW.conversation_id IS NULL THEN
    RETURN NEW;
  END IF;
  UPDATE public.whatsapp_conversations c
     SET last_message_preview = CASE WHEN c.last_message_at IS NULL OR NEW.received_at >= c.last_message_at
                                     THEN left(coalesce(NEW.body, ''), 160) ELSE c.last_message_preview END,
         last_direction       = CASE WHEN c.last_message_at IS NULL OR NEW.received_at >= c.last_message_at
                                     THEN NEW.direction ELSE c.last_direction END,
         last_message_at      = greatest(coalesce(c.last_message_at, NEW.received_at), NEW.received_at),
         unread_count         = CASE WHEN NEW.direction = 'inbound' THEN c.unread_count + 1 ELSE 0 END,
         updated_at           = now()
   WHERE c.id = NEW.conversation_id AND c.org_id = NEW.org_id;
  RETURN NEW;
END;
$$;
REVOKE ALL ON FUNCTION public.whatsapp_conversation_rollup() FROM PUBLIC, anon, authenticated;

DROP TRIGGER IF EXISTS trg_whatsapp_conversation_rollup ON public.whatsapp_messages;
CREATE TRIGGER trg_whatsapp_conversation_rollup
  AFTER INSERT ON public.whatsapp_messages
  FOR EACH ROW EXECUTE FUNCTION public.whatsapp_conversation_rollup();

-- Backfill existing conversations from their newest message.
UPDATE public.whatsapp_conversations c
   SET last_message_at = m.received_at,
       last_message_preview = left(coalesce(m.body, ''), 160),
       last_direction = m.direction
  FROM (
    SELECT DISTINCT ON (conversation_id) conversation_id, received_at, body, direction
      FROM public.whatsapp_messages
     WHERE conversation_id IS NOT NULL
     ORDER BY conversation_id, received_at DESC
  ) m
 WHERE m.conversation_id = c.id AND c.last_message_at IS NULL;

-- Still server-only (as set by 20260043).
REVOKE ALL ON public.whatsapp_conversations, public.whatsapp_messages FROM PUBLIC, anon, authenticated;

COMMIT;
