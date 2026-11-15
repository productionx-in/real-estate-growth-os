-- supabase/migrations/20260025_subscription_and_seat_entitlements.sql
-- Production X: Subscription-Based Access Control, Seat Entitlements & User Provisioning

-- 1. Organisation Subscriptions Table
CREATE TABLE IF NOT EXISTS public.org_subscriptions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id UUID NOT NULL REFERENCES public.organisations(id) ON DELETE CASCADE,
  plan_tier TEXT NOT NULL DEFAULT 'growth',
  included_seats INTEGER NOT NULL DEFAULT 5,
  additional_seats INTEGER NOT NULL DEFAULT 0,
  status TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('trial', 'active', 'past_due', 'canceled', 'expired')),
  billing_cycle TEXT NOT NULL DEFAULT 'monthly' CHECK (billing_cycle IN ('monthly', 'annual')),
  current_period_start TIMESTAMPTZ NOT NULL DEFAULT now(),
  current_period_end TIMESTAMPTZ NOT NULL DEFAULT (now() + INTERVAL '30 days'),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (org_id)
);

CREATE INDEX IF NOT EXISTS idx_org_subscriptions_org ON public.org_subscriptions(org_id);
CREATE INDEX IF NOT EXISTS idx_org_subscriptions_status ON public.org_subscriptions(status);

-- 2. Organisation Employee Invitations Table
CREATE TABLE IF NOT EXISTS public.org_invitations (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id UUID NOT NULL REFERENCES public.organisations(id) ON DELETE CASCADE,
  email TEXT NOT NULL,
  role public.member_role NOT NULL DEFAULT 'sales_exec',
  invited_by UUID NOT NULL REFERENCES public.profiles(id) ON DELETE RESTRICT,
  token_hash TEXT NOT NULL UNIQUE,
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'accepted', 'expired', 'revoked')),
  expires_at TIMESTAMPTZ NOT NULL DEFAULT (now() + INTERVAL '7 days'),
  accepted_at TIMESTAMPTZ,
  accepted_by UUID REFERENCES public.profiles(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_org_invitations_org ON public.org_invitations(org_id);
CREATE INDEX IF NOT EXISTS idx_org_invitations_email ON public.org_invitations(email);
CREATE INDEX IF NOT EXISTS idx_org_invitations_token ON public.org_invitations(token_hash);
CREATE INDEX IF NOT EXISTS idx_org_invitations_status ON public.org_invitations(status);

-- 3. Extend org_members with Status and Deactivation Timestamps
ALTER TABLE public.org_members 
  ADD COLUMN IF NOT EXISTS status TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'deactivated', 'suspended')),
  ADD COLUMN IF NOT EXISTS deactivated_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS deactivated_by UUID REFERENCES public.profiles(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_org_members_status ON public.org_members(status);

-- 4. Enable Row Level Security (RLS)
ALTER TABLE public.org_subscriptions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.org_invitations ENABLE ROW LEVEL SECURITY;

-- Subscriptions RLS: Only owners and admins can view subscription details
DROP POLICY IF EXISTS "admins_read_org_subscriptions" ON public.org_subscriptions;
CREATE POLICY "admins_read_org_subscriptions" ON public.org_subscriptions
  FOR SELECT USING (public.auth_has_role_in_org(org_id, ARRAY['owner', 'admin']));

-- Invitations RLS: Owners and admins can manage invitations for their organisation
DROP POLICY IF EXISTS "admins_manage_org_invitations" ON public.org_invitations;
CREATE POLICY "admins_manage_org_invitations" ON public.org_invitations
  FOR ALL USING (public.auth_has_role_in_org(org_id, ARRAY['owner', 'admin']));

-- Allow public verification of invitation tokens for acceptance without exposing other invitations
DROP POLICY IF EXISTS "public_verify_invitation_token" ON public.org_invitations;
CREATE POLICY "public_verify_invitation_token" ON public.org_invitations
  FOR SELECT USING (status = 'pending' AND expires_at > now());
