-- 20260064_assistant_interactions.sql — every conversation with Rio (the REGrow guide), kept for research and for
-- training REGrow's own assistant later (docs/design/rio-assistant.md).
--   * Text is stored REDACTED (phone numbers, e-mails, long digit strings masked) — written by lib/support/memory.ts.
--   * No user or organisation id is stored: a workspace conversation keeps only a one-way hash of the workspace,
--     so a conversation cannot be traced back to a customer from this table.
--   * Workspace conversations are excluded from staff screens and exports by default (staff never read customer
--     business data); website and sign-in conversations are REGrow's own sales and support data.
--   * RLS on, no client grants: written and read only by server routes. Additive: nothing existing changes.

CREATE TABLE IF NOT EXISTS public.assistant_conversations (
  id             UUID PRIMARY KEY,                          -- random id from the visitor's browser session
  context        TEXT NOT NULL CHECK (context IN ('website', 'auth', 'workspace')),
  workspace_hash TEXT CHECK (workspace_hash IS NULL OR length(workspace_hash) = 64),
  first_path     TEXT CHECK (first_path IS NULL OR length(first_path) <= 200),
  message_count  INTEGER NOT NULL DEFAULT 0 CHECK (message_count >= 0),
  callback_saved BOOLEAN NOT NULL DEFAULT false,
  started_at     TIMESTAMPTZ NOT NULL DEFAULT now(),
  last_at        TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_assistant_conversations_recent ON public.assistant_conversations (context, last_at DESC);

CREATE TABLE IF NOT EXISTS public.assistant_messages (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  conversation_id UUID NOT NULL REFERENCES public.assistant_conversations(id) ON DELETE CASCADE,
  role            TEXT NOT NULL CHECK (role IN ('user', 'assistant')),
  content         TEXT NOT NULL CHECK (length(content) BETWEEN 1 AND 4000),
  -- assistant turns: who answered and how
  source          TEXT CHECK (source IS NULL OR source IN ('ai', 'offline')),
  provider        TEXT CHECK (provider IS NULL OR provider IN ('anthropic', 'openai', 'gemini')),
  model           TEXT CHECK (model IS NULL OR length(model) <= 100),
  latency_ms      INTEGER CHECK (latency_ms IS NULL OR latency_ms >= 0),
  input_tokens    INTEGER CHECK (input_tokens IS NULL OR input_tokens >= 0),
  output_tokens   INTEGER CHECK (output_tokens IS NULL OR output_tokens >= 0),
  handoff         BOOLEAN,
  links           JSONB NOT NULL DEFAULT '[]'::jsonb,
  -- quality label from the visitor (thumbs up / down) — the signal for training and evaluation
  rating          SMALLINT CHECK (rating IS NULL OR rating IN (-1, 1)),
  rated_at        TIMESTAMPTZ,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
  CHECK (role = 'assistant' OR (source IS NULL AND provider IS NULL AND rating IS NULL))
);
CREATE INDEX IF NOT EXISTS idx_assistant_messages_conversation ON public.assistant_messages (conversation_id, created_at);
CREATE INDEX IF NOT EXISTS idx_assistant_messages_rated ON public.assistant_messages (rating) WHERE rating IS NOT NULL;

DO $$
DECLARE t TEXT;
BEGIN
  FOREACH t IN ARRAY ARRAY['assistant_conversations', 'assistant_messages'] LOOP
    EXECUTE format('ALTER TABLE public.%I ENABLE ROW LEVEL SECURITY', t);
    EXECUTE format('REVOKE ALL ON public.%I FROM PUBLIC, anon, authenticated', t);
    EXECUTE format('GRANT SELECT, INSERT, UPDATE, DELETE ON public.%I TO service_role', t);
  END LOOP;
END $$;
