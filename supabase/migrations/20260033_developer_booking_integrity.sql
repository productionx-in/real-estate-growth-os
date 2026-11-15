-- supabase/migrations/20260033_developer_booking_integrity.sql
-- Migration 0033: Phase 2 Developer Booking & Hold Integrity Hardening
-- Enforces:
-- 1. Partial unique index: Maximum 1 active hold per inventory unit (database-level double-hold prevention).
-- 2. Partial unique index: Maximum 1 active/confirmed booking per inventory unit (database-level double-booking prevention).
-- 3. Payment status separation & idempotency keys on inventory_blockings and bookings.
-- 4. Atomic stored procedures with row-level locks (FOR UPDATE):
--    - hold_inventory_unit_atomic
--    - release_inventory_hold_atomic
--    - execute_booking_atomic
--    - sweep_expired_holds_atomic (with SKIP LOCKED for safe concurrent expiry sweeps)

-- 1. Schema Extensions for Payment Status and Idempotency
ALTER TABLE public.inventory_blockings
  ADD COLUMN IF NOT EXISTS payment_status TEXT NOT NULL DEFAULT 'unverified'
    CHECK (payment_status IN ('unverified', 'verified', 'failed', 'refunded'));

ALTER TABLE public.inventory_blockings
  ADD COLUMN IF NOT EXISTS idempotency_key TEXT;

ALTER TABLE public.bookings
  ADD COLUMN IF NOT EXISTS payment_status TEXT NOT NULL DEFAULT 'unverified'
    CHECK (payment_status IN ('unverified', 'partially_verified', 'verified'));

ALTER TABLE public.bookings
  ADD COLUMN IF NOT EXISTS idempotency_key TEXT;

-- 2. Uniqueness Guarantees
-- A. Prevent double-holding: at most one active hold on any inventory unit
CREATE UNIQUE INDEX IF NOT EXISTS uq_active_blocking_per_unit
  ON public.inventory_blockings(inventory_id)
  WHERE status = 'active';

-- B. Prevent double-booking: at most one active booking on any inventory unit
CREATE UNIQUE INDEX IF NOT EXISTS uq_active_booking_per_unit
  ON public.bookings(inventory_id)
  WHERE status IN ('confirmed', 'agreement_signed', 'registered');

-- C. Idempotency keys scoped by organisation
CREATE UNIQUE INDEX IF NOT EXISTS uq_inventory_blockings_idempotency
  ON public.inventory_blockings(org_id, idempotency_key)
  WHERE idempotency_key IS NOT NULL;

CREATE UNIQUE INDEX IF NOT EXISTS uq_bookings_idempotency
  ON public.bookings(org_id, idempotency_key)
  WHERE idempotency_key IS NOT NULL;

