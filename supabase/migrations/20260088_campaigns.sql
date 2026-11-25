-- 20260088_campaigns.sql
-- Marketing campaigns: one message, one channel (e-mail or WhatsApp), sent to a lead segment (20260087).
--   * marketing_suppressions — per organisation, the e-mail addresses and phone numbers that asked not to receive
--     marketing (an unsubscribe link, a WhatsApp STOP, or a manager adding them). Checked when recipients are chosen
--     AND again at the moment each message is sent, so a late opt-out still wins.
--   * campaigns — the message and its state: draft → sending → sent (or cancelled). Only owners, admins and managers
--     of the organisation create, send or cancel one (checked here and in the API).
--   * campaign_recipients — frozen when sending starts, one row per address (duplicates collapse), each with its own
--     outcome: queued, sent, skipped (with the reason) or failed. An unsubscribe token per row backs the e-mail link.
-- E-mail goes through the outbox (20260070) under a new 'marketing' category; WhatsApp through the Cloud API with
-- approved MARKETING templates only (lib/campaigns). Server-only tables: RLS on, no client privileges.
-- Additive except one widened CHECK on email_outbox.category (adds 'marketing').

BEGIN;

ALTER TABLE public.email_outbox DROP CONSTRAINT IF EXISTS email_outbox_category_check;
ALTER TABLE public.email_outbox ADD CONSTRAINT email_outbox_category_check
  CHECK (category IN ('auth', 'account', 'report', 'buyer', 'sales', 'staff', 'marketing'));

CREATE TABLE IF NOT EXISTS public.marketing_suppressions (
  org_id      UUID NOT NULL REFERENCES public.organisations(id) ON DELETE CASCADE,
  channel     TEXT NOT NULL CHECK (channel IN ('email', 'whatsapp')),
  -- email: lower-case address; whatsapp: digits only, with country code.
  address     TEXT NOT NULL CHECK (
                (channel = 'email' AND address = lower(address) AND address ~* '^[^@\s]+@[^@\s]+\.[^@\s]+$' AND length(address) <= 320)
                OR (channel = 'whatsapp' AND address ~ '^[0-9]{8,15}$')),
  source      TEXT NOT NULL CHECK (source IN ('unsubscribe_link', 'whatsapp_stop', 'manual')),
  created_by  UUID REFERENCES public.profiles(id) ON DELETE SET NULL,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (org_id, channel, address)
);

