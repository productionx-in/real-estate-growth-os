-- Migration: 20260022_integration_apis_and_webhooks.sql
-- Stage 4H: Integration APIs & Customer Outbound Webhooks Schema
-- Adds developer API key management, webhook subscriptions, and delivery audit logs.
-- STAGED DEPLOYMENT ONLY: Do not apply to production directly.

-- 1. Developer API Keys Table
create table if not exists public.developer_api_keys (
    id uuid primary key default gen_random_uuid(),
    org_id uuid not null references public.organisations(id) on delete cascade,
    name text not null,
    key_hash text not null unique,
    key_prefix text not null,
    permissions text[] not null default array['*'],
    is_active boolean not null default true,
    last_used_at timestamptz,
    expires_at timestamptz,
    created_at timestamptz not null default now(),
    updated_at timestamptz not null default now()
);

-- 2. Webhook Subscriptions Table
create table if not exists public.webhook_subscriptions (
    id uuid primary key default gen_random_uuid(),
    org_id uuid not null references public.organisations(id) on delete cascade,
    url text not null,
    event_types text[] not null default array['lead.created'],
    secret_ref text, -- vault://aes256gcm:...
    is_active boolean not null default true,
    description text,
    created_at timestamptz not null default now(),
    updated_at timestamptz not null default now()
);

-- 3. Webhook Delivery Logs Table
create table if not exists public.webhook_delivery_logs (
    id uuid primary key default gen_random_uuid(),
    org_id uuid not null references public.organisations(id) on delete cascade,
    subscription_id uuid references public.webhook_subscriptions(id) on delete cascade,
    event_type text not null,
    payload jsonb not null,
    response_status integer,
    response_body text,
    attempt integer not null default 1,
    success boolean not null default false,
    error_message text,
    created_at timestamptz not null default now()
);

-- Indexes for performance
create index if not exists idx_dev_api_keys_org on public.developer_api_keys (org_id);
create index if not exists idx_dev_api_keys_hash on public.developer_api_keys (key_hash);
create index if not exists idx_webhook_subs_org on public.webhook_subscriptions (org_id, is_active);
create index if not exists idx_webhook_logs_sub on public.webhook_delivery_logs (subscription_id, created_at desc);

-- Enable Row Level Security
alter table public.developer_api_keys enable row level security;
alter table public.webhook_subscriptions enable row level security;
alter table public.webhook_delivery_logs enable row level security;

-- Tenant Isolation RLS Policies
create policy "developer_api_keys_tenant_isolation" on public.developer_api_keys
    for all
    using (
        org_id in (
            select m.org_id from public.org_members m
            where m.profile_id = auth.uid()
        )
    )
    with check (
        org_id in (
            select m.org_id from public.org_members m
            where m.profile_id = auth.uid()
        )
    );

create policy "webhook_subscriptions_tenant_isolation" on public.webhook_subscriptions
    for all
    using (
        org_id in (
            select m.org_id from public.org_members m
            where m.profile_id = auth.uid()
        )
    )
    with check (
        org_id in (
            select m.org_id from public.org_members m
            where m.profile_id = auth.uid()
        )
    );

create policy "webhook_delivery_logs_tenant_isolation" on public.webhook_delivery_logs
    for all
    using (
        org_id in (
            select m.org_id from public.org_members m
            where m.profile_id = auth.uid()
        )
    )
    with check (
        org_id in (
            select m.org_id from public.org_members m
            where m.profile_id = auth.uid()
        )
    );