-- ----------------------------------------------------------------------------
-- 3. Stored Procedure: hold_inventory_unit_atomic
-- Atomically acquires row lock on inventory_items, validates availability,
-- places the hold, marks unit as blocked, records audit history, and advances deal.
-- ----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.hold_inventory_unit_atomic(
  p_org_id UUID,
  p_project_id UUID,
  p_inventory_id UUID,
  p_lead_id UUID,
  p_token_amount NUMERIC,
  p_hold_duration_hours INTEGER DEFAULT 48,
  p_payment_reference TEXT DEFAULT NULL,
  p_payment_status TEXT DEFAULT 'unverified',
  p_remarks TEXT DEFAULT NULL,
  p_actor_id UUID DEFAULT NULL,
  p_idempotency_key TEXT DEFAULT NULL
)
RETURNS TABLE (
  blocking_id UUID,
  org_id UUID,
  project_id UUID,
  inventory_id UUID,
  lead_id UUID,
  token_amount NUMERIC,
  status TEXT,
  expires_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public, pg_temp
AS $$
DECLARE
  v_unit_status public.inventory_status;
  v_unit_org_id UUID;
  v_unit_project_id UUID;
  v_unit_number TEXT;
  v_lead_org_id UUID;
  v_blocking_id UUID;
  v_expires_at TIMESTAMPTZ;
  v_created_at TIMESTAMPTZ;
  v_actor_profile_id UUID := p_actor_id;
  v_existing_id UUID;
BEGIN
  -- Idempotency Check: if idempotency key provided and already exists, return existing record
  IF p_idempotency_key IS NOT NULL THEN
    SELECT ib.id, ib.org_id, ib.project_id, ib.inventory_id, ib.lead_id, ib.token_amount, ib.status, ib.expires_at, ib.created_at
    INTO v_blocking_id, v_unit_org_id, v_unit_project_id, v_unit_org_id, v_lead_org_id, p_token_amount, v_unit_number, v_expires_at, v_created_at
    FROM public.inventory_blockings ib
    WHERE ib.org_id = p_org_id AND ib.idempotency_key = p_idempotency_key;

    IF FOUND THEN
      RETURN QUERY
      SELECT ib.id, ib.org_id, ib.project_id, ib.inventory_id, ib.lead_id, ib.token_amount, ib.status, ib.expires_at, ib.created_at
      FROM public.inventory_blockings ib
      WHERE ib.id = v_blocking_id;
      RETURN;
    END IF;
  END IF;

  -- Validation: Token amount cannot be negative
  IF p_token_amount < 0 THEN
    RAISE EXCEPTION 'Token amount cannot be negative';
  END IF;

  -- 1. Row-level lock on the target unit
  SELECT inv.status, inv.org_id, inv.project_id, inv.unit_number
  INTO v_unit_status, v_unit_org_id, v_unit_project_id, v_unit_number
  FROM public.inventory_items inv
  WHERE inv.id = p_inventory_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Inventory unit % not found', p_inventory_id;
  END IF;

  -- Tenant boundary enforcement
  IF v_unit_org_id <> p_org_id THEN
    RAISE EXCEPTION 'Permission denied: unit belongs to organisation %, caller requested %', v_unit_org_id, p_org_id;
  END IF;

  IF v_unit_project_id <> p_project_id THEN
    RAISE EXCEPTION 'Project mismatch: unit belongs to project %, expected %', v_unit_project_id, p_project_id;
  END IF;

  -- Unit must be strictly 'available'
  IF v_unit_status <> 'available' THEN
    RAISE EXCEPTION 'Cannot block unit: current status is % (expected available)', v_unit_status;
  END IF;

  -- Verify lead belongs to this organisation
  SELECT l.org_id INTO v_lead_org_id
  FROM public.leads l
  WHERE l.id = p_lead_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Lead % not found', p_lead_id;
  END IF;

  IF v_lead_org_id <> p_org_id THEN
    RAISE EXCEPTION 'Permission denied: lead belongs to organisation %, expected %', v_lead_org_id, p_org_id;
  END IF;

  -- Resolve fallback actor if null
  IF v_actor_profile_id IS NULL THEN
    SELECT om.profile_id INTO v_actor_profile_id
    FROM public.org_members om
    WHERE om.org_id = p_org_id
    LIMIT 1;
  END IF;

  -- Calculate expiry
  v_expires_at := pg_catalog.now() + (p_hold_duration_hours || ' hours')::interval;
  v_created_at := pg_catalog.now();

  -- 2. Insert blocking record
  INSERT INTO public.inventory_blockings (
    org_id,
    project_id,
    inventory_id,
    lead_id,
    blocked_by,
    token_amount,
    payment_reference,
    payment_status,
    expires_at,
    remarks,
    status,
    idempotency_key,
    created_at,
    updated_at
  ) VALUES (
    p_org_id,
    p_project_id,
    p_inventory_id,
    p_lead_id,
    v_actor_profile_id,
    p_token_amount,
    p_payment_reference,
    COALESCE(p_payment_status, 'unverified'),
    v_expires_at,
    p_remarks,
    'active',
    p_idempotency_key,
    v_created_at,
    v_created_at
  )
  RETURNING id INTO v_blocking_id;

  -- 3. Update unit status to 'blocked'
  UPDATE public.inventory_items
  SET status = 'blocked',
      updated_at = v_created_at
  WHERE public.inventory_items.id = p_inventory_id;

  -- 4. Record audit history in inventory_status_history
  INSERT INTO public.inventory_status_history (
    inventory_id,
    org_id,
    previous_status,
    new_status,
    changed_by,
    reason,
    metadata,
    created_at
  ) VALUES (
    p_inventory_id,
    p_org_id,
    'available',
    'blocked',
    COALESCE(v_actor_profile_id, p_lead_id),
    COALESCE(p_remarks, 'Hold placed with token ₹' || p_token_amount::text),
    json_build_object(
      'blocking_id', v_blocking_id,
      'lead_id', p_lead_id,
      'token_amount', p_token_amount,
      'payment_reference', p_payment_reference,
      'payment_status', p_payment_status,
      'expires_at', v_expires_at
    )::jsonb,
    v_created_at
  );

  -- 5. Advance or create Deal
  SELECT d.id INTO v_existing_id
  FROM public.deals d
  WHERE d.org_id = p_org_id AND d.lead_id = p_lead_id AND d.project_id = p_project_id
  LIMIT 1;

  IF v_existing_id IS NOT NULL THEN
    UPDATE public.deals
    SET inventory_id = p_inventory_id,
        stage = 'unit_blocked',
        probability = 70,
        updated_at = v_created_at
    WHERE public.deals.id = v_existing_id;
  ELSE
    INSERT INTO public.deals (
      org_id,
      project_id,
      lead_id,
      inventory_id,
      stage,
      probability,
      notes,
      created_at,
      updated_at
    ) VALUES (
      p_org_id,
      p_project_id,
      p_lead_id,
      p_inventory_id,
      'unit_blocked',
      70,
      'Unit ' || v_unit_number || ' held with token ₹' || p_token_amount::text,
      v_created_at,
      v_created_at
    );
  END IF;

  RETURN QUERY
  SELECT ib.id, ib.org_id, ib.project_id, ib.inventory_id, ib.lead_id, ib.token_amount, ib.status, ib.expires_at, ib.created_at
  FROM public.inventory_blockings ib
  WHERE ib.id = v_blocking_id;
END;
$$;

-- ----------------------------------------------------------------------------
-- 4. Stored Procedure: release_inventory_hold_atomic
-- Atomically cancels an active hold and safely restores the inventory unit to
-- 'available' ONLY IF the unit is still in 'blocked' status (never releases booked unit).
-- ----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.release_inventory_hold_atomic(
  p_org_id UUID,
  p_blocking_id UUID,
  p_reason TEXT DEFAULT NULL,
  p_actor_id UUID DEFAULT NULL
)
RETURNS TABLE (
  blocking_id UUID,
  inventory_id UUID,
  previous_unit_status public.inventory_status,
  new_unit_status public.inventory_status,
  success BOOLEAN
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public, pg_temp
AS $$
DECLARE
  v_inv_id UUID;
  v_blocking_status TEXT;
  v_unit_status public.inventory_status;
  v_unit_org_id UUID;
  v_now TIMESTAMPTZ := pg_catalog.now();
  v_actor_profile_id UUID := p_actor_id;
BEGIN
  -- 1. Lock blocking record
  SELECT ib.inventory_id, ib.status
  INTO v_inv_id, v_blocking_status
  FROM public.inventory_blockings ib
  WHERE ib.id = p_blocking_id AND ib.org_id = p_org_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Blocking % not found in organisation %', p_blocking_id, p_org_id;
  END IF;

  IF v_blocking_status <> 'active' THEN
    RAISE EXCEPTION 'Blocking cannot be released: current status is % (expected active)', v_blocking_status;
  END IF;

  -- 2. Lock unit record
  SELECT inv.status, inv.org_id
  INTO v_unit_status, v_unit_org_id
  FROM public.inventory_items inv
  WHERE inv.id = v_inv_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Inventory unit % not found', v_inv_id;
  END IF;

  IF v_unit_org_id <> p_org_id THEN
    RAISE EXCEPTION 'Permission denied: unit does not belong to organisation %', p_org_id;
  END IF;

  -- Resolve actor
  IF v_actor_profile_id IS NULL THEN
    SELECT om.profile_id INTO v_actor_profile_id
    FROM public.org_members om
    WHERE om.org_id = p_org_id
    LIMIT 1;
  END IF;

  -- 3. Mark blocking as cancelled
  UPDATE public.inventory_blockings
  SET status = 'cancelled',
      remarks = COALESCE(p_reason, 'Hold released manually'),
      updated_at = v_now
  WHERE public.inventory_blockings.id = p_blocking_id;

  -- 4. Restore unit ONLY if it is currently 'blocked'
  -- CRITICAL INVARIANT: If the unit has already transitioned to 'booked' or 'sold',
  -- we do NOT overwrite it!
  IF v_unit_status = 'blocked' THEN
    UPDATE public.inventory_items
    SET status = 'available',
        updated_at = v_now
    WHERE public.inventory_items.id = v_inv_id;

    -- Record status history
    INSERT INTO public.inventory_status_history (
      inventory_id,
      org_id,
      previous_status,
      new_status,
      changed_by,
      reason,
      metadata,
      created_at
    ) VALUES (
      v_inv_id,
      p_org_id,
      'blocked',
      'available',
      COALESCE(v_actor_profile_id, v_inv_id),
      COALESCE(p_reason, 'Hold released manually'),
      json_build_object('blocking_id', p_blocking_id, 'action', 'release_hold')::jsonb,
      v_now
    );

    RETURN QUERY SELECT p_blocking_id, v_inv_id, v_unit_status, 'available'::public.inventory_status, TRUE;
  ELSE
    -- Unit status was not 'blocked', preserved unchanged
    RETURN QUERY SELECT p_blocking_id, v_inv_id, v_unit_status, v_unit_status, TRUE;
  END IF;
END;
$$;

-- ----------------------------------------------------------------------------
-- 5. Stored Procedure: execute_booking_atomic
-- Atomically executes a confirmed booking, converting any existing hold,
-- updating inventory status, recording audit history, advancing deals,
-- and computing broker commissions in ONE transaction.
-- ----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.execute_booking_atomic(
  p_org_id UUID,
  p_project_id UUID,
  p_inventory_id UUID,
  p_lead_id UUID,
  p_blocking_id UUID DEFAULT NULL,
  p_channel_partner_id UUID DEFAULT NULL,
  p_base_price NUMERIC DEFAULT 0,
  p_additional_charges NUMERIC DEFAULT 0,
  p_booking_amount_received NUMERIC DEFAULT 0,
  p_payment_plan TEXT DEFAULT 'construction_linked',
  p_payment_status TEXT DEFAULT 'unverified',
  p_remarks TEXT DEFAULT NULL,
  p_actor_id UUID DEFAULT NULL,
  p_idempotency_key TEXT DEFAULT NULL
)
RETURNS TABLE (
  booking_id UUID,
  booking_number TEXT,
  total_amount NUMERIC,
  status TEXT,
  created_at TIMESTAMPTZ
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public, pg_temp
AS $$
DECLARE
  v_unit_status public.inventory_status;
  v_unit_org_id UUID;
  v_unit_project_id UUID;
  v_unit_number TEXT;
  v_blk_status TEXT;
  v_blk_inv_id UUID;
  v_blk_lead_id UUID;
  v_booking_id UUID;
  v_booking_number TEXT;
  v_total_amount NUMERIC;
  v_now TIMESTAMPTZ := pg_catalog.now();
  v_actor_profile_id UUID := p_actor_id;
  v_existing_deal_id UUID;
  v_cp_rate NUMERIC;
  v_gross NUMERIC;
  v_tds NUMERIC;
  v_net NUMERIC;
BEGIN
  -- Idempotency Check: if idempotency key provided and exists, return existing booking
  IF p_idempotency_key IS NOT NULL THEN
    SELECT b.id, b.booking_number, b.total_amount, b.status, b.created_at
    INTO v_booking_id, v_booking_number, v_total_amount, v_unit_number, v_now
    FROM public.bookings b
    WHERE b.org_id = p_org_id AND b.idempotency_key = p_idempotency_key;

    IF FOUND THEN
      RETURN QUERY
      SELECT b.id, b.booking_number, b.total_amount, b.status, b.created_at
      FROM public.bookings b
      WHERE b.id = v_booking_id;
      RETURN;
    END IF;
  END IF;

  -- 1. Commercial Arithmetic Reconciliation
  IF p_base_price <= 0 THEN
    RAISE EXCEPTION 'Base price must be greater than zero (received %)', p_base_price;
  END IF;

  IF p_additional_charges < 0 THEN
    RAISE EXCEPTION 'Additional charges cannot be negative';
  END IF;

  IF p_booking_amount_received < 0 THEN
    RAISE EXCEPTION 'Booking amount received cannot be negative';
  END IF;

  v_total_amount := p_base_price + p_additional_charges;

  -- 2. Lock target inventory unit
  SELECT inv.status, inv.org_id, inv.project_id, inv.unit_number
  INTO v_unit_status, v_unit_org_id, v_unit_project_id, v_unit_number
  FROM public.inventory_items inv
  WHERE inv.id = p_inventory_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Inventory unit % not found', p_inventory_id;
  END IF;

  IF v_unit_org_id <> p_org_id THEN
    RAISE EXCEPTION 'Permission denied: unit does not belong to organisation %', p_org_id;
  END IF;

  IF v_unit_project_id <> p_project_id THEN
    RAISE EXCEPTION 'Project mismatch: unit belongs to project %, expected %', v_unit_project_id, p_project_id;
  END IF;

  -- 3. If converting from an active hold, lock and validate the blocking
  IF p_blocking_id IS NOT NULL THEN
    SELECT ib.status, ib.inventory_id, ib.lead_id
    INTO v_blk_status, v_blk_inv_id, v_blk_lead_id
    FROM public.inventory_blockings ib
    WHERE ib.id = p_blocking_id AND ib.org_id = p_org_id
    FOR UPDATE;

    IF NOT FOUND THEN
      RAISE EXCEPTION 'Blocking record % not found in organisation %', p_blocking_id, p_org_id;
    END IF;

    IF v_blk_status <> 'active' THEN
      RAISE EXCEPTION 'Cannot convert hold: blocking status is % (expected active)', v_blk_status;
    END IF;

    IF v_blk_inv_id <> p_inventory_id THEN
      RAISE EXCEPTION 'Blocking inventory unit mismatch: blocking is for unit %, requested %', v_blk_inv_id, p_inventory_id;
    END IF;

    IF v_blk_lead_id <> p_lead_id THEN
      RAISE EXCEPTION 'Blocking buyer mismatch: hold is for lead %, requested %', v_blk_lead_id, p_lead_id;
    END IF;

    IF v_unit_status NOT IN ('available', 'blocked') THEN
      RAISE EXCEPTION 'Cannot book unit: current unit status is % (expected available or blocked)', v_unit_status;
    END IF;

    -- Transition blocking status to converted_to_booking
    UPDATE public.inventory_blockings
    SET status = 'converted_to_booking',
        updated_at = v_now
    WHERE public.inventory_blockings.id = p_blocking_id;
  ELSE
    -- Direct booking: unit must be strictly available
    IF v_unit_status <> 'available' THEN
      RAISE EXCEPTION 'Cannot book unit directly: current status is % (expected available)', v_unit_status;
    END IF;
  END IF;

  -- Resolve actor
  IF v_actor_profile_id IS NULL THEN
    SELECT om.profile_id INTO v_actor_profile_id
    FROM public.org_members om
    WHERE om.org_id = p_org_id
    LIMIT 1;
  END IF;

  -- Generate unique booking number
  v_booking_number := 'BK-' || to_char(v_now, 'YYYYMMDD') || '-' || floor(1000 + random() * 9000)::text;

  -- 4. Insert Confirmed Booking
  INSERT INTO public.bookings (
    org_id,
    project_id,
    inventory_id,
    lead_id,
    blocking_id,
    channel_partner_id,
    booking_number,
    booking_date,
    status,
    base_price,
    additional_charges,
    total_amount,
    booking_amount_received,
    payment_plan,
    payment_status,
    idempotency_key,
    remarks,
    created_at,
    updated_at
  ) VALUES (
    p_org_id,
    p_project_id,
    p_inventory_id,
    p_lead_id,
    p_blocking_id,
    p_channel_partner_id,
    v_booking_number,
    v_now::date,
    'confirmed',
    p_base_price,
    p_additional_charges,
    v_total_amount,
    p_booking_amount_received,
    COALESCE(p_payment_plan, 'construction_linked'),
    COALESCE(p_payment_status, 'unverified'),
    p_idempotency_key,
    p_remarks,
    v_now,
    v_now
  )
  RETURNING id INTO v_booking_id;

  -- 5. Mark unit status as 'booked'
  UPDATE public.inventory_items
  SET status = 'booked',
      updated_at = v_now
  WHERE public.inventory_items.id = p_inventory_id;

  -- 6. Append audit history
  INSERT INTO public.inventory_status_history (
    inventory_id,
    org_id,
    previous_status,
    new_status,
    changed_by,
    reason,
    metadata,
    created_at
  ) VALUES (
    p_inventory_id,
    p_org_id,
    v_unit_status,
    'booked',
    COALESCE(v_actor_profile_id, p_lead_id),
    COALESCE(p_remarks, 'Confirmed Booking #' || v_booking_number),
    json_build_object(
      'booking_id', v_booking_id,
      'booking_number', v_booking_number,
      'lead_id', p_lead_id,
      'total_amount', v_total_amount,
      'booking_amount_received', p_booking_amount_received,
      'payment_plan', p_payment_plan,
      'blocking_id', p_blocking_id
    )::jsonb,
    v_now
  );

  -- 7. Advance Deal to 'booked' (100% probability)
  SELECT d.id INTO v_existing_deal_id
  FROM public.deals d
  WHERE d.org_id = p_org_id AND d.lead_id = p_lead_id AND d.project_id = p_project_id
  LIMIT 1;

  IF v_existing_deal_id IS NOT NULL THEN
    UPDATE public.deals
    SET inventory_id = p_inventory_id,
        stage = 'booked',
        probability = 100,
        deal_value = v_total_amount,
        updated_at = v_now
    WHERE public.deals.id = v_existing_deal_id;
  ELSE
    INSERT INTO public.deals (
      org_id,
      project_id,
      lead_id,
      inventory_id,
      stage,
      probability,
      deal_value,
      notes,
      created_at,
      updated_at
    ) VALUES (
      p_org_id,
      p_project_id,
      p_lead_id,
      p_inventory_id,
      'booked',
      100,
      v_total_amount,
      'Unit ' || v_unit_number || ' booked under #' || v_booking_number,
      v_now,
      v_now
    );
  END IF;

  -- 8. Channel Partner Commission calculation & insertion
  IF p_channel_partner_id IS NOT NULL THEN
    SELECT cp.default_commission_rate INTO v_cp_rate
    FROM public.channel_partners cp
    WHERE cp.id = p_channel_partner_id AND cp.org_id = p_org_id;

    IF FOUND THEN
      v_cp_rate := COALESCE(v_cp_rate, 2.0);
      v_gross := (v_total_amount * v_cp_rate) / 100.0;
      v_tds := (v_gross * 5.0) / 100.0;
      v_net := v_gross - v_tds;

      INSERT INTO public.channel_partner_commissions (
        org_id,
        booking_id,
        channel_partner_id,
        commission_type,
        commission_rate,
        gross_commission_amount,
        tds_percentage,
        net_commission_amount,
        status,
        milestones,
        created_at,
        updated_at
      ) VALUES (
        p_org_id,
        v_booking_id,
        p_channel_partner_id,
        'percentage',
        v_cp_rate,
        v_gross,
        5.00,
        v_net,
        'pending_approval',
        json_build_array(
          json_build_object(
            'name', 'Booking Advance Milestone',
            'percentage', 50,
            'amount', v_net * 0.5,
            'trigger_event', 'booking_confirmed',
            'is_paid', false
          ),
          json_build_object(
            'name', 'Sale Agreement Registration Milestone',
            'percentage', 50,
            'amount', v_net * 0.5,
            'trigger_event', 'agreement_signed',
            'is_paid', false
          )
        )::jsonb,
        v_now,
        v_now
      );
    END IF;
  END IF;

  RETURN QUERY
  SELECT b.id, b.booking_number, b.total_amount, b.status, b.created_at
  FROM public.bookings b
  WHERE b.id = v_booking_id;
END;
$$;

-- ----------------------------------------------------------------------------
-- 6. Stored Procedure: sweep_expired_holds_atomic
-- Sweeps all expired active holds safely using FOR UPDATE SKIP LOCKED.
-- Concurrent workers will never collide or process the same hold twice.
-- Restores inventory unit to 'available' ONLY IF unit is still 'blocked'.
-- ----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.sweep_expired_holds_atomic(
  p_org_id UUID DEFAULT NULL
)
RETURNS TABLE (
  expired_blocking_id UUID,
  inventory_id UUID,
  released_to_available BOOLEAN
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public, pg_temp
AS $$
DECLARE
  v_rec RECORD;
  v_unit_status public.inventory_status;
  v_system_actor_id UUID;
  v_released BOOLEAN;
  v_now TIMESTAMPTZ := pg_catalog.now();
BEGIN
  -- Loop through expired active holds using SKIP LOCKED to prevent concurrent worker contention
  FOR v_rec IN
    SELECT ib.id, ib.org_id, ib.inventory_id
    FROM public.inventory_blockings ib
    WHERE (p_org_id IS NULL OR ib.org_id = p_org_id)
      AND ib.status = 'active'
      AND ib.expires_at < v_now
    FOR UPDATE SKIP LOCKED
  LOOP
    v_released := FALSE;

    -- Lock the unit
    SELECT inv.status INTO v_unit_status
    FROM public.inventory_items inv
    WHERE inv.id = v_rec.inventory_id
    FOR UPDATE;

    -- Only restore to 'available' if current unit status is 'blocked'
    IF v_unit_status = 'blocked' THEN
      UPDATE public.inventory_items
      SET status = 'available',
          updated_at = v_now
      WHERE public.inventory_items.id = v_rec.inventory_id;

      -- Resolve actor for audit log
      SELECT om.profile_id INTO v_system_actor_id
      FROM public.org_members om
      WHERE om.org_id = v_rec.org_id
      LIMIT 1;

      INSERT INTO public.inventory_status_history (
        inventory_id,
        org_id,
        previous_status,
        new_status,
        changed_by,
        reason,
        metadata,
        created_at
      ) VALUES (
        v_rec.inventory_id,
        v_rec.org_id,
        'blocked',
        'available',
        COALESCE(v_system_actor_id, v_rec.inventory_id),
        'Hold expired automatically (hold duration elapsed)',
        json_build_object('blocking_id', v_rec.id, 'action', 'auto_expire')::jsonb,
        v_now
      );

      v_released := TRUE;
    END IF;

    -- Mark blocking as expired
    UPDATE public.inventory_blockings
    SET status = 'expired',
        updated_at = v_now
    WHERE public.inventory_blockings.id = v_rec.id;

    expired_blocking_id := v_rec.id;
    inventory_id := v_rec.inventory_id;
    released_to_available := v_released;
    RETURN NEXT;
  END LOOP;
END;
$$;

-- ----------------------------------------------------------------------------
-- 7. Secure Grants and Execution Privileges
-- ----------------------------------------------------------------------------
REVOKE ALL ON FUNCTION public.hold_inventory_unit_atomic(UUID, UUID, UUID, UUID, NUMERIC, INTEGER, TEXT, TEXT, TEXT, UUID, TEXT) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.hold_inventory_unit_atomic(UUID, UUID, UUID, UUID, NUMERIC, INTEGER, TEXT, TEXT, TEXT, UUID, TEXT) TO service_role, postgres;

REVOKE ALL ON FUNCTION public.release_inventory_hold_atomic(UUID, UUID, TEXT, UUID) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.release_inventory_hold_atomic(UUID, UUID, TEXT, UUID) TO service_role, postgres;

REVOKE ALL ON FUNCTION public.execute_booking_atomic(UUID, UUID, UUID, UUID, UUID, UUID, NUMERIC, NUMERIC, NUMERIC, TEXT, TEXT, TEXT, UUID, TEXT) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.execute_booking_atomic(UUID, UUID, UUID, UUID, UUID, UUID, NUMERIC, NUMERIC, NUMERIC, TEXT, TEXT, TEXT, UUID, TEXT) TO service_role, postgres;

REVOKE ALL ON FUNCTION public.sweep_expired_holds_atomic(UUID) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.sweep_expired_holds_atomic(UUID) TO service_role, postgres;