CREATE TABLE IF NOT EXISTS public.campaigns (
  id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id            UUID NOT NULL REFERENCES public.organisations(id) ON DELETE CASCADE,
  name              TEXT NOT NULL CHECK (char_length(btrim(name)) BETWEEN 1 AND 80),
  channel           TEXT NOT NULL CHECK (channel IN ('email', 'whatsapp')),
  segment_id        UUID REFERENCES public.lead_segments(id) ON DELETE SET NULL,
  segment_name      TEXT,                                   -- kept for the record if the segment is deleted later
  status            TEXT NOT NULL DEFAULT 'draft' CHECK (status IN ('draft', 'sending', 'sent', 'cancelled')),
  -- e-mail
  subject           TEXT CHECK (subject IS NULL OR char_length(subject) BETWEEN 1 AND 150),
  body              TEXT CHECK (body IS NULL OR char_length(body) BETWEEN 1 AND 5000),
  -- WhatsApp (an approved MARKETING template of a connected number)
  wa_connection_id  UUID REFERENCES public.integration_connections(id) ON DELETE SET NULL,
  wa_template_name  TEXT CHECK (wa_template_name IS NULL OR wa_template_name ~ '^[a-z0-9_]{1,512}$'),
  wa_language       TEXT CHECK (wa_language IS NULL OR wa_language ~ '^[A-Za-z_]{2,10}$'),
  consent_confirmed BOOLEAN NOT NULL DEFAULT false,
  created_by        UUID REFERENCES public.profiles(id) ON DELETE SET NULL,
  sent_by           UUID REFERENCES public.profiles(id) ON DELETE SET NULL,
  created_at        TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at        TIMESTAMPTZ NOT NULL DEFAULT now(),
  started_at        TIMESTAMPTZ,
  finished_at       TIMESTAMPTZ,
  -- Sending needs a complete message for its channel and the sender's confirmation of consent.
  CHECK (status = 'draft' OR status = 'cancelled' OR (
    consent_confirmed AND started_at IS NOT NULL AND (
      (channel = 'email' AND subject IS NOT NULL AND body IS NOT NULL)
      OR (channel = 'whatsapp' AND wa_connection_id IS NOT NULL AND wa_template_name IS NOT NULL AND wa_language IS NOT NULL))))
);
CREATE INDEX IF NOT EXISTS idx_campaigns_org ON public.campaigns (org_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_campaigns_sending ON public.campaigns (status) WHERE status = 'sending';

CREATE TABLE IF NOT EXISTS public.campaign_recipients (
  id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  campaign_id       UUID NOT NULL REFERENCES public.campaigns(id) ON DELETE CASCADE,
  org_id            UUID NOT NULL REFERENCES public.organisations(id) ON DELETE CASCADE,
  lead_id           UUID REFERENCES public.leads_all(id) ON DELETE SET NULL,
  address           TEXT NOT NULL CHECK (length(address) BETWEEN 1 AND 320),
  first_name        TEXT CHECK (first_name IS NULL OR char_length(first_name) <= 60),
  status            TEXT NOT NULL CHECK (status IN ('queued', 'sent', 'skipped', 'failed')),
  skip_reason       TEXT CHECK (skip_reason IS NULL OR skip_reason IN ('no_address', 'invalid_address', 'opted_out', 'duplicate', 'junk', 'cancelled')),
  email_outbox_id   UUID REFERENCES public.email_outbox(id) ON DELETE SET NULL,
  wa_message_id     TEXT,
  error             TEXT CHECK (error IS NULL OR char_length(error) <= 300),
  unsubscribe_token UUID NOT NULL DEFAULT gen_random_uuid() UNIQUE,
  claimed_until     TIMESTAMPTZ,                           -- a sender is working on this row (claim_campaign_recipients)
  created_at        TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at        TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (campaign_id, address),
  CHECK (status <> 'skipped' OR skip_reason IS NOT NULL)
);
CREATE INDEX IF NOT EXISTS idx_campaign_recipients_queue ON public.campaign_recipients (campaign_id, status) WHERE status = 'queued';

-- Campaigns: the creator must be an active owner, admin or manager; the organisation and channel never change; a
-- campaign that has started cannot go back to draft, and its message cannot change any more.
CREATE OR REPLACE FUNCTION public.guard_campaign()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = pg_catalog, public, pg_temp
AS $$
BEGIN
  IF TG_OP = 'INSERT' AND (NEW.status <> 'draft' OR NOT EXISTS (
    SELECT 1 FROM public.org_members WHERE org_id = NEW.org_id AND profile_id = NEW.created_by AND status = 'active'
      AND role::text IN ('owner', 'admin', 'manager'))) THEN
    RAISE EXCEPTION 'campaign: only owners, admins and managers can create campaigns';
  END IF;
  IF TG_OP = 'UPDATE' THEN
    IF NEW.org_id <> OLD.org_id OR NEW.channel <> OLD.channel THEN
      RAISE EXCEPTION 'campaign: organisation and channel cannot change';
    END IF;
    IF OLD.status <> 'draft' AND (NEW.status = 'draft'
        OR NEW.subject IS DISTINCT FROM OLD.subject OR NEW.body IS DISTINCT FROM OLD.body
        OR NEW.wa_template_name IS DISTINCT FROM OLD.wa_template_name OR NEW.wa_language IS DISTINCT FROM OLD.wa_language
        OR NEW.wa_connection_id IS DISTINCT FROM OLD.wa_connection_id OR (NEW.segment_id IS DISTINCT FROM OLD.segment_id AND NEW.segment_id IS NOT NULL)) THEN
      RAISE EXCEPTION 'campaign: a campaign that has started cannot be edited';
    END IF;
    IF OLD.status IN ('sent', 'cancelled') AND NEW.status <> OLD.status THEN
      RAISE EXCEPTION 'campaign: a finished campaign cannot change state';
    END IF;
  END IF;
  NEW.name := btrim(NEW.name);
  NEW.updated_at := now();
  RETURN NEW;
END;
$$;
REVOKE ALL ON FUNCTION public.guard_campaign() FROM PUBLIC, anon, authenticated;
DROP TRIGGER IF EXISTS trg_guard_campaign ON public.campaigns;
CREATE TRIGGER trg_guard_campaign BEFORE INSERT OR UPDATE ON public.campaigns FOR EACH ROW EXECUTE FUNCTION public.guard_campaign();

-- Recipients: same organisation as their campaign and their lead.
CREATE OR REPLACE FUNCTION public.guard_campaign_recipient()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = pg_catalog, public, pg_temp
AS $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM public.campaigns WHERE id = NEW.campaign_id AND org_id = NEW.org_id)
     OR (NEW.lead_id IS NOT NULL AND NOT EXISTS (SELECT 1 FROM public.leads_all WHERE id = NEW.lead_id AND org_id = NEW.org_id)) THEN
    RAISE EXCEPTION 'campaign: recipient belongs to another organisation';
  END IF;
  NEW.updated_at := now();
  RETURN NEW;
