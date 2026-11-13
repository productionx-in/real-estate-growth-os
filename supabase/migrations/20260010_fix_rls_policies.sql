-- supabase/migrations/20260010_fix_rls_policies.sql
-- Migration 0010: Resilient RLS fallback policies.
-- Ensures queries work reliably even when custom JWT claims hook is not registered in Supabase Dashboard.

-- 1. Helper function to get current user's profile ID
CREATE OR REPLACE FUNCTION auth_profile_id()
RETURNS UUID AS $$
  SELECT id FROM public.profiles WHERE auth_user_id = auth.uid() LIMIT 1;
$$ LANGUAGE SQL SECURITY DEFINER STABLE;

-- 2. Helper function to get current user's org ID with database fallback
CREATE OR REPLACE FUNCTION auth_org_id()
RETURNS UUID AS $$
  SELECT COALESCE(
    (auth.jwt() ->> 'org_id')::UUID,
    (SELECT org_id FROM public.org_members WHERE profile_id = auth_profile_id() ORDER BY joined_at ASC LIMIT 1)
  );
$$ LANGUAGE SQL SECURITY DEFINER STABLE;

-- 3. organisations: Allow members to read organisations they belong to
DROP POLICY IF EXISTS "org_members_can_read_their_org" ON organisations;
CREATE POLICY "org_members_can_read_their_org" ON organisations
  FOR SELECT USING (
    id IN (
      SELECT org_id FROM public.org_members WHERE profile_id = auth_profile_id()
    )
  );

-- 4. org_members: Allow members to read memberships for their org or themselves
DROP POLICY IF EXISTS "members_can_read_org_members" ON org_members;
CREATE POLICY "members_can_read_org_members" ON org_members
  FOR SELECT USING (
    profile_id = auth_profile_id()
    OR org_id IN (
      SELECT org_id FROM public.org_members WHERE profile_id = auth_profile_id()
    )
  );

-- 5. projects: Allow members to read projects in their org
DROP POLICY IF EXISTS "members_can_read_projects" ON projects;
CREATE POLICY "members_can_read_projects" ON projects
  FOR SELECT USING (
    org_id IN (
      SELECT org_id FROM public.org_members WHERE profile_id = auth_profile_id()
    )
  );

-- 6. inventory_items: Allow members to read inventory in their org
DROP POLICY IF EXISTS "members_can_read_inventory" ON inventory_items;
CREATE POLICY "members_can_read_inventory" ON inventory_items
  FOR SELECT USING (
    org_id IN (
      SELECT org_id FROM public.org_members WHERE profile_id = auth_profile_id()
    )
  );

-- 7. leads: Allow members to read leads in their org
DROP POLICY IF EXISTS "members_can_read_leads" ON leads;
CREATE POLICY "members_can_read_leads" ON leads
  FOR SELECT USING (
    org_id IN (
      SELECT org_id FROM public.org_members WHERE profile_id = auth_profile_id()
    )
  );
