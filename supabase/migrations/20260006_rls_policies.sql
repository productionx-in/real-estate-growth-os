-- supabase/migrations/20260006_rls_policies.sql
-- Row Level Security — every table locked to org_id from JWT

-- ─── Enable RLS on all tables ──────────────────────────────────────────────
ALTER TABLE organisations ENABLE ROW LEVEL SECURITY;
ALTER TABLE profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE org_members ENABLE ROW LEVEL SECURITY;
ALTER TABLE projects ENABLE ROW LEVEL SECURITY;
ALTER TABLE leads ENABLE ROW LEVEL SECURITY;
ALTER TABLE lead_activities ENABLE ROW LEVEL SECURITY;
ALTER TABLE lead_assignments ENABLE ROW LEVEL SECURITY;

-- ─── Helper functions ──────────────────────────────────────────────────────

-- Current user's profile id
CREATE OR REPLACE FUNCTION auth_profile_id()
RETURNS UUID AS $$
  SELECT id FROM profiles WHERE auth_user_id = auth.uid() LIMIT 1;
$$ LANGUAGE SQL SECURITY DEFINER STABLE;

-- Current user's org_id from JWT claims
CREATE OR REPLACE FUNCTION auth_org_id()
RETURNS UUID AS $$
  SELECT (auth.jwt() ->> 'org_id')::UUID;
$$ LANGUAGE SQL STABLE;

-- Current user's role from JWT claims
CREATE OR REPLACE FUNCTION auth_app_role()
RETURNS TEXT AS $$
  SELECT auth.jwt() ->> 'app_role';
$$ LANGUAGE SQL STABLE;

-- Check if current user is a manager or above
CREATE OR REPLACE FUNCTION is_manager()
RETURNS BOOLEAN AS $$
  SELECT auth_app_role() IN ('owner', 'admin', 'manager');
$$ LANGUAGE SQL STABLE;

-- Check if current user is admin or above
CREATE OR REPLACE FUNCTION is_admin()
RETURNS BOOLEAN AS $$
  SELECT auth_app_role() IN ('owner', 'admin');
$$ LANGUAGE SQL STABLE;

-- ─── organisations ─────────────────────────────────────────────────────────
-- Members can read their own org
CREATE POLICY "org_members_can_read_their_org" ON organisations
  FOR SELECT USING (
    id = auth_org_id()
  );

-- Only admins can update org settings
CREATE POLICY "admins_can_update_org" ON organisations
  FOR UPDATE USING (
    id = auth_org_id() AND is_admin()
  );

-- ─── profiles ──────────────────────────────────────────────────────────────
-- Users can read profiles in their org
CREATE POLICY "org_members_can_read_profiles" ON profiles
  FOR SELECT USING (
    id IN (
      SELECT profile_id FROM org_members WHERE org_id = auth_org_id()
    )
    OR auth_user_id = auth.uid()
  );

-- Users can update their own profile
CREATE POLICY "users_can_update_own_profile" ON profiles
  FOR UPDATE USING (auth_user_id = auth.uid());

-- Service role / trigger can insert profiles
CREATE POLICY "service_can_insert_profiles" ON profiles
  FOR INSERT WITH CHECK (true);

-- ─── org_members ───────────────────────────────────────────────────────────
CREATE POLICY "members_can_read_org_members" ON org_members
  FOR SELECT USING (org_id = auth_org_id());

CREATE POLICY "admins_can_insert_members" ON org_members
  FOR INSERT WITH CHECK (org_id = auth_org_id() AND is_admin());

CREATE POLICY "admins_can_update_member_roles" ON org_members
  FOR UPDATE USING (org_id = auth_org_id() AND is_admin());

CREATE POLICY "admins_can_remove_members" ON org_members
  FOR DELETE USING (org_id = auth_org_id() AND is_admin());

-- ─── projects ──────────────────────────────────────────────────────────────
CREATE POLICY "members_can_read_projects" ON projects
  FOR SELECT USING (org_id = auth_org_id());

CREATE POLICY "managers_can_insert_projects" ON projects
  FOR INSERT WITH CHECK (org_id = auth_org_id() AND is_manager());

CREATE POLICY "managers_can_update_projects" ON projects
  FOR UPDATE USING (org_id = auth_org_id() AND is_manager());

CREATE POLICY "admins_can_delete_projects" ON projects
  FOR DELETE USING (org_id = auth_org_id() AND is_admin());

-- ─── leads ─────────────────────────────────────────────────────────────────
-- Managers and above see ALL leads in their org
CREATE POLICY "managers_can_read_all_leads" ON leads
  FOR SELECT USING (
    org_id = auth_org_id() AND is_manager()
  );

-- sales_exec and readonly see ONLY their assigned leads
CREATE POLICY "sales_exec_reads_assigned_leads" ON leads
  FOR SELECT USING (
    org_id = auth_org_id()
    AND assigned_to = auth_profile_id()
    AND NOT is_manager()
  );

CREATE POLICY "members_can_insert_leads" ON leads
  FOR INSERT WITH CHECK (
    org_id = auth_org_id()
    AND auth_app_role() NOT IN ('readonly')
  );

CREATE POLICY "members_can_update_leads" ON leads
  FOR UPDATE USING (
    org_id = auth_org_id()
    AND (
      is_manager()
      OR assigned_to = auth_profile_id()
    )
    AND auth_app_role() NOT IN ('readonly')
  );

CREATE POLICY "managers_can_delete_leads" ON leads
  FOR DELETE USING (
    org_id = auth_org_id() AND is_manager()
  );

-- ─── lead_activities ───────────────────────────────────────────────────────
CREATE POLICY "members_can_read_activities" ON lead_activities
  FOR SELECT USING (
    lead_id IN (SELECT id FROM leads WHERE org_id = auth_org_id())
  );

CREATE POLICY "members_can_insert_activities" ON lead_activities
  FOR INSERT WITH CHECK (
    lead_id IN (SELECT id FROM leads WHERE org_id = auth_org_id())
    AND auth_app_role() NOT IN ('readonly')
  );

-- Activities are immutable — no UPDATE or DELETE policies

-- ─── lead_assignments ──────────────────────────────────────────────────────
CREATE POLICY "members_can_read_assignments" ON lead_assignments
  FOR SELECT USING (
    lead_id IN (SELECT id FROM leads WHERE org_id = auth_org_id())
  );

CREATE POLICY "managers_can_insert_assignments" ON lead_assignments
  FOR INSERT WITH CHECK (
    lead_id IN (SELECT id FROM leads WHERE org_id = auth_org_id())
    AND is_manager()
  );
