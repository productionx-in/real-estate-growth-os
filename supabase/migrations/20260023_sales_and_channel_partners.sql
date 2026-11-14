-- Migration 20260023_sales_and_channel_partners.sql
-- Stage 5: Sales & Channel Partner Operations
-- Tables: site_visits, inventory_blockings, bookings, channel_partners, channel_partner_commissions, deals

-- 1. Site Visits
CREATE TABLE IF NOT EXISTS public.site_visits (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id UUID NOT NULL REFERENCES public.organisations(id) ON DELETE CASCADE,
  project_id UUID NOT NULL REFERENCES public.projects(id) ON DELETE CASCADE,
  lead_id UUID NOT NULL REFERENCES public.leads(id) ON DELETE CASCADE,
  assigned_to UUID REFERENCES public.profiles(id) ON DELETE SET NULL,
  scheduled_at TIMESTAMPTZ NOT NULL,
  status TEXT NOT NULL DEFAULT 'scheduled' CHECK (status IN ('scheduled', 'rescheduled', 'checked_in', 'completed', 'cancelled', 'no_show')),
  outcome TEXT CHECK (outcome IS NULL OR outcome IN ('interested', 'negotiation', 'uninterested', 'booked', 'follow_up_needed')),
  notes TEXT,
  rating INTEGER CHECK (rating IS NULL OR (rating >= 1 AND rating <= 5)),
  visitor_count INTEGER NOT NULL DEFAULT 1,
  cab_required BOOLEAN NOT NULL DEFAULT false,
  cab_details JSONB DEFAULT '{}'::jsonb,
  checked_in_at TIMESTAMPTZ,
  completed_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc'::text, now()),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc'::text, now())
);

CREATE INDEX IF NOT EXISTS idx_site_visits_org ON public.site_visits(org_id);
CREATE INDEX IF NOT EXISTS idx_site_visits_project ON public.site_visits(project_id);
CREATE INDEX IF NOT EXISTS idx_site_visits_lead ON public.site_visits(lead_id);
CREATE INDEX IF NOT EXISTS idx_site_visits_scheduled ON public.site_visits(scheduled_at);

-- 2. Channel Partners (Brokers & Agencies)
CREATE TABLE IF NOT EXISTS public.channel_partners (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id UUID NOT NULL REFERENCES public.organisations(id) ON DELETE CASCADE,
  firm_name TEXT NOT NULL,
  rera_registration_number TEXT,
  contact_person TEXT NOT NULL,
  phone TEXT NOT NULL,
  email TEXT,
  pan_number TEXT,
  gst_number TEXT,
  tier TEXT NOT NULL DEFAULT 'silver' CHECK (tier IN ('silver', 'gold', 'platinum')),
  status TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'suspended', 'pending_approval')),
  default_commission_rate NUMERIC(5, 2) NOT NULL DEFAULT 2.00,
  bank_details JSONB DEFAULT '{}'::jsonb,
  notes TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc'::text, now()),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc'::text, now())
);

CREATE INDEX IF NOT EXISTS idx_channel_partners_org ON public.channel_partners(org_id);
CREATE INDEX IF NOT EXISTS idx_channel_partners_rera ON public.channel_partners(rera_registration_number);

-- 3. Inventory Blockings (Temporary Hold)
CREATE TABLE IF NOT EXISTS public.inventory_blockings (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id UUID NOT NULL REFERENCES public.organisations(id) ON DELETE CASCADE,
  project_id UUID NOT NULL REFERENCES public.projects(id) ON DELETE CASCADE,
  inventory_id UUID NOT NULL REFERENCES public.inventory_items(id) ON DELETE CASCADE,
  lead_id UUID NOT NULL REFERENCES public.leads(id) ON DELETE CASCADE,
  blocked_by UUID REFERENCES public.profiles(id) ON DELETE SET NULL,
  status TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'expired', 'converted_to_booking', 'cancelled')),
  token_amount NUMERIC(15, 2) NOT NULL DEFAULT 0.00,
  payment_reference TEXT,
  expires_at TIMESTAMPTZ NOT NULL,
  remarks TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc'::text, now()),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc'::text, now())
);

CREATE INDEX IF NOT EXISTS idx_inventory_blockings_org ON public.inventory_blockings(org_id);
CREATE INDEX IF NOT EXISTS idx_inventory_blockings_unit ON public.inventory_blockings(inventory_id);
CREATE INDEX IF NOT EXISTS idx_inventory_blockings_status ON public.inventory_blockings(status);

-- 4. Bookings (Confirmed Sales)
CREATE TABLE IF NOT EXISTS public.bookings (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id UUID NOT NULL REFERENCES public.organisations(id) ON DELETE CASCADE,
  project_id UUID NOT NULL REFERENCES public.projects(id) ON DELETE CASCADE,
  inventory_id UUID NOT NULL REFERENCES public.inventory_items(id) ON DELETE RESTRICT,
  lead_id UUID NOT NULL REFERENCES public.leads(id) ON DELETE RESTRICT,
  blocking_id UUID REFERENCES public.inventory_blockings(id) ON DELETE SET NULL,
  channel_partner_id UUID REFERENCES public.channel_partners(id) ON DELETE SET NULL,
  booking_number TEXT NOT NULL,
  booking_date DATE NOT NULL DEFAULT CURRENT_DATE,
  status TEXT NOT NULL DEFAULT 'confirmed' CHECK (status IN ('draft', 'confirmed', 'agreement_signed', 'registered', 'cancelled')),
  base_price NUMERIC(15, 2) NOT NULL,
  additional_charges NUMERIC(15, 2) NOT NULL DEFAULT 0.00,
  total_amount NUMERIC(15, 2) NOT NULL,
  booking_amount_received NUMERIC(15, 2) NOT NULL DEFAULT 0.00,
  payment_plan TEXT NOT NULL DEFAULT 'construction_linked' CHECK (payment_plan IN ('construction_linked', 'time_linked', 'down_payment', 'custom')),
  documents JSONB DEFAULT '[]'::jsonb,
  remarks TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc'::text, now()),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc'::text, now()),
  CONSTRAINT uq_bookings_org_number UNIQUE (org_id, booking_number)
);

