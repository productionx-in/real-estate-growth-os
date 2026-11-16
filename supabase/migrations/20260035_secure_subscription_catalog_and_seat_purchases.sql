-- Migration 20260035: secure_subscription_catalog_and_seat_purchases
-- Production X — Security remediation (live exposure)
--
-- PROBLEM
--   Migration 20260029 created three tables without enabling Row Level Security:
--     public.subscription_plans
--     public.subscription_plan_versions
--     public.org_subscription_seat_purchases
--   Supabase's default privileges grant anon and authenticated full DML
--   (SELECT, INSERT, UPDATE, DELETE, TRUNCATE, REFERENCES, TRIGGER) on new
--   public tables, so any holder of the public anon key could, via PostgREST:
--     * insert rows into org_subscription_seat_purchases, which
--       reserve_employee_seat_atomic() sums into seat capacity
--       -> unlimited seats for any organisation;
--     * alter or truncate plan pricing read by provision_organisation_atomic()
--       -> manipulated invoice pricing / broken provisioning.
--
-- ACCESS MODEL AFTER THIS MIGRATION
--   anon            : no privileges on any of the three tables.
--   authenticated   : SELECT only, and only rows permitted by the policies below.
--                     No INSERT / UPDATE / DELETE / TRUNCATE / REFERENCES / TRIGGER.
--     - Platform staff (platform_users.is_active) may read the plan catalog and
--       seat purchases.
--     - Organisation owners/admins may read their OWN organisation's seat
--       purchases (read-only). Customers cannot read the plan catalog.
--   service_role    : full access (BYPASSRLS). Used only by server-side routes
--                     that already enforce authenticatePlatformAdmin() (role +
--                     MFA AAL2 + platform audit log). Plan / seat writes are
--                     intentionally NOT exposed to user JWTs, because RLS cannot
--                     enforce the AAL2 + audit-log requirements of those routes.
--   SECURITY DEFINER functions owned by postgres (reserve_employee_seat_atomic,
--   provision_organisation_atomic, ...) are unaffected: the table owner bypasses
--   RLS (FORCE ROW LEVEL SECURITY is deliberately NOT set).
--
-- This migration changes privileges and policies only. It does not read,
-- modify or delete any row.

BEGIN;

-- ---------------------------------------------------------------------------
-- 1. Enable Row Level Security
-- ---------------------------------------------------------------------------
ALTER TABLE public.subscription_plans              ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.subscription_plan_versions      ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.org_subscription_seat_purchases ENABLE ROW LEVEL SECURITY;

-- ---------------------------------------------------------------------------
-- 2. Remove all client privileges, then grant back the minimum.
--    TRUNCATE is not subject to RLS, so it must be revoked at the privilege level.
-- ---------------------------------------------------------------------------
REVOKE ALL ON TABLE public.subscription_plans              FROM PUBLIC, anon, authenticated;
REVOKE ALL ON TABLE public.subscription_plan_versions      FROM PUBLIC, anon, authenticated;
REVOKE ALL ON TABLE public.org_subscription_seat_purchases FROM PUBLIC, anon, authenticated;

GRANT SELECT ON TABLE public.subscription_plans              TO authenticated;
GRANT SELECT ON TABLE public.subscription_plan_versions      TO authenticated;
GRANT SELECT ON TABLE public.org_subscription_seat_purchases TO authenticated;

GRANT ALL ON TABLE public.subscription_plans              TO service_role;
GRANT ALL ON TABLE public.subscription_plan_versions      TO service_role;
GRANT ALL ON TABLE public.org_subscription_seat_purchases TO service_role;

-- ---------------------------------------------------------------------------
-- 3. Explicit read policies (idempotent)
-- ---------------------------------------------------------------------------
DROP POLICY IF EXISTS "platform_staff_read_subscription_plans" ON public.subscription_plans;
CREATE POLICY "platform_staff_read_subscription_plans"
  ON public.subscription_plans
  FOR SELECT
  TO authenticated
  USING (
    public.auth_is_platform_role(ARRAY[
      'super_admin'::public.platform_role,
      'platform_admin'::public.platform_role,
      'finance_admin'::public.platform_role,
      'sales_rep'::public.platform_role
    ])
  );

DROP POLICY IF EXISTS "platform_staff_read_subscription_plan_versions" ON public.subscription_plan_versions;
CREATE POLICY "platform_staff_read_subscription_plan_versions"
  ON public.subscription_plan_versions
  FOR SELECT
  TO authenticated
  USING (
    public.auth_is_platform_role(ARRAY[
      'super_admin'::public.platform_role,
      'platform_admin'::public.platform_role,
      'finance_admin'::public.platform_role,
      'sales_rep'::public.platform_role
    ])
  );

DROP POLICY IF EXISTS "platform_staff_read_seat_purchases" ON public.org_subscription_seat_purchases;
CREATE POLICY "platform_staff_read_seat_purchases"
  ON public.org_subscription_seat_purchases
  FOR SELECT
  TO authenticated
  USING (
    public.auth_is_platform_role(ARRAY[
      'super_admin'::public.platform_role,
      'platform_admin'::public.platform_role,
      'finance_admin'::public.platform_role
    ])
  );

DROP POLICY IF EXISTS "org_admins_read_own_seat_purchases" ON public.org_subscription_seat_purchases;
CREATE POLICY "org_admins_read_own_seat_purchases"
  ON public.org_subscription_seat_purchases
  FOR SELECT
  TO authenticated
  USING (public.auth_has_role_in_org(org_id, ARRAY['owner', 'admin']));

-- No INSERT / UPDATE / DELETE policies are defined for any client role.
-- With RLS enabled and no such privileges granted, every client-side write is denied.

COMMIT;
