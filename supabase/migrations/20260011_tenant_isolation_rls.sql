-- supabase/migrations/20260011_tenant_isolation_rls.sql
-- Migration 0011: Multi-org tenant isolation policies.
-- Replaces single-org assumption with dynamic membership verification across all tables.

-- 1. Helper function: checks if authenticated user is a member of a given org
CREATE OR REPLACE FUNCTION auth_is_member_of_org(check_org_id uuid)
RETURNS BOOLEAN
SET search_path = public, pg_temp
SECURITY DEFINER
STABLE
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.org_members
    WHERE org_id = check_org_id
      AND profile_id = auth_profile_id()
  );
$$ LANGUAGE SQL;

REVOKE ALL ON FUNCTION auth_is_member_of_org(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION auth_is_member_of_org(uuid) TO authenticated, service_role;

-- 2. Helper function: checks if authenticated user has a specific minimum role in an org
CREATE OR REPLACE FUNCTION auth_has_role_in_org(check_org_id uuid, allowed_roles text[])
RETURNS BOOLEAN
SET search_path = public, pg_temp
SECURITY DEFINER
STABLE
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.org_members
    WHERE org_id = check_org_id
      AND profile_id = auth_profile_id()
      AND role::text = ANY(allowed_roles)
  );
$$ LANGUAGE SQL;

REVOKE ALL ON FUNCTION auth_has_role_in_org(uuid, text[]) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION auth_has_role_in_org(uuid, text[]) TO authenticated, service_role;

-- 3. Update organisations RLS
DROP POLICY IF EXISTS "org_members_can_read_their_org" ON organisations;
CREATE POLICY "org_members_can_read_their_org" ON organisations
  FOR SELECT USING (
    auth_is_member_of_org(id)
  );

DROP POLICY IF EXISTS "admins_can_update_org" ON organisations;
CREATE POLICY "admins_can_update_org" ON organisations
  FOR UPDATE USING (
    auth_has_role_in_org(id, ARRAY['owner', 'admin'])
  );

-- 4. Update org_members RLS
DROP POLICY IF EXISTS "members_can_read_org_members" ON org_members;
CREATE POLICY "members_can_read_org_members" ON org_members
  FOR SELECT USING (
    profile_id = auth_profile_id()
    OR auth_is_member_of_org(org_id)
  );

DROP POLICY IF EXISTS "admins_can_insert_members" ON org_members;
CREATE POLICY "admins_can_insert_members" ON org_members
  FOR INSERT WITH CHECK (
    auth_has_role_in_org(org_id, ARRAY['owner', 'admin'])
  );

DROP POLICY IF EXISTS "admins_can_update_member_roles" ON org_members;
CREATE POLICY "admins_can_update_member_roles" ON org_members
  FOR UPDATE USING (
    auth_has_role_in_org(org_id, ARRAY['owner', 'admin'])
  );

DROP POLICY IF EXISTS "admins_can_remove_members" ON org_members;
CREATE POLICY "admins_can_remove_members" ON org_members
  FOR DELETE USING (
    auth_has_role_in_org(org_id, ARRAY['owner', 'admin'])
  );

-- 5. Update projects RLS
DROP POLICY IF EXISTS "members_can_read_projects" ON projects;
CREATE POLICY "members_can_read_projects" ON projects
  FOR SELECT USING (
    auth_is_member_of_org(org_id)
  );

DROP POLICY IF EXISTS "managers_can_insert_projects" ON projects;
CREATE POLICY "managers_can_insert_projects" ON projects
  FOR INSERT WITH CHECK (
    auth_has_role_in_org(org_id, ARRAY['owner', 'admin', 'manager'])
  );

DROP POLICY IF EXISTS "managers_can_update_projects" ON projects;
CREATE POLICY "managers_can_update_projects" ON projects
  FOR UPDATE USING (
    auth_has_role_in_org(org_id, ARRAY['owner', 'admin', 'manager'])
  );

DROP POLICY IF EXISTS "admins_can_delete_projects" ON projects;
CREATE POLICY "admins_can_delete_projects" ON projects
  FOR DELETE USING (
    auth_has_role_in_org(org_id, ARRAY['owner', 'admin'])
  );

-- 6. Update inventory_items RLS
DROP POLICY IF EXISTS "members_can_read_inventory" ON inventory_items;
CREATE POLICY "members_can_read_inventory" ON inventory_items
  FOR SELECT USING (
    auth_is_member_of_org(org_id)
  );

DROP POLICY IF EXISTS "managers_can_insert_inventory" ON inventory_items;
CREATE POLICY "managers_can_insert_inventory" ON inventory_items
  FOR INSERT WITH CHECK (
    auth_has_role_in_org(org_id, ARRAY['owner', 'admin', 'manager'])
  );

DROP POLICY IF EXISTS "managers_can_update_inventory" ON inventory_items;
CREATE POLICY "managers_can_update_inventory" ON inventory_items
  FOR UPDATE USING (
    auth_has_role_in_org(org_id, ARRAY['owner', 'admin', 'manager'])
  );

DROP POLICY IF EXISTS "admins_can_delete_inventory" ON inventory_items;
CREATE POLICY "admins_can_delete_inventory" ON inventory_items
  FOR DELETE USING (
    auth_has_role_in_org(org_id, ARRAY['owner', 'admin'])
  );

-- 7. Update leads RLS
DROP POLICY IF EXISTS "members_can_read_leads" ON leads;
CREATE POLICY "members_can_read_leads" ON leads
  FOR SELECT USING (
    auth_is_member_of_org(org_id)
    AND (
      auth_has_role_in_org(org_id, ARRAY['owner', 'admin', 'manager'])
      OR assigned_to = auth_profile_id()
    )
  );