END;
$$;
REVOKE ALL ON FUNCTION public.guard_campaign_recipient() FROM PUBLIC, anon, authenticated;
DROP TRIGGER IF EXISTS trg_guard_campaign_recipient ON public.campaign_recipients;
CREATE TRIGGER trg_guard_campaign_recipient BEFORE INSERT OR UPDATE ON public.campaign_recipients
  FOR EACH ROW EXECUTE FUNCTION public.guard_campaign_recipient();

-- Hands the next batch of queued recipients of one campaign to exactly one sender (SKIP LOCKED; a claim expires after
-- five minutes, so a crashed run is picked up again). E-mail rows leave the queue once they are in the outbox.
CREATE OR REPLACE FUNCTION public.claim_campaign_recipients(p_campaign UUID, p_limit INTEGER)
RETURNS SETOF public.campaign_recipients
LANGUAGE plpgsql SECURITY DEFINER SET search_path = pg_catalog, public, pg_temp
AS $$
BEGIN
  RETURN QUERY
  UPDATE public.campaign_recipients r SET claimed_until = now() + interval '5 minutes'
  WHERE r.id IN (
    SELECT x.id FROM public.campaign_recipients x
    WHERE x.campaign_id = p_campaign AND x.status = 'queued' AND x.email_outbox_id IS NULL
      AND (x.claimed_until IS NULL OR x.claimed_until < now())
    ORDER BY x.created_at, x.id
    LIMIT least(greatest(p_limit, 1), 500)
    FOR UPDATE SKIP LOCKED)
  RETURNING r.*;
END;
$$;
REVOKE ALL ON FUNCTION public.claim_campaign_recipients(UUID, INTEGER) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.claim_campaign_recipients(UUID, INTEGER) TO service_role;

-- Delivery as people see it: an e-mail recipient counts as sent once the outbox sent it, failed if the outbox gave up.
CREATE OR REPLACE VIEW public.campaign_recipient_outcomes WITH (security_invoker = true) AS
SELECT r.id, r.campaign_id, r.org_id, r.lead_id, r.address, r.skip_reason, r.error, r.updated_at,
  CASE
    WHEN r.status = 'queued' AND o.status = 'sent' THEN 'sent'
    WHEN r.status = 'queued' AND o.status IN ('failed', 'cancelled') THEN 'failed'
    ELSE r.status
  END AS status,
  coalesce(o.sent_at, CASE WHEN r.status = 'sent' THEN r.updated_at END) AS sent_at
FROM public.campaign_recipients r
LEFT JOIN public.email_outbox o ON o.id = r.email_outbox_id;

CREATE OR REPLACE VIEW public.campaign_stats WITH (security_invoker = true) AS
SELECT campaign_id, org_id,
  count(*)                                   AS total,
  count(*) FILTER (WHERE status = 'queued')  AS queued,
  count(*) FILTER (WHERE status = 'sent')    AS sent,
  count(*) FILTER (WHERE status = 'skipped') AS skipped,
  count(*) FILTER (WHERE status = 'failed')  AS failed
FROM public.campaign_recipient_outcomes
GROUP BY campaign_id, org_id;

REVOKE ALL ON public.campaign_recipient_outcomes, public.campaign_stats FROM PUBLIC, anon, authenticated;
GRANT SELECT ON public.campaign_recipient_outcomes, public.campaign_stats TO service_role;

ALTER TABLE public.marketing_suppressions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.campaigns ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.campaign_recipients ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.marketing_suppressions, public.campaigns, public.campaign_recipients FROM PUBLIC, anon, authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.marketing_suppressions, public.campaigns, public.campaign_recipients TO service_role;

COMMIT;
