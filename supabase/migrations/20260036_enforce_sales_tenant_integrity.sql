-- Migration 20260036: enforce_sales_tenant_integrity
-- REGrow — M0 tenant hardening
--
-- PROBLEM
--   The Stage 5 sales tables (migration 20260023) accept foreign keys from any tenant.
--   The application writes them with the service-role client, and the DAL inserts client-supplied
--   project_id / lead_id / channel_partner_id / assigned_to without checking ownership
--   (lib/dal/sales.ts scheduleSiteVisit, createDeal, blockInventoryUnit, createBooking).
--   An authenticated member of organisation A could therefore create records in A that point at
--   organisation B's projects, leads or channel partners, or assign work to non-members.
--
-- FIX (database layer, defence in depth — the API layer is fixed separately)
--   One BEFORE INSERT/UPDATE trigger function, attached to every Stage 5 table, that:
--     1. forbids changing org_id after creation;
--     2. requires every referenced project / lead / inventory unit / channel partner / blocking /
--        booking to belong to the row's org_id;
--     3. requires the inventory unit to belong to the referenced project;
--     4. requires assigned_to / blocked_by to be an ACTIVE member of the row's org_id.
--   On UPDATE only changed columns are re-validated, so historical rows referencing a member who
--   was later deactivated remain editable.
--
-- Production precondition (verified read-only on 2026-11-16): all six tables contain 0 rows.
-- This migration changes no data.

BEGIN;

CREATE OR REPLACE FUNCTION public.enforce_sales_tenant_integrity()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public, pg_temp
AS $$
DECLARE
  v_new JSONB := to_jsonb(NEW);
  v_old JSONB := CASE WHEN TG_OP = 'UPDATE' THEN to_jsonb(OLD) ELSE NULL END;
  v_ref RECORD;
  v_id UUID;
  v_ref_org UUID;
  v_unit_project UUID;
  v_member_col TEXT;
BEGIN
  -- 1. Organisation ownership is immutable
  IF TG_OP = 'UPDATE' AND OLD.org_id IS DISTINCT FROM NEW.org_id THEN
    RAISE EXCEPTION 'tenant_integrity: %.org_id is immutable (attempted change from % to %)',
      TG_TABLE_NAME, OLD.org_id, NEW.org_id
      USING ERRCODE = 'check_violation';
  END IF;

  -- 2. Every referenced record must belong to the same organisation
  FOR v_ref IN
    SELECT * FROM (VALUES
      ('project_id',         'projects'),
      ('lead_id',            'leads'),
      ('inventory_id',       'inventory_items'),
      ('channel_partner_id', 'channel_partners'),
      ('blocking_id',        'inventory_blockings'),
      ('booking_id',         'bookings')
    ) AS t(col, ref_table)
  LOOP
    CONTINUE WHEN NOT (v_new ? v_ref.col);
    CONTINUE WHEN v_new ->> v_ref.col IS NULL;
    CONTINUE WHEN TG_OP = 'UPDATE' AND (v_old ->> v_ref.col) IS NOT DISTINCT FROM (v_new ->> v_ref.col);

    v_id := (v_new ->> v_ref.col)::UUID;
    EXECUTE format('SELECT org_id FROM public.%I WHERE id = $1', v_ref.ref_table)
      INTO v_ref_org USING v_id;

    -- "Missing" and "belongs to another organisation" deliberately raise the SAME message, so an
    -- API error can never confirm that another tenant's record exists or reveal its org id.
    IF v_ref_org IS NULL OR v_ref_org IS DISTINCT FROM NEW.org_id THEN
      RAISE EXCEPTION 'tenant_integrity: %.% is not a valid reference for this organisation',
        TG_TABLE_NAME, v_ref.col
        USING ERRCODE = 'check_violation';
    END IF;
  END LOOP;

  -- 3. The inventory unit must belong to the referenced project
  IF (v_new ? 'inventory_id') AND (v_new ? 'project_id')
     AND v_new ->> 'inventory_id' IS NOT NULL AND v_new ->> 'project_id' IS NOT NULL
     AND (TG_OP = 'INSERT'
          OR (v_old ->> 'inventory_id') IS DISTINCT FROM (v_new ->> 'inventory_id')
          OR (v_old ->> 'project_id')   IS DISTINCT FROM (v_new ->> 'project_id')) THEN
    SELECT i.project_id INTO v_unit_project
    FROM public.inventory_items i
    WHERE i.id = (v_new ->> 'inventory_id')::UUID;

    IF v_unit_project IS DISTINCT FROM (v_new ->> 'project_id')::UUID THEN
      RAISE EXCEPTION 'tenant_integrity: %.inventory_id does not belong to the referenced project',
        TG_TABLE_NAME
        USING ERRCODE = 'check_violation';
    END IF;
  END IF;

  -- 4. Assigned people must be active members of the organisation
  FOREACH v_member_col IN ARRAY ARRAY['assigned_to', 'blocked_by'] LOOP
    CONTINUE WHEN NOT (v_new ? v_member_col);
    CONTINUE WHEN v_new ->> v_member_col IS NULL;
    CONTINUE WHEN TG_OP = 'UPDATE' AND (v_old ->> v_member_col) IS NOT DISTINCT FROM (v_new ->> v_member_col);

    IF NOT EXISTS (
      SELECT 1 FROM public.org_members om
      WHERE om.org_id = NEW.org_id
        AND om.profile_id = (v_new ->> v_member_col)::UUID
        AND om.status = 'active'
    ) THEN
      RAISE EXCEPTION 'tenant_integrity: %.% is not an active member of this organisation',
        TG_TABLE_NAME, v_member_col
        USING ERRCODE = 'check_violation';
    END IF;
  END LOOP;

  RETURN NEW;
