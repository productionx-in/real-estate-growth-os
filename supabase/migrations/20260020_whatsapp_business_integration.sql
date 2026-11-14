-- Migration: 20260020_whatsapp_business_integration.sql
-- Stage 4F: WhatsApp Business Cloud API Integration Schema
-- Defines multi-tenant tables for conversations, message history, approved templates, and consent tracking.
-- STAGED DEPLOYMENT ONLY: Do not apply to production directly.

-- 1. WhatsApp Conversations Table
create table if not exists public.whatsapp_conversations (
    id uuid primary key default gen_random_uuid(),
    org_id uuid not null references public.organisations(id) on delete cascade,
    connection_id uuid not null references public.integration_connections(id) on delete cascade,
    lead_id uuid references public.leads(id) on delete set null,
    wa_id text not null,
    phone_number_id text not null,
    status text not null default 'open' check (status in ('open', 'closed', 'paused')),
    is_opted_out boolean not null default false,
    opted_out_at timestamptz,
    last_inbound_at timestamptz,
    created_at timestamptz not null default now(),
    updated_at timestamptz not null default now(),
    constraint uq_whatsapp_conv unique (org_id, connection_id, wa_id)
);

-- 2. WhatsApp Messages Table (Individual Inbound / Outbound History)
create table if not exists public.whatsapp_messages (
    id uuid primary key default gen_random_uuid(),
    org_id uuid not null references public.organisations(id) on delete cascade,
    conversation_id uuid references public.whatsapp_conversations(id) on delete cascade,
    lead_id uuid references public.leads(id) on delete set null,
    wamid text not null,
    direction text not null check (direction in ('inbound', 'outbound')),
    message_type text not null default 'text',
    body text,
    referral_metadata jsonb,
    delivery_status text not null default 'sent' check (delivery_status in ('sent', 'delivered', 'read', 'failed')),
    received_at timestamptz not null default now(),
    created_at timestamptz not null default now(),
    updated_at timestamptz not null default now(),
    constraint uq_whatsapp_messages_org_wamid unique (org_id, wamid)
);

-- 3. WhatsApp Templates Table
create table if not exists public.whatsapp_templates (
    id uuid primary key default gen_random_uuid(),
    org_id uuid not null references public.organisations(id) on delete cascade,
    connection_id uuid not null references public.integration_connections(id) on delete cascade,
    template_name text not null,
    language text not null default 'en',
    category text not null check (category in ('MARKETING', 'UTILITY', 'AUTHENTICATION')),
    status text not null default 'APPROVED',
    components jsonb not null default '[]'::jsonb,
    created_at timestamptz not null default now(),
    updated_at timestamptz not null default now(),
    constraint uq_whatsapp_template unique (org_id, connection_id, template_name, language)
);

-- Indexes for high-performance CRM lookups and deduplication
create index if not exists idx_whatsapp_conversations_org_lead on public.whatsapp_conversations (org_id, lead_id);
create index if not exists idx_whatsapp_conversations_wa_id on public.whatsapp_conversations (org_id, wa_id);
create index if not exists idx_whatsapp_messages_conversation on public.whatsapp_messages (org_id, conversation_id);
create index if not exists idx_whatsapp_messages_wamid on public.whatsapp_messages (org_id, wamid);
create index if not exists idx_whatsapp_templates_connection on public.whatsapp_templates (org_id, connection_id);

-- Enable Row Level Security (RLS) on all WhatsApp tables
alter table public.whatsapp_conversations enable row level security;
alter table public.whatsapp_messages enable row level security;
alter table public.whatsapp_templates enable row level security;

-- Tenant Isolation RLS Policies
create policy "whatsapp_conversations_tenant_isolation" on public.whatsapp_conversations
    for all
    using (
        org_id in (
            select m.org_id from public.organisation_members m
            where m.profile_id = auth.uid()
        )
    )
    with check (
        org_id in (
            select m.org_id from public.organisation_members m
            where m.profile_id = auth.uid()
        )
    );

create policy "whatsapp_messages_tenant_isolation" on public.whatsapp_messages
    for all
    using (
        org_id in (
            select m.org_id from public.organisation_members m
            where m.profile_id = auth.uid()
        )
    )
    with check (
        org_id in (
            select m.org_id from public.organisation_members m
            where m.profile_id = auth.uid()
        )
    );

create policy "whatsapp_templates_tenant_isolation" on public.whatsapp_templates
    for all
    using (
        org_id in (
            select m.org_id from public.organisation_members m
            where m.profile_id = auth.uid()
        )
    )
    with check (
        org_id in (
            select m.org_id from public.organisation_members m
            where m.profile_id = auth.uid()
        )
    );
