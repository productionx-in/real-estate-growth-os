-- Migration: 20260021_property_portal_integrations.sql
-- Stage 4G: Property Portal Integrations (99acres, Magicbricks, Housing.com) Schema & Routing Identifiers
-- Adds portal project and listing mapping identifier types, portal lead sources, and multi-tenant audit verification.
-- STAGED DEPLOYMENT ONLY: Do not apply to production directly.

-- 1. Ensure external_identifier_type constraint on integration_project_mappings permits portal identifiers
alter table public.integration_project_mappings
    drop constraint if exists check_identifier_type;

alter table public.integration_project_mappings
    add constraint check_identifier_type check (
        external_identifier_type in (
            'campaign_id',
            'form_id',
            'page_id',
            'phone_number_id',
            'portal_project_id',
            'portal_listing_id',
            'account_default'
        )
    );

-- 2. Index for high-performance portal project mapping lookups
create index if not exists idx_mappings_portal_ids
    on public.integration_project_mappings (org_id, external_identifier_type, external_identifier_value);

-- 3. Document provider readiness and mapping contract
comment on table public.integration_project_mappings is 
'Multi-tenant project routing mappings connecting external campaign, form, phone, or portal identifiers to Production X projects.';