END;
$$;

REVOKE ALL ON FUNCTION public.enforce_sales_tenant_integrity() FROM PUBLIC, anon, authenticated;

DROP TRIGGER IF EXISTS trg_site_visits_tenant_integrity ON public.site_visits;
CREATE TRIGGER trg_site_visits_tenant_integrity
  BEFORE INSERT OR UPDATE ON public.site_visits
  FOR EACH ROW EXECUTE FUNCTION public.enforce_sales_tenant_integrity();

DROP TRIGGER IF EXISTS trg_deals_tenant_integrity ON public.deals;
CREATE TRIGGER trg_deals_tenant_integrity
  BEFORE INSERT OR UPDATE ON public.deals
  FOR EACH ROW EXECUTE FUNCTION public.enforce_sales_tenant_integrity();

DROP TRIGGER IF EXISTS trg_inventory_blockings_tenant_integrity ON public.inventory_blockings;
CREATE TRIGGER trg_inventory_blockings_tenant_integrity
  BEFORE INSERT OR UPDATE ON public.inventory_blockings
  FOR EACH ROW EXECUTE FUNCTION public.enforce_sales_tenant_integrity();

DROP TRIGGER IF EXISTS trg_bookings_tenant_integrity ON public.bookings;
CREATE TRIGGER trg_bookings_tenant_integrity
  BEFORE INSERT OR UPDATE ON public.bookings
  FOR EACH ROW EXECUTE FUNCTION public.enforce_sales_tenant_integrity();

DROP TRIGGER IF EXISTS trg_channel_partners_tenant_integrity ON public.channel_partners;
CREATE TRIGGER trg_channel_partners_tenant_integrity
  BEFORE INSERT OR UPDATE ON public.channel_partners
  FOR EACH ROW EXECUTE FUNCTION public.enforce_sales_tenant_integrity();

DROP TRIGGER IF EXISTS trg_channel_partner_commissions_tenant_integrity ON public.channel_partner_commissions;
CREATE TRIGGER trg_channel_partner_commissions_tenant_integrity
  BEFORE INSERT OR UPDATE ON public.channel_partner_commissions
  FOR EACH ROW EXECUTE FUNCTION public.enforce_sales_tenant_integrity();

COMMIT;
