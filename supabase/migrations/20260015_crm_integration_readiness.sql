-- supabase/migrations/20260015_crm_integration_readiness.sql
-- Migration 0015: CRM Integration Readiness & Lead Source Architecture
-- Prepares the database for future multi-provider lead integrations (Meta, Google, WhatsApp, Portals, Webhooks).

-- 1. Create integration_connections table
CREATE TABLE IF NOT EXISTS public.integration_connections (
  id                    UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id                UUID NOT NULL REFERENCES public.organisations(id) ON DELETE CASCADE,
  provider              TEXT NOT NULL CHECK (provider IN ('meta_ads', 'google_ads', 'website_webhook', 'whatsapp_cloud', 'property_portal_99acres', 'property_portal_magicbricks', 'property_portal_housing', 'manual', 'other')),
  name                  TEXT NOT NULL,
  external_account_id   TEXT,
  status                TEXT NOT NULL CHECK (status IN ('not_connected', 'connected', 'error', 'disabled')) DEFAULT 'not_connected',
  connected_by          UUID REFERENCES public.profiles(id) ON DELETE SET NULL,
  last_sync_at          TIMESTAMPTZ,
  last_error            TEXT,
  credential_ref        TEXT, -- Secure KMS/Vault secret identifier; NEVER store plaintext access tokens
  metadata              JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at            TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at            TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_integration_connections_org ON public.integration_connections(org_id);
CREATE INDEX IF NOT EXISTS idx_integration_connections_provider ON public.integration_connections(org_id, provider);

CREATE TRIGGER integration_connections_updated_at
  BEFORE UPDATE ON public.integration_connections
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- Enforce Organisation Ownership Immutability on integration_connections
CREATE OR REPLACE FUNCTION public.check_connection_org_immutable()
RETURNS TRIGGER AS $$
BEGIN
  IF OLD.org_id <> NEW.org_id THEN
    RAISE EXCEPTION 'Organisation ownership of an integration connection is immutable (from % to %)', OLD.org_id, NEW.org_id;
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_connection_org_immutable ON public.integration_connections;
CREATE TRIGGER trg_connection_org_immutable
  BEFORE UPDATE OF org_id ON public.integration_connections
  FOR EACH ROW EXECUTE FUNCTION public.check_connection_org_immutable();

-- Enable RLS on integration_connections
ALTER TABLE public.integration_connections ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "org_members_can_read_connections" ON public.integration_connections;
CREATE POLICY "org_members_can_read_connections" ON public.integration_connections
  FOR SELECT USING (auth_is_member_of_org(org_id));

DROP POLICY IF EXISTS "managers_can_manage_connections" ON public.integration_connections;
CREATE POLICY "managers_can_manage_connections" ON public.integration_connections
  FOR ALL USING (auth_has_role_in_org(org_id, ARRAY['owner', 'admin', 'manager']));

-- 2. Create integration_project_mappings table
-- Maps external campaigns, forms, or accounts to specific internal projects
CREATE TABLE IF NOT EXISTS public.integration_project_mappings (
  id                          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id                      UUID NOT NULL REFERENCES public.organisations(id) ON DELETE CASCADE,
  connection_id               UUID NOT NULL REFERENCES public.integration_connections(id) ON DELETE CASCADE,
  project_id                  UUID NOT NULL REFERENCES public.projects(id) ON DELETE CASCADE,
  external_identifier_type    TEXT NOT NULL CHECK (external_identifier_type IN ('campaign_id', 'form_id', 'page_id', 'account_default')),
  external_identifier_value   TEXT NOT NULL,
  description                 TEXT,
  created_at                  TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at                  TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (connection_id, external_identifier_type, external_identifier_value)
);

CREATE INDEX IF NOT EXISTS idx_mappings_org ON public.integration_project_mappings(org_id);
CREATE INDEX IF NOT EXISTS idx_mappings_connection ON public.integration_project_mappings(connection_id);
CREATE INDEX IF NOT EXISTS idx_mappings_project ON public.integration_project_mappings(project_id);

CREATE TRIGGER integration_project_mappings_updated_at
  BEFORE UPDATE ON public.integration_project_mappings
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- Enforce Organisation Ownership Immutability and Cross-Tenant Integrity on integration_project_mappings
CREATE OR REPLACE FUNCTION public.check_mapping_same_org()
RETURNS TRIGGER AS $$
DECLARE
  v_conn_org UUID;
  v_proj_org UUID;
BEGIN
  IF TG_OP = 'UPDATE' AND OLD.org_id <> NEW.org_id THEN
    RAISE EXCEPTION 'Organisation ownership of a project mapping is immutable (from % to %)', OLD.org_id, NEW.org_id;
  END IF;

  SELECT org_id INTO v_conn_org FROM public.integration_connections WHERE id = NEW.connection_id;
  IF v_conn_org IS NULL OR v_conn_org <> NEW.org_id THEN
    RAISE EXCEPTION 'Mapping connection must belong to the same organisation (mapping %, connection %)', NEW.org_id, v_conn_org;
  END IF;

  SELECT org_id INTO v_proj_org FROM public.projects WHERE id = NEW.project_id;
  IF v_proj_org IS NULL OR v_proj_org <> NEW.org_id THEN
    RAISE EXCEPTION 'Mapping project must belong to the same organisation (mapping %, project %)', NEW.org_id, v_proj_org;
  END IF;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_check_mapping_same_org ON public.integration_project_mappings;
CREATE TRIGGER trg_check_mapping_same_org
  BEFORE INSERT OR UPDATE OF org_id, connection_id, project_id ON public.integration_project_mappings
  FOR EACH ROW EXECUTE FUNCTION public.check_mapping_same_org();

-- Enable RLS on integration_project_mappings
ALTER TABLE public.integration_project_mappings ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "org_members_can_read_mappings" ON public.integration_project_mappings;
CREATE POLICY "org_members_can_read_mappings" ON public.integration_project_mappings
  FOR SELECT USING (auth_is_member_of_org(org_id));

DROP POLICY IF EXISTS "managers_can_manage_mappings" ON public.integration_project_mappings;
CREATE POLICY "managers_can_manage_mappings" ON public.integration_project_mappings
  FOR ALL USING (auth_has_role_in_org(org_id, ARRAY['owner', 'admin', 'manager']));

-- 3. Create integration_event_logs table (inbound webhook & sync history)
CREATE TABLE IF NOT EXISTS public.integration_event_logs (
  id                    UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id                UUID NOT NULL REFERENCES public.organisations(id) ON DELETE CASCADE,
  connection_id         UUID REFERENCES public.integration_connections(id) ON DELETE SET NULL,
  provider              TEXT NOT NULL,
  event_type            TEXT NOT NULL,
  external_event_id     TEXT,
  processing_status     TEXT NOT NULL CHECK (processing_status IN ('received', 'processed', 'duplicate', 'unmapped', 'failed')),
  error_message         TEXT,
  lead_id               UUID REFERENCES public.leads(id) ON DELETE SET NULL,
  received_at           TIMESTAMPTZ NOT NULL DEFAULT now(),
  processed_at          TIMESTAMPTZ
);

CREATE INDEX IF NOT EXISTS idx_event_logs_org ON public.integration_event_logs(org_id, received_at DESC);
CREATE INDEX IF NOT EXISTS idx_event_logs_connection ON public.integration_event_logs(connection_id);

-- Enforce unique external event per connection to block duplicate webhook processing at DB level
CREATE UNIQUE INDEX IF NOT EXISTS uq_event_logs_connection_external_event
  ON public.integration_event_logs(connection_id, external_event_id)
  WHERE connection_id IS NOT NULL AND external_event_id IS NOT NULL;

-- Enable RLS on integration_event_logs
ALTER TABLE public.integration_event_logs ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "org_members_can_read_event_logs" ON public.integration_event_logs;
CREATE POLICY "org_members_can_read_event_logs" ON public.integration_event_logs
  FOR SELECT USING (auth_is_member_of_org(org_id));

DROP POLICY IF EXISTS "managers_can_insert_event_logs" ON public.integration_event_logs;
CREATE POLICY "managers_can_insert_event_logs" ON public.integration_event_logs
  FOR INSERT WITH CHECK (auth_has_role_in_org(org_id, ARRAY['owner', 'admin', 'manager']));

-- 4. Extend public.leads with full source attribution and deduplication readiness
ALTER TABLE public.leads
  ADD COLUMN IF NOT EXISTS source_platform TEXT,
  ADD COLUMN IF NOT EXISTS campaign_name TEXT,
  ADD COLUMN IF NOT EXISTS campaign_id TEXT,
  ADD COLUMN IF NOT EXISTS ad_name TEXT,
  ADD COLUMN IF NOT EXISTS ad_id TEXT,
  ADD COLUMN IF NOT EXISTS form_name TEXT,
  ADD COLUMN IF NOT EXISTS form_id TEXT,
  ADD COLUMN IF NOT EXISTS external_lead_id TEXT,
  ADD COLUMN IF NOT EXISTS source_url TEXT,
  ADD COLUMN IF NOT EXISTS connection_id UUID REFERENCES public.integration_connections(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS source_metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
  ADD COLUMN IF NOT EXISTS idempotency_key TEXT,
  ADD COLUMN IF NOT EXISTS is_duplicate BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS duplicate_of_id UUID REFERENCES public.leads(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_leads_connection ON public.leads(connection_id);
CREATE INDEX IF NOT EXISTS idx_leads_campaign ON public.leads(project_id, campaign_id);

-- Enforce unique idempotency_key per organisation at database level (race-safe webhook replay defense)
CREATE UNIQUE INDEX IF NOT EXISTS uq_leads_org_idempotency_key
  ON public.leads(org_id, idempotency_key)
  WHERE idempotency_key IS NOT NULL;

-- Enforce unique external_lead_id per connection
CREATE UNIQUE INDEX IF NOT EXISTS uq_leads_connection_external_lead_id
  ON public.leads(connection_id, external_lead_id)
  WHERE connection_id IS NOT NULL AND external_lead_id IS NOT NULL;

-- Cross-Tenant Integrity Triggers on leads (Project, Connection, Duplicate & Org Immutability)
CREATE OR REPLACE FUNCTION public.check_lead_tenant_integrity()
RETURNS TRIGGER AS $$
DECLARE
  v_proj_org UUID;
  v_conn_org UUID;
  v_dup_org  UUID;
BEGIN
  -- 1. Enforce lead organisation immutability
  IF TG_OP = 'UPDATE' AND OLD.org_id <> NEW.org_id THEN
    RAISE EXCEPTION 'Lead organisation ownership is immutable (from % to %)', OLD.org_id, NEW.org_id;
  END IF;

  -- 2. Enforce Lead-to-Project Organisation Integrity (null project_id allowed for unmapped leads)
  IF NEW.project_id IS NOT NULL THEN
    SELECT org_id INTO v_proj_org FROM public.projects WHERE id = NEW.project_id;
    IF v_proj_org IS NULL OR v_proj_org <> NEW.org_id THEN
      RAISE EXCEPTION 'Lead project must belong to the same organisation (lead.org_id %, project.org_id %)', NEW.org_id, v_proj_org;
    END IF;
  END IF;

  -- 3. Enforce Lead-to-Connection Organisation Integrity
  IF NEW.connection_id IS NOT NULL THEN
    SELECT org_id INTO v_conn_org FROM public.integration_connections WHERE id = NEW.connection_id;
    IF v_conn_org IS NULL OR v_conn_org <> NEW.org_id THEN
      RAISE EXCEPTION 'Lead connection must belong to the same organisation (lead.org_id %, connection.org_id %)', NEW.org_id, v_conn_org;
    END IF;
  END IF;

  -- 4. Enforce Duplicate Reference Organisation Integrity
  IF NEW.duplicate_of_id IS NOT NULL THEN
    SELECT org_id INTO v_dup_org FROM public.leads WHERE id = NEW.duplicate_of_id;
    IF v_dup_org IS NULL OR v_dup_org <> NEW.org_id THEN
      RAISE EXCEPTION 'Cross-organisation duplicate link rejected: duplicate_of_id must belong to the same organisation (lead.org_id %, duplicate_of.org_id %)', NEW.org_id, v_dup_org;
    END IF;
  END IF;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_check_lead_tenant_integrity ON public.leads;
CREATE TRIGGER trg_check_lead_tenant_integrity
  BEFORE INSERT OR UPDATE OF org_id, project_id, connection_id, duplicate_of_id ON public.leads
  FOR EACH ROW EXECUTE FUNCTION public.check_lead_tenant_integrity();

-- Enforce Organisation Ownership Immutability on projects
CREATE OR REPLACE FUNCTION public.check_project_org_immutable()
RETURNS TRIGGER AS $$
BEGIN
  IF OLD.org_id <> NEW.org_id THEN
    RAISE EXCEPTION 'Project organisation ownership is immutable (from % to %)', OLD.org_id, NEW.org_id;
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_project_org_immutable ON public.projects;
CREATE TRIGGER trg_project_org_immutable
  BEFORE UPDATE OF org_id ON public.projects
  FOR EACH ROW EXECUTE FUNCTION public.check_project_org_immutable();