CREATE INDEX IF NOT EXISTS idx_bookings_org ON public.bookings(org_id);
CREATE INDEX IF NOT EXISTS idx_bookings_project ON public.bookings(project_id);
CREATE INDEX IF NOT EXISTS idx_bookings_inventory ON public.bookings(inventory_id);
CREATE INDEX IF NOT EXISTS idx_bookings_lead ON public.bookings(lead_id);
CREATE INDEX IF NOT EXISTS idx_bookings_cp ON public.bookings(channel_partner_id);

-- 5. Channel Partner Commissions
CREATE TABLE IF NOT EXISTS public.channel_partner_commissions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id UUID NOT NULL REFERENCES public.organisations(id) ON DELETE CASCADE,
  booking_id UUID NOT NULL REFERENCES public.bookings(id) ON DELETE CASCADE,
  channel_partner_id UUID NOT NULL REFERENCES public.channel_partners(id) ON DELETE CASCADE,
  commission_type TEXT NOT NULL DEFAULT 'percentage' CHECK (commission_type IN ('percentage', 'fixed_per_sqft', 'lump_sum')),
  commission_rate NUMERIC(8, 2) NOT NULL,
  gross_commission_amount NUMERIC(15, 2) NOT NULL,
  tds_percentage NUMERIC(5, 2) NOT NULL DEFAULT 5.00,
  net_commission_amount NUMERIC(15, 2) NOT NULL,
  status TEXT NOT NULL DEFAULT 'pending_approval' CHECK (status IN ('pending_approval', 'approved', 'partially_paid', 'paid', 'cancelled')),
  milestones JSONB DEFAULT '[]'::jsonb,
  paid_amount NUMERIC(15, 2) NOT NULL DEFAULT 0.00,
  payment_notes TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc'::text, now()),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc'::text, now())
);

CREATE INDEX IF NOT EXISTS idx_cp_commissions_org ON public.channel_partner_commissions(org_id);
CREATE INDEX IF NOT EXISTS idx_cp_commissions_booking ON public.channel_partner_commissions(booking_id);
CREATE INDEX IF NOT EXISTS idx_cp_commissions_cp ON public.channel_partner_commissions(channel_partner_id);

-- 6. Sales Deals Pipeline
CREATE TABLE IF NOT EXISTS public.deals (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id UUID NOT NULL REFERENCES public.organisations(id) ON DELETE CASCADE,
  project_id UUID NOT NULL REFERENCES public.projects(id) ON DELETE CASCADE,
  lead_id UUID NOT NULL REFERENCES public.leads(id) ON DELETE CASCADE,
  inventory_id UUID REFERENCES public.inventory_items(id) ON DELETE SET NULL,
  channel_partner_id UUID REFERENCES public.channel_partners(id) ON DELETE SET NULL,
  assigned_to UUID REFERENCES public.profiles(id) ON DELETE SET NULL,
  stage TEXT NOT NULL DEFAULT 'enquiry' CHECK (stage IN (
    'enquiry', 'contacted', 'site_visit_scheduled', 'site_visit_completed',
    'negotiation', 'unit_blocked', 'booked', 'registered', 'lost'
  )),
  deal_value NUMERIC(15, 2),
  probability INTEGER NOT NULL DEFAULT 20 CHECK (probability >= 0 AND probability <= 100),
  expected_close_date DATE,
  loss_reason TEXT,
  notes TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc'::text, now()),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc'::text, now())
);

CREATE INDEX IF NOT EXISTS idx_deals_org ON public.deals(org_id);
CREATE INDEX IF NOT EXISTS idx_deals_project ON public.deals(project_id);
CREATE INDEX IF NOT EXISTS idx_deals_stage ON public.deals(stage);

-- Enable RLS on all Stage 5 tables
ALTER TABLE public.site_visits ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.channel_partners ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.inventory_blockings ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.bookings ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.channel_partner_commissions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.deals ENABLE ROW LEVEL SECURITY;

-- Scoped Tenant Isolation Policies
CREATE POLICY "site_visits_tenant_isolation" ON public.site_visits
  USING (org_id IN (SELECT org_id FROM public.org_members WHERE profile_id = auth.uid()));

CREATE POLICY "channel_partners_tenant_isolation" ON public.channel_partners
  USING (org_id IN (SELECT org_id FROM public.org_members WHERE profile_id = auth.uid()));

CREATE POLICY "inventory_blockings_tenant_isolation" ON public.inventory_blockings
  USING (org_id IN (SELECT org_id FROM public.org_members WHERE profile_id = auth.uid()));

CREATE POLICY "bookings_tenant_isolation" ON public.bookings
  USING (org_id IN (SELECT org_id FROM public.org_members WHERE profile_id = auth.uid()));

CREATE POLICY "channel_partner_commissions_tenant_isolation" ON public.channel_partner_commissions
  USING (org_id IN (SELECT org_id FROM public.org_members WHERE profile_id = auth.uid()));

CREATE POLICY "deals_tenant_isolation" ON public.deals
  USING (org_id IN (SELECT org_id FROM public.org_members WHERE profile_id = auth.uid()));
