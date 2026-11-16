-- supabase/migrations/20260034_buyer_portfolio_and_payment_schedule.sql
-- Migration 0034: Buyer 360, Customer Portfolio, Payment Schedule & KYC Document Management
-- Enterprise Real Estate Developer Growth OS — Phase 2

-- ============================================================================
-- 1. BUYER PROFILES TABLE
-- ============================================================================

CREATE TABLE IF NOT EXISTS public.buyer_profiles (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id UUID NOT NULL REFERENCES public.organisations(id) ON DELETE CASCADE,
  primary_lead_id UUID REFERENCES public.leads(id) ON DELETE SET NULL,
  full_name TEXT NOT NULL,
  email TEXT,
  phone TEXT NOT NULL,
  alternate_phone TEXT,
  pan_number TEXT,
  aadhaar_number_masked TEXT,
  address_line1 TEXT,
  address_line2 TEXT,
  city TEXT,
  state TEXT,
  pincode TEXT,
  country TEXT NOT NULL DEFAULT 'India',
  co_buyers JSONB NOT NULL DEFAULT '[]'::jsonb,
  notes TEXT,
  status TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'inactive', 'archived')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc'::text, now()),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc'::text, now()),
  CONSTRAINT uq_buyer_org_phone UNIQUE (org_id, phone)
);

CREATE INDEX IF NOT EXISTS idx_buyer_profiles_org ON public.buyer_profiles(org_id);
CREATE INDEX IF NOT EXISTS idx_buyer_profiles_phone ON public.buyer_profiles(phone);
CREATE INDEX IF NOT EXISTS idx_buyer_profiles_pan ON public.buyer_profiles(pan_number);
CREATE INDEX IF NOT EXISTS idx_buyer_profiles_primary_lead ON public.buyer_profiles(primary_lead_id);

CREATE TRIGGER buyer_profiles_updated_at
  BEFORE UPDATE ON public.buyer_profiles
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- ============================================================================
-- 2. LINK EXISTING TABLES TO BUYER PROFILES
-- ============================================================================

-- Add buyer_id to leads
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_name = 'leads' AND column_name = 'buyer_id'
  ) THEN
    ALTER TABLE public.leads
      ADD COLUMN buyer_id UUID REFERENCES public.buyer_profiles(id) ON DELETE SET NULL;
    CREATE INDEX IF NOT EXISTS idx_leads_buyer ON public.leads(buyer_id);
  END IF;
END $$;

-- Add buyer_id to bookings
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_name = 'bookings' AND column_name = 'buyer_id'
  ) THEN
    ALTER TABLE public.bookings
      ADD COLUMN buyer_id UUID REFERENCES public.buyer_profiles(id) ON DELETE RESTRICT;
    CREATE INDEX IF NOT EXISTS idx_bookings_buyer ON public.bookings(buyer_id);
  END IF;
END $$;

-- Backfill buyer profiles from existing bookings if any exist
DO $$
DECLARE
  b_rec RECORD;
  v_lead_rec RECORD;
  v_buyer_id UUID;
BEGIN
  FOR b_rec IN SELECT id, org_id, lead_id FROM public.bookings WHERE buyer_id IS NULL LOOP
    SELECT id, name, phone, email INTO v_lead_rec FROM public.leads WHERE id = b_rec.lead_id;
    IF FOUND THEN
      -- Find or create buyer profile
      SELECT id INTO v_buyer_id FROM public.buyer_profiles WHERE org_id = b_rec.org_id AND phone = v_lead_rec.phone;
      IF v_buyer_id IS NULL THEN
        INSERT INTO public.buyer_profiles (org_id, primary_lead_id, full_name, phone, email)
        VALUES (b_rec.org_id, v_lead_rec.id, v_lead_rec.name, v_lead_rec.phone, v_lead_rec.email)
        RETURNING id INTO v_buyer_id;
      END IF;

      UPDATE public.bookings SET buyer_id = v_buyer_id WHERE id = b_rec.id;
      UPDATE public.leads SET buyer_id = v_buyer_id WHERE id = v_lead_rec.id AND buyer_id IS NULL;
    END IF;
  END LOOP;
END $$;

-- ============================================================================
-- 3. BOOKING PAYMENT MILESTONES (Payment Schedule)
-- ============================================================================

