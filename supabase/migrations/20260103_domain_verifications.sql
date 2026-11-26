-- 20260103_domain_verifications.sql
-- Simple integrations (docs: the Integrations dashboard): a workspace proves it owns its website or e-mail domain with
-- one DNS TXT record (_regrow-verify.<domain> = regrow-verify=<token>), checked by the server. For e-mail, the domain is
-- also registered with REGrow's e-mail provider, whose sending records (and their state) are kept here, so buyer-facing
-- e-mail can be sent from the workspace's own domain once both checks pass.
-- Additive. Server-only table: RLS on, no client privileges.

BEGIN;

CREATE TABLE IF NOT EXISTS public.domain_verifications (
  id                 UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id             UUID NOT NULL REFERENCES public.organisations(id) ON DELETE CASCADE,
  purpose            TEXT NOT NULL CHECK (purpose IN ('website', 'email')),
  domain             TEXT NOT NULL CHECK (domain ~ '^[a-z0-9]([a-z0-9-]*[a-z0-9])?(\.[a-z0-9]([a-z0-9-]*[a-z0-9])?)+$' AND length(domain) <= 253),
  token              TEXT NOT NULL CHECK (token ~ '^[0-9a-f]{32}$'),
  status             TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'verified')),
  -- E-mail only: the address buyers see ("sales" → sales@domain).
  send_as            TEXT CHECK (send_as IS NULL OR send_as ~ '^[a-z0-9]([a-z0-9._-]{0,62}[a-z0-9])?$'),
  provider_domain_id TEXT CHECK (provider_domain_id IS NULL OR length(provider_domain_id) <= 100),
  provider_records   JSONB NOT NULL DEFAULT '[]'::jsonb CHECK (jsonb_typeof(provider_records) = 'array' AND pg_column_size(provider_records) < 16384),
  provider_status    TEXT CHECK (provider_status IS NULL OR length(provider_status) <= 40),
  dmarc              BOOLEAN NOT NULL DEFAULT false,
  last_checked_at    TIMESTAMPTZ,
  verified_at        TIMESTAMPTZ,
  created_by         UUID REFERENCES public.profiles(id) ON DELETE SET NULL,
  created_at         TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (org_id, purpose, domain),
  CHECK (purpose = 'email' OR (send_as IS NULL AND provider_domain_id IS NULL))
);
CREATE INDEX IF NOT EXISTS idx_domain_verifications_org ON public.domain_verifications (org_id, purpose);
ALTER TABLE public.domain_verifications ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.domain_verifications FROM PUBLIC, anon, authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.domain_verifications TO service_role;

COMMIT;
