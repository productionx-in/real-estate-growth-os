-- 20260089_whatsapp_auto_reply.sql
-- Settings → WhatsApp: an automatic welcome message on a buyer's first message, and an away message outside business
-- hours (lib/integrations/whatsapp/auto-reply.ts). Both are off until a workspace turns them on with its own words.
--   * org_settings.whatsapp — the settings (server-only table, 20260074).
--   * whatsapp_conversations.last_auto_reply_at — claimed atomically before an automatic reply is sent, so a buyer
--     gets at most one automatic reply per 12 hours even when messages or webhook retries arrive together.
-- Additive only.

BEGIN;

ALTER TABLE public.org_settings
  ADD COLUMN IF NOT EXISTS whatsapp JSONB NOT NULL DEFAULT '{}'::jsonb CHECK (jsonb_typeof(whatsapp) = 'object' AND pg_column_size(whatsapp) < 8192);

ALTER TABLE public.whatsapp_conversations
  ADD COLUMN IF NOT EXISTS last_auto_reply_at TIMESTAMPTZ;

COMMIT;