CREATE TABLE IF NOT EXISTS public.booking_payment_milestones (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id UUID NOT NULL REFERENCES public.organisations(id) ON DELETE CASCADE,
  booking_id UUID NOT NULL REFERENCES public.bookings(id) ON DELETE CASCADE,
  milestone_name TEXT NOT NULL,
  milestone_sequence INT NOT NULL DEFAULT 1,
  due_date DATE NOT NULL,
  amount_due NUMERIC(15, 2) NOT NULL CHECK (amount_due > 0),
  amount_paid NUMERIC(15, 2) NOT NULL DEFAULT 0.00 CHECK (amount_paid >= 0),
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'due', 'partially_paid', 'paid', 'overdue', 'waived')),
  demand_letter_issued BOOLEAN NOT NULL DEFAULT false,
  demand_letter_issued_at TIMESTAMPTZ,
  demand_letter_reference TEXT,
  payment_records JSONB NOT NULL DEFAULT '[]'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc'::text, now()),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc'::text, now())
);

CREATE INDEX IF NOT EXISTS idx_booking_milestones_org ON public.booking_payment_milestones(org_id);
CREATE INDEX IF NOT EXISTS idx_booking_milestones_booking ON public.booking_payment_milestones(booking_id);
CREATE INDEX IF NOT EXISTS idx_booking_milestones_status ON public.booking_payment_milestones(status);
CREATE INDEX IF NOT EXISTS idx_booking_milestones_due ON public.booking_payment_milestones(due_date);

CREATE TRIGGER booking_payment_milestones_updated_at
  BEFORE UPDATE ON public.booking_payment_milestones
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- ============================================================================
-- 4. BOOKING PAYMENTS & RECEIPTS
-- ============================================================================

CREATE TABLE IF NOT EXISTS public.booking_payments (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id UUID NOT NULL REFERENCES public.organisations(id) ON DELETE CASCADE,
  booking_id UUID NOT NULL REFERENCES public.bookings(id) ON DELETE RESTRICT,
  milestone_id UUID REFERENCES public.booking_payment_milestones(id) ON DELETE SET NULL,
  receipt_number TEXT NOT NULL,
  amount NUMERIC(15, 2) NOT NULL CHECK (amount > 0),
  payment_method TEXT NOT NULL CHECK (payment_method IN (
    'bank_transfer_neft_rtgs', 'cheque', 'upi', 'demand_draft', 'credit_card', 'cash'
  )),
  payment_date DATE NOT NULL DEFAULT CURRENT_DATE,
  reference_number TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'unverified' CHECK (status IN ('unverified', 'verified', 'rejected', 'bounced')),
  verified_at TIMESTAMPTZ,
  verified_by UUID REFERENCES public.profiles(id) ON DELETE SET NULL,
  rejection_reason TEXT,
  receipt_url TEXT,
  notes TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc'::text, now()),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc'::text, now()),
  CONSTRAINT uq_payment_org_receipt UNIQUE (org_id, receipt_number),
  CONSTRAINT uq_payment_org_reference UNIQUE (org_id, reference_number)
);

CREATE INDEX IF NOT EXISTS idx_booking_payments_org ON public.booking_payments(org_id);
CREATE INDEX IF NOT EXISTS idx_booking_payments_booking ON public.booking_payments(booking_id);
CREATE INDEX IF NOT EXISTS idx_booking_payments_milestone ON public.booking_payments(milestone_id);
CREATE INDEX IF NOT EXISTS idx_booking_payments_status ON public.booking_payments(status);
CREATE INDEX IF NOT EXISTS idx_booking_payments_ref ON public.booking_payments(org_id, reference_number);

CREATE TRIGGER booking_payments_updated_at
  BEFORE UPDATE ON public.booking_payments
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- ============================================================================
-- 5. BUYER KYC & TRANSACTION DOCUMENTS
-- ============================================================================

