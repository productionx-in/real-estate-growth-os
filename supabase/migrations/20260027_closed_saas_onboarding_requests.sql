-- Migration 0027: 20260027_closed_saas_onboarding_requests.sql
-- Production X Closed-SaaS Customer Onboarding Requests Schema & Security Triggers
BEGIN;

DO $$ BEGIN
  CREATE TYPE public.onboarding_request_status AS ENUM (
    'draft',
    'pending_approval',
    'approved',
    'provisioned',
    'rejected'
  );
EXCEPTION WHEN duplicate_object THEN null; END $$;

CREATE TABLE IF NOT EXISTS public.customer_onboarding_requests (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  requested_by UUID NOT NULL REFERENCES auth.users(id) ON DELETE RESTRICT,
  company_name TEXT NOT NULL,
  company_type public.org_type NOT NULL,
  admin_email TEXT NOT NULL,
  admin_name TEXT NOT NULL,
  admin_phone TEXT,
  commercial_notes TEXT,
  
  -- Requested commercial terms (Drafted by Sales Rep)
  requested_plan_code TEXT NOT NULL,
  requested_seats INTEGER NOT NULL CHECK (requested_seats > 0),
  requested_billing_cycle TEXT NOT NULL DEFAULT 'annual' CHECK (requested_billing_cycle IN ('monthly', 'annual', 'multi_year')),
  
  -- Super Admin approved terms (Populated upon approval)
  approved_plan_code TEXT,
  approved_seats INTEGER,
  approved_billing_cycle TEXT,
  
  status public.onboarding_request_status NOT NULL DEFAULT 'draft',
  reviewed_by UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  reviewed_at TIMESTAMPTZ,
  provisioned_org_id UUID REFERENCES public.organisations(id) ON DELETE SET NULL,
  rejection_reason TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_onboarding_requests_status ON public.customer_onboarding_requests(status);
CREATE INDEX IF NOT EXISTS idx_onboarding_requests_requested_by ON public.customer_onboarding_requests(requested_by);

-- Trigger: Enforces strict field immutability and valid state transitions
CREATE OR REPLACE FUNCTION public.enforce_onboarding_request_field_immutability()
RETURNS TRIGGER AS $$
BEGIN
  -- Super Admin has full administrative transition authority
  IF public.auth_is_platform_role(ARRAY['super_admin'::public.platform_role]) THEN
    RETURN NEW;
  END IF;

  -- Sales Rep Checks:
  IF OLD.status != 'draft'::public.onboarding_request_status THEN
    RAISE EXCEPTION 'Permission Denied: Submitted onboarding requests are locked and cannot be modified by sales representatives.';
  END IF;

  -- Prohibit non-super-admins from mutating administrative or approved fields
  IF NEW.reviewed_by IS DISTINCT FROM OLD.reviewed_by OR
     NEW.reviewed_at IS DISTINCT FROM OLD.reviewed_at OR
     NEW.provisioned_org_id IS DISTINCT FROM OLD.provisioned_org_id OR
     NEW.rejection_reason IS DISTINCT FROM OLD.rejection_reason OR
     NEW.requested_by IS DISTINCT FROM OLD.requested_by OR
     NEW.approved_plan_code IS DISTINCT FROM OLD.approved_plan_code OR
     NEW.approved_seats IS DISTINCT FROM OLD.approved_seats OR
     NEW.approved_billing_cycle IS DISTINCT FROM OLD.approved_billing_cycle THEN
    RAISE EXCEPTION 'Security Violation: Unauthorized attempt to mutate administrative onboarding fields.';
  END IF;

  -- Sales Rep allowed transition: draft -> pending_approval
  IF NEW.status NOT IN ('draft'::public.onboarding_request_status, 'pending_approval'::public.onboarding_request_status) THEN
    RAISE EXCEPTION 'Permission Denied: Sales representatives can only transition status to pending_approval.';
  END IF;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public, pg_temp;

REVOKE ALL ON FUNCTION public.enforce_onboarding_request_field_immutability() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.enforce_onboarding_request_field_immutability() TO authenticated, service_role;

DROP TRIGGER IF EXISTS trg_protect_onboarding_fields ON public.customer_onboarding_requests;
CREATE TRIGGER trg_protect_onboarding_fields
  BEFORE UPDATE ON public.customer_onboarding_requests
  FOR EACH ROW EXECUTE FUNCTION public.enforce_onboarding_request_field_immutability();

ALTER TABLE public.customer_onboarding_requests ENABLE ROW LEVEL SECURITY;

CREATE POLICY "sales_reps_read_own_requests" ON public.customer_onboarding_requests
  FOR SELECT USING (requested_by = auth.uid());

CREATE POLICY "sales_reps_create_draft_requests" ON public.customer_onboarding_requests
  FOR INSERT WITH CHECK (
    requested_by = auth.uid() AND
    status = 'draft'::public.onboarding_request_status
  );

CREATE POLICY "sales_reps_update_draft_requests" ON public.customer_onboarding_requests
  FOR UPDATE USING (
    requested_by = auth.uid() AND
    status = 'draft'::public.onboarding_request_status
  ) WITH CHECK (
    requested_by = auth.uid() AND
    status IN ('draft'::public.onboarding_request_status, 'pending_approval'::public.onboarding_request_status)
  );

CREATE POLICY "super_admins_manage_all_requests" ON public.customer_onboarding_requests
  FOR ALL USING (public.auth_is_platform_role(ARRAY['super_admin'::public.platform_role]));

COMMIT;