CREATE TABLE IF NOT EXISTS public.buyer_documents (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id UUID NOT NULL REFERENCES public.organisations(id) ON DELETE CASCADE,
  buyer_id UUID NOT NULL REFERENCES public.buyer_profiles(id) ON DELETE CASCADE,
  booking_id UUID REFERENCES public.bookings(id) ON DELETE SET NULL,
  document_type TEXT NOT NULL CHECK (document_type IN (
    'pan_card', 'aadhaar_card', 'passport', 'voter_id', 'address_proof',
    'sale_agreement', 'allotment_letter', 'payment_receipt', 'noc', 'other'
  )),
  title TEXT NOT NULL,
  file_key TEXT NOT NULL,
  file_name TEXT NOT NULL,
  file_size_bytes BIGINT,
  mime_type TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'verified', 'rejected', 'expired')),
  verification_notes TEXT,
  verified_at TIMESTAMPTZ,
  verified_by UUID REFERENCES public.profiles(id) ON DELETE SET NULL,
  created_by UUID NOT NULL REFERENCES public.profiles(id) ON DELETE RESTRICT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc'::text, now()),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc'::text, now())
);

CREATE INDEX IF NOT EXISTS idx_buyer_documents_org ON public.buyer_documents(org_id);
CREATE INDEX IF NOT EXISTS idx_buyer_documents_buyer ON public.buyer_documents(buyer_id);
CREATE INDEX IF NOT EXISTS idx_buyer_documents_booking ON public.buyer_documents(booking_id);
CREATE INDEX IF NOT EXISTS idx_buyer_documents_status ON public.buyer_documents(status);

CREATE TRIGGER buyer_documents_updated_at
  BEFORE UPDATE ON public.buyer_documents
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- ============================================================================
-- 6. BUYER AUDIT LOGS (Immutable Activity Log)
-- ============================================================================

CREATE TABLE IF NOT EXISTS public.buyer_audit_logs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id UUID NOT NULL REFERENCES public.organisations(id) ON DELETE CASCADE,
  buyer_id UUID NOT NULL REFERENCES public.buyer_profiles(id) ON DELETE CASCADE,
  actor_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE RESTRICT,
  action TEXT NOT NULL,
  details JSONB NOT NULL DEFAULT '{}'::jsonb,
  ip_address TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc'::text, now())
);

CREATE INDEX IF NOT EXISTS idx_buyer_audit_org ON public.buyer_audit_logs(org_id);
CREATE INDEX IF NOT EXISTS idx_buyer_audit_buyer ON public.buyer_audit_logs(buyer_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_buyer_audit_actor ON public.buyer_audit_logs(actor_id);

-- ============================================================================
-- 7. ATOMIC BUSINESS LOGIC FUNCTIONS (SECURITY DEFINER)
-- ============================================================================

-- Function 1: Upsert Buyer Profile Atomically
CREATE OR REPLACE FUNCTION public.upsert_buyer_profile_atomic(
  p_org_id UUID,
  p_full_name TEXT,
  p_phone TEXT,
  p_email TEXT DEFAULT NULL,
  p_pan_number TEXT DEFAULT NULL,
  p_aadhaar_number_masked TEXT DEFAULT NULL,
  p_address_line1 TEXT DEFAULT NULL,
  p_address_line2 TEXT DEFAULT NULL,
  p_city TEXT DEFAULT NULL,
  p_state TEXT DEFAULT NULL,
  p_pincode TEXT DEFAULT NULL,
  p_co_buyers JSONB DEFAULT '[]'::jsonb,
  p_notes TEXT DEFAULT NULL,
  p_lead_id UUID DEFAULT NULL,
  p_actor_id UUID DEFAULT NULL
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_buyer_id UUID;
  v_is_new BOOLEAN := false;
  v_result JSONB;
BEGIN
  IF p_full_name IS NULL OR length(trim(p_full_name)) = 0 THEN
    RAISE EXCEPTION 'Full name is mandatory for buyer profile';
  END IF;

  IF p_phone IS NULL OR length(trim(p_phone)) = 0 THEN
    RAISE EXCEPTION 'Phone number is mandatory for buyer profile';
  END IF;

  -- Check existing buyer profile by phone
  SELECT id INTO v_buyer_id
  FROM public.buyer_profiles
  WHERE org_id = p_org_id AND phone = p_phone
  FOR UPDATE;

  IF v_buyer_id IS NULL THEN
    v_is_new := true;
    INSERT INTO public.buyer_profiles (
      org_id,
      primary_lead_id,
      full_name,
      phone,
      email,
      pan_number,
      aadhaar_number_masked,
      address_line1,
      address_line2,
      city,
      state,
      pincode,
      co_buyers,
      notes
    ) VALUES (
      p_org_id,
      p_lead_id,
      trim(p_full_name),
      trim(p_phone),
      trim(p_email),
      UPPER(trim(p_pan_number)),
      trim(p_aadhaar_number_masked),
      p_address_line1,
      p_address_line2,
      p_city,
      p_state,
      p_pincode,
      COALESCE(p_co_buyers, '[]'::jsonb),
      p_notes
    )
    RETURNING id INTO v_buyer_id;
  ELSE
    UPDATE public.buyer_profiles
    SET
      full_name = trim(p_full_name),
      email = COALESCE(trim(p_email), email),
      pan_number = COALESCE(UPPER(trim(p_pan_number)), pan_number),
      aadhaar_number_masked = COALESCE(trim(p_aadhaar_number_masked), aadhaar_number_masked),
      address_line1 = COALESCE(p_address_line1, address_line1),
      address_line2 = COALESCE(p_address_line2, address_line2),
      city = COALESCE(p_city, city),
      state = COALESCE(p_state, state),
      pincode = COALESCE(p_pincode, pincode),
      co_buyers = COALESCE(p_co_buyers, co_buyers),
      notes = COALESCE(p_notes, notes),
      updated_at = timezone('utc'::text, now())
    WHERE id = v_buyer_id;
  END IF;

  -- Link lead if provided
  IF p_lead_id IS NOT NULL THEN
    UPDATE public.leads
    SET buyer_id = v_buyer_id
    WHERE id = p_lead_id AND org_id = p_org_id;
  END IF;

  -- Audit log
  IF p_actor_id IS NOT NULL THEN
    INSERT INTO public.buyer_audit_logs (
      org_id,
      buyer_id,
      actor_id,
      action,
      details
    ) VALUES (
      p_org_id,
      v_buyer_id,
      p_actor_id,
      CASE WHEN v_is_new THEN 'buyer_created' ELSE 'buyer_updated' END,
      json_build_object(
        'name', p_full_name,
        'phone', p_phone,
        'pan', p_pan_number,
        'lead_id', p_lead_id
      )::jsonb
    );
  END IF;

  SELECT to_jsonb(bp.*) INTO v_result
  FROM public.buyer_profiles bp
  WHERE bp.id = v_buyer_id;

  RETURN v_result;
END;
$$;

-- Function 2: Record Booking Payment Atomically
CREATE OR REPLACE FUNCTION public.record_booking_payment_atomic(
  p_org_id UUID,
  p_booking_id UUID,
  p_milestone_id UUID,
  p_amount NUMERIC(15, 2),
  p_payment_method TEXT,
  p_reference_number TEXT,
  p_actor_id UUID,
  p_payment_date DATE DEFAULT CURRENT_DATE,
  p_notes TEXT DEFAULT NULL
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_booking_rec RECORD;
  v_milestone_rec RECORD;
  v_payment_id UUID;
  v_receipt_number TEXT;
  v_result JSONB;
BEGIN
  IF p_amount <= 0 THEN
    RAISE EXCEPTION 'Payment amount must be greater than zero';
  END IF;

  IF p_reference_number IS NULL OR length(trim(p_reference_number)) = 0 THEN
    RAISE EXCEPTION 'Payment reference number (UTR / Cheque) is required';
  END IF;

  -- Verify booking belongs to org and lock row
  SELECT b.id, b.org_id, b.buyer_id, b.total_amount, b.booking_amount_received
  INTO v_booking_rec
  FROM public.bookings b
  WHERE b.id = p_booking_id AND b.org_id = p_org_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Booking % not found in organisation %', p_booking_id, p_org_id;
  END IF;

  -- Check if milestone belongs to this booking
  IF p_milestone_id IS NOT NULL THEN
    SELECT m.id, m.amount_due, m.amount_paid, m.status
    INTO v_milestone_rec
    FROM public.booking_payment_milestones m
    WHERE m.id = p_milestone_id AND m.booking_id = p_booking_id AND m.org_id = p_org_id
    FOR UPDATE;

    IF NOT FOUND THEN
      RAISE EXCEPTION 'Payment milestone % does not belong to booking %', p_milestone_id, p_booking_id;
    END IF;
  END IF;

  -- Check duplicate reference number in this org
  IF EXISTS (
    SELECT 1 FROM public.booking_payments
    WHERE org_id = p_org_id AND reference_number = trim(p_reference_number)
  ) THEN
    RAISE EXCEPTION 'A payment with reference number % has already been recorded in this organisation', trim(p_reference_number);
  END IF;

  -- Generate sequential receipt number: RCP-<YEAR>-<COUNT+1>
  SELECT 'RCP-' || TO_CHAR(CURRENT_DATE, 'YYYY') || '-' || LPAD((COUNT(*) + 1)::text, 5, '0')
  INTO v_receipt_number
  FROM public.booking_payments
  WHERE org_id = p_org_id;

  -- Record unverified payment
  INSERT INTO public.booking_payments (
    org_id,
    booking_id,
    milestone_id,
    receipt_number,
    amount,
    payment_method,
    payment_date,
    reference_number,
    status,
    notes
  ) VALUES (
    p_org_id,
    p_booking_id,
    p_milestone_id,
    v_receipt_number,
    p_amount,
    p_payment_method,
    p_payment_date,
    trim(p_reference_number),
    'unverified',
    p_notes
  )
  RETURNING id INTO v_payment_id;

  -- Audit log
  IF v_booking_rec.buyer_id IS NOT NULL AND p_actor_id IS NOT NULL THEN
    INSERT INTO public.buyer_audit_logs (
      org_id,
      buyer_id,
      actor_id,
      action,
      details
    ) VALUES (
      p_org_id,
      v_booking_rec.buyer_id,
      p_actor_id,
      'payment_recorded',
      json_build_object(
        'payment_id', v_payment_id,
        'booking_id', p_booking_id,
        'milestone_id', p_milestone_id,
        'receipt_number', v_receipt_number,
        'amount', p_amount,
        'method', p_payment_method,
        'reference', p_reference_number,
        'status', 'unverified'
      )::jsonb
    );
  END IF;

  SELECT to_jsonb(bp.*) INTO v_result
  FROM public.booking_payments bp
  WHERE bp.id = v_payment_id;

  RETURN v_result;
END;
$$;

-- Function 3: Verify Booking Payment Atomically
CREATE OR REPLACE FUNCTION public.verify_booking_payment_atomic(
  p_org_id UUID,
  p_payment_id UUID,
  p_actor_id UUID
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_payment_rec RECORD;
  v_booking_rec RECORD;
  v_milestone_rec RECORD;
  v_new_milestone_paid NUMERIC(15, 2);
  v_new_milestone_status TEXT;
  v_now TIMESTAMPTZ := timezone('utc'::text, now());
  v_result JSONB;
BEGIN
  -- Lock payment row
  SELECT *
  INTO v_payment_rec
  FROM public.booking_payments
  WHERE id = p_payment_id AND org_id = p_org_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Payment record % not found in organisation %', p_payment_id, p_org_id;
  END IF;

  IF v_payment_rec.status = 'verified' THEN
    RAISE EXCEPTION 'Payment % is already verified', p_payment_id;
  END IF;

  IF v_payment_rec.status = 'rejected' OR v_payment_rec.status = 'bounced' THEN
    RAISE EXCEPTION 'Cannot verify a payment in status %', v_payment_rec.status;
  END IF;

  -- Lock booking row
  SELECT *
  INTO v_booking_rec
  FROM public.bookings
  WHERE id = v_payment_rec.booking_id AND org_id = p_org_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Associated booking % not found', v_payment_rec.booking_id;
  END IF;

  -- Update payment status to verified
  UPDATE public.booking_payments
  SET
    status = 'verified',
    verified_at = v_now,
    verified_by = p_actor_id,
    updated_at = v_now
  WHERE id = p_payment_id;

  -- If payment is tied to a milestone, credit milestone atomically
  IF v_payment_rec.milestone_id IS NOT NULL THEN
    SELECT *
    INTO v_milestone_rec
    FROM public.booking_payment_milestones
    WHERE id = v_payment_rec.milestone_id AND booking_id = v_booking_rec.id AND org_id = p_org_id
    FOR UPDATE;

    IF FOUND THEN
      v_new_milestone_paid := v_milestone_rec.amount_paid + v_payment_rec.amount;
      
      IF v_new_milestone_paid >= v_milestone_rec.amount_due THEN
        v_new_milestone_status := 'paid';
      ELSIF v_new_milestone_paid > 0 THEN
        v_new_milestone_status := 'partially_paid';
      ELSE
        v_new_milestone_status := v_milestone_rec.status;
      END IF;

      UPDATE public.booking_payment_milestones
      SET
        amount_paid = v_new_milestone_paid,
        status = v_new_milestone_status,
        payment_records = payment_records || json_build_object(
          'payment_id', v_payment_rec.id,
          'receipt_number', v_payment_rec.receipt_number,
          'amount', v_payment_rec.amount,
          'verified_at', v_now
        )::jsonb,
        updated_at = v_now
      WHERE id = v_payment_rec.milestone_id;
    END IF;
  END IF;

  -- Update booking total amount received
  UPDATE public.bookings
  SET
    booking_amount_received = booking_amount_received + v_payment_rec.amount,
    updated_at = v_now
  WHERE id = v_booking_rec.id;

  -- Audit log
  IF v_booking_rec.buyer_id IS NOT NULL THEN
    INSERT INTO public.buyer_audit_logs (
      org_id,
      buyer_id,
      actor_id,
      action,
      details
    ) VALUES (
      p_org_id,
      v_booking_rec.buyer_id,
      p_actor_id,
      'payment_verified',
      json_build_object(
        'payment_id', p_payment_id,
        'booking_id', v_booking_rec.id,
        'receipt_number', v_payment_rec.receipt_number,
        'amount', v_payment_rec.amount,
        'reference_number', v_payment_rec.reference_number
      )::jsonb
    );
  END IF;

  SELECT to_jsonb(bp.*) INTO v_result
  FROM public.booking_payments bp
  WHERE bp.id = p_payment_id;

  RETURN v_result;
END;
$$;

-- Function 4: Generate or Replace Milestone Schedule Atomically
CREATE OR REPLACE FUNCTION public.generate_booking_milestone_schedule_atomic(
  p_org_id UUID,
  p_booking_id UUID,
  p_milestones JSONB,
  p_actor_id UUID
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_booking_rec RECORD;
  v_elem JSONB;
  v_sum NUMERIC(15, 2) := 0.00;
  v_seq INT := 1;
  v_m_name TEXT;
  v_m_due_date DATE;
  v_m_amount NUMERIC(15, 2);
  v_created_milestones JSONB := '[]'::jsonb;
  v_m_id UUID;
  v_now TIMESTAMPTZ := timezone('utc'::text, now());
BEGIN
  -- Lock booking row
  SELECT *
  INTO v_booking_rec
  FROM public.bookings
  WHERE id = p_booking_id AND org_id = p_org_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Booking % not found in organisation %', p_booking_id, p_org_id;
  END IF;

  IF jsonb_array_length(p_milestones) = 0 THEN
    RAISE EXCEPTION 'At least one milestone is required';
  END IF;

  -- Validate sum equals total_amount
  FOR v_elem IN SELECT * FROM jsonb_array_elements(p_milestones) LOOP
    v_m_amount := (v_elem->>'amount_due')::NUMERIC(15, 2);
    IF v_m_amount <= 0 THEN
      RAISE EXCEPTION 'Milestone amount must be greater than zero';
    END IF;
    v_sum := v_sum + v_m_amount;
  END LOOP;

  IF v_sum <> v_booking_rec.total_amount THEN
    RAISE EXCEPTION 'Milestone schedule sum (%) does not match booking total amount (%)',
      v_sum, v_booking_rec.total_amount;
  END IF;

  -- Check if any existing milestone has verified payments attached
  IF EXISTS (
    SELECT 1 FROM public.booking_payments
    WHERE booking_id = p_booking_id AND org_id = p_org_id AND status = 'verified' AND milestone_id IS NOT NULL
  ) THEN
    RAISE EXCEPTION 'Cannot replace milestone schedule because verified payments are already attached to existing milestones';
  END IF;

  -- Safe to replace uncredited milestones
  DELETE FROM public.booking_payment_milestones
  WHERE booking_id = p_booking_id AND org_id = p_org_id;

  -- Insert new milestones
  FOR v_elem IN SELECT * FROM jsonb_array_elements(p_milestones) LOOP
    v_m_name := v_elem->>'milestone_name';
    v_m_due_date := (v_elem->>'due_date')::DATE;
    v_m_amount := (v_elem->>'amount_due')::NUMERIC(15, 2);

    INSERT INTO public.booking_payment_milestones (
      org_id,
      booking_id,
      milestone_name,
      milestone_sequence,
      due_date,
      amount_due,
      amount_paid,
      status
    ) VALUES (
      p_org_id,
      p_booking_id,
      v_m_name,
      v_seq,
      v_m_due_date,
      v_m_amount,
      0.00,
      'pending'
    )
    RETURNING id INTO v_m_id;

    v_created_milestones := v_created_milestones || json_build_object(
      'id', v_m_id,
      'sequence', v_seq,
      'name', v_m_name,
      'amount_due', v_m_amount,
      'due_date', v_m_due_date
    )::jsonb;

    v_seq := v_seq + 1;
  END LOOP;

  -- Audit log
  IF v_booking_rec.buyer_id IS NOT NULL THEN
    INSERT INTO public.buyer_audit_logs (
      org_id,
      buyer_id,
      actor_id,
      action,
      details
    ) VALUES (
      p_org_id,
      v_booking_rec.buyer_id,
      p_actor_id,
      'milestones_generated',
      json_build_object(
        'booking_id', p_booking_id,
        'count', jsonb_array_length(p_milestones),
        'total_amount', v_booking_rec.total_amount
      )::jsonb
    );
  END IF;

  RETURN json_build_object(
    'success', true,
    'booking_id', p_booking_id,
    'milestones', v_created_milestones
  )::jsonb;
END;
$$;

-- Function 5: Verify or Reject Buyer Document Atomically
CREATE OR REPLACE FUNCTION public.verify_buyer_document_atomic(
  p_org_id UUID,
  p_document_id UUID,
  p_actor_id UUID,
  p_status TEXT,
  p_notes TEXT DEFAULT NULL
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_doc_rec RECORD;
  v_now TIMESTAMPTZ := timezone('utc'::text, now());
  v_result JSONB;
BEGIN
  IF p_status NOT IN ('verified', 'rejected') THEN
    RAISE EXCEPTION 'Document verification status must be verified or rejected';
  END IF;

  SELECT *
  INTO v_doc_rec
  FROM public.buyer_documents
  WHERE id = p_document_id AND org_id = p_org_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Buyer document % not found in organisation %', p_document_id, p_org_id;
  END IF;

  UPDATE public.buyer_documents
  SET
    status = p_status,
    verification_notes = p_notes,
    verified_at = v_now,
    verified_by = p_actor_id,
    updated_at = v_now
  WHERE id = p_document_id;

  -- Audit log
  INSERT INTO public.buyer_audit_logs (
    org_id,
    buyer_id,
    actor_id,
    action,
    details
  ) VALUES (
    p_org_id,
    v_doc_rec.buyer_id,
    p_actor_id,
    'document_' || p_status,
    json_build_object(
      'document_id', p_document_id,
      'document_type', v_doc_rec.document_type,
      'title', v_doc_rec.title,
      'status', p_status,
      'notes', p_notes
    )::jsonb
  );

  SELECT to_jsonb(bd.*) INTO v_result
  FROM public.buyer_documents bd
  WHERE bd.id = p_document_id;

  RETURN v_result;
END;
$$;

-- ============================================================================
-- 8. ROW LEVEL SECURITY (RLS) POLICIES
-- ============================================================================

ALTER TABLE public.buyer_profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.booking_payment_milestones ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.booking_payments ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.buyer_documents ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.buyer_audit_logs ENABLE ROW LEVEL SECURITY;

-- 1. buyer_profiles policies
CREATE POLICY "buyer_profiles_select" ON public.buyer_profiles
  FOR SELECT USING (auth_is_member_of_org(org_id));

CREATE POLICY "buyer_profiles_insert" ON public.buyer_profiles
  FOR INSERT WITH CHECK (auth_has_role_in_org(org_id, ARRAY['owner', 'admin', 'manager', 'sales_exec']));

CREATE POLICY "buyer_profiles_update" ON public.buyer_profiles
  FOR UPDATE USING (auth_has_role_in_org(org_id, ARRAY['owner', 'admin', 'manager', 'sales_exec']));

CREATE POLICY "buyer_profiles_delete" ON public.buyer_profiles
  FOR DELETE USING (auth_has_role_in_org(org_id, ARRAY['owner', 'admin']));

-- 2. booking_payment_milestones policies
CREATE POLICY "booking_milestones_select" ON public.booking_payment_milestones
  FOR SELECT USING (auth_is_member_of_org(org_id));

CREATE POLICY "booking_milestones_insert" ON public.booking_payment_milestones
  FOR INSERT WITH CHECK (auth_has_role_in_org(org_id, ARRAY['owner', 'admin', 'manager']));

CREATE POLICY "booking_milestones_update" ON public.booking_payment_milestones
  FOR UPDATE USING (auth_has_role_in_org(org_id, ARRAY['owner', 'admin', 'manager']));

CREATE POLICY "booking_milestones_delete" ON public.booking_payment_milestones
  FOR DELETE USING (auth_has_role_in_org(org_id, ARRAY['owner', 'admin']));

-- 3. booking_payments policies
CREATE POLICY "booking_payments_select" ON public.booking_payments
  FOR SELECT USING (auth_is_member_of_org(org_id));

CREATE POLICY "booking_payments_insert" ON public.booking_payments
  FOR INSERT WITH CHECK (auth_has_role_in_org(org_id, ARRAY['owner', 'admin', 'manager', 'sales_exec']));

CREATE POLICY "booking_payments_update" ON public.booking_payments
  FOR UPDATE USING (auth_has_role_in_org(org_id, ARRAY['owner', 'admin', 'manager']));

CREATE POLICY "booking_payments_delete" ON public.booking_payments
  FOR DELETE USING (auth_has_role_in_org(org_id, ARRAY['owner', 'admin']));

-- 4. buyer_documents policies
CREATE POLICY "buyer_documents_select" ON public.buyer_documents
  FOR SELECT USING (auth_is_member_of_org(org_id));

CREATE POLICY "buyer_documents_insert" ON public.buyer_documents
  FOR INSERT WITH CHECK (auth_has_role_in_org(org_id, ARRAY['owner', 'admin', 'manager', 'sales_exec']));

CREATE POLICY "buyer_documents_update" ON public.buyer_documents
  FOR UPDATE USING (auth_has_role_in_org(org_id, ARRAY['owner', 'admin', 'manager']));

CREATE POLICY "buyer_documents_delete" ON public.buyer_documents
  FOR DELETE USING (auth_has_role_in_org(org_id, ARRAY['owner', 'admin']));

-- 5. buyer_audit_logs policies (Immutable: SELECT and INSERT only)
CREATE POLICY "buyer_audit_select" ON public.buyer_audit_logs
  FOR SELECT USING (auth_is_member_of_org(org_id));

CREATE POLICY "buyer_audit_insert" ON public.buyer_audit_logs
  FOR INSERT WITH CHECK (auth_is_member_of_org(org_id));

-- ============================================================================
-- 9. PERMISSIONS & GRANTS
-- ============================================================================

GRANT SELECT, INSERT, UPDATE, DELETE ON public.buyer_profiles TO authenticated, service_role;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.booking_payment_milestones TO authenticated, service_role;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.booking_payments TO authenticated, service_role;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.buyer_documents TO authenticated, service_role;
GRANT SELECT, INSERT ON public.buyer_audit_logs TO authenticated, service_role;

GRANT EXECUTE ON FUNCTION public.upsert_buyer_profile_atomic(UUID, TEXT, TEXT, TEXT, TEXT, TEXT, TEXT, TEXT, TEXT, TEXT, TEXT, JSONB, TEXT, UUID, UUID) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.record_booking_payment_atomic(UUID, UUID, UUID, NUMERIC, TEXT, TEXT, UUID, DATE, TEXT) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.verify_booking_payment_atomic(UUID, UUID, UUID) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.generate_booking_milestone_schedule_atomic(UUID, UUID, JSONB, UUID) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.verify_buyer_document_atomic(UUID, UUID, UUID, TEXT, TEXT) TO authenticated, service_role;
