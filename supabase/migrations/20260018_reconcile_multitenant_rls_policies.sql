-- ============================================================================
-- supabase/migrations/20260018_reconcile_multitenant_rls_policies.sql
-- Migration 0018: Consolidated Multi-Tenant RLS Reconciliation,
-- Hierarchy Concurrency & Depth Defense, Lead Assignment Pipeline,
-- and Append-Only History Enforcement
--
-- TARGET DATABASE: Supabase connected to Vercel Production (PostgreSQL 17.11)
-- PREREQUISITES:
--   - Applied migrations: 20260001 through 20260017
-- ============================================================================

BEGIN;

SET LOCAL lock_timeout = '4s';

-- ============================================================================
-- 1. Table: public.leads (RLS Policies)
-- ============================================================================
DROP POLICY IF EXISTS "managers_can_read_all_leads" ON public.leads;
DROP POLICY IF EXISTS "sales_exec_reads_assigned_leads" ON public.leads;
DROP POLICY IF EXISTS "members_can_read_leads" ON public.leads;
DROP POLICY IF EXISTS "members_can_insert_leads" ON public.leads;
DROP POLICY IF EXISTS "members_can_update_leads" ON public.leads;
DROP POLICY IF EXISTS "managers_can_delete_leads" ON public.leads;

CREATE POLICY "managers_can_read_all_leads" ON public.leads
  FOR SELECT USING (public.auth_has_role_in_org(org_id, ARRAY['owner', 'admin', 'manager']));

CREATE POLICY "sales_exec_reads_assigned_leads" ON public.leads
  FOR SELECT USING (
    assigned_to = public.auth_profile_id()
    AND public.auth_has_role_in_org(org_id, ARRAY['sales_exec'])
  );

CREATE POLICY "members_can_insert_leads" ON public.leads
  FOR INSERT WITH CHECK (
    public.auth_has_role_in_org(org_id, ARRAY['owner', 'admin', 'manager', 'sales_exec'])
  );

CREATE POLICY "members_can_update_leads" ON public.leads
  FOR UPDATE
  USING (
    public.auth_has_role_in_org(org_id, ARRAY['owner', 'admin', 'manager'])
    OR (assigned_to = public.auth_profile_id() AND public.auth_has_role_in_org(org_id, ARRAY['sales_exec']))
  )
  WITH CHECK (
    public.auth_has_role_in_org(org_id, ARRAY['owner', 'admin', 'manager'])
    OR (assigned_to = public.auth_profile_id() AND public.auth_has_role_in_org(org_id, ARRAY['sales_exec']))
  );

CREATE POLICY "managers_can_delete_leads" ON public.leads
  FOR DELETE USING (public.auth_has_role_in_org(org_id, ARRAY['owner', 'admin', 'manager']));

-- ============================================================================
-- 2. Table: public.lead_activities (RLS Policies)
-- ============================================================================
DROP POLICY IF EXISTS "members_can_read_activities" ON public.lead_activities;
DROP POLICY IF EXISTS "members_can_insert_activities" ON public.lead_activities;

CREATE POLICY "members_can_read_activities" ON public.lead_activities
  FOR SELECT USING (
    EXISTS (
      SELECT 1 FROM public.leads l
      WHERE l.id = lead_activities.lead_id
        AND (
          public.auth_has_role_in_org(l.org_id, ARRAY['owner', 'admin', 'manager'])
          OR (l.assigned_to = public.auth_profile_id() AND public.auth_has_role_in_org(l.org_id, ARRAY['sales_exec']))
        )
    )
  );

CREATE POLICY "members_can_insert_activities" ON public.lead_activities
  FOR INSERT WITH CHECK (
    actor_id = public.auth_profile_id()
    AND EXISTS (
      SELECT 1 FROM public.leads l
      WHERE l.id = lead_activities.lead_id
        AND (
          public.auth_has_role_in_org(l.org_id, ARRAY['owner', 'admin', 'manager'])
          OR (l.assigned_to = public.auth_profile_id() AND public.auth_has_role_in_org(l.org_id, ARRAY['sales_exec']))
        )
    )
  );

-- ============================================================================
-- 3. Table: public.lead_assignments (RLS Policies)
-- ============================================================================
DROP POLICY IF EXISTS "members_can_read_assignments" ON public.lead_assignments;
DROP POLICY IF EXISTS "managers_can_insert_assignments" ON public.lead_assignments;

CREATE POLICY "members_can_read_assignments" ON public.lead_assignments
  FOR SELECT USING (
    EXISTS (
      SELECT 1 FROM public.leads l
      WHERE l.id = lead_assignments.lead_id
        AND (
          public.auth_has_role_in_org(l.org_id, ARRAY['owner', 'admin', 'manager'])
          OR (l.assigned_to = public.auth_profile_id() AND public.auth_has_role_in_org(l.org_id, ARRAY['sales_exec']))
        )
    )
  );

CREATE POLICY "managers_can_insert_assignments" ON public.lead_assignments
  FOR INSERT WITH CHECK (
    assigned_by = public.auth_profile_id()
    AND EXISTS (
      SELECT 1 FROM public.leads l
      WHERE l.id = lead_assignments.lead_id
        AND public.auth_has_role_in_org(l.org_id, ARRAY['owner', 'admin', 'manager'])
    )
  );

-- ============================================================================
-- 4. Table: public.project_hierarchy_nodes (RLS Policies)
-- ============================================================================
DROP POLICY IF EXISTS "members_can_read_hierarchy_nodes" ON public.project_hierarchy_nodes;
DROP POLICY IF EXISTS "managers_can_insert_hierarchy_nodes" ON public.project_hierarchy_nodes;
DROP POLICY IF EXISTS "managers_can_update_hierarchy_nodes" ON public.project_hierarchy_nodes;
DROP POLICY IF EXISTS "admins_can_delete_hierarchy_nodes" ON public.project_hierarchy_nodes;

CREATE POLICY "members_can_read_hierarchy_nodes" ON public.project_hierarchy_nodes
  FOR SELECT USING (public.auth_is_member_of_org(org_id));

CREATE POLICY "managers_can_insert_hierarchy_nodes" ON public.project_hierarchy_nodes
  FOR INSERT WITH CHECK (public.auth_has_role_in_org(org_id, ARRAY['owner', 'admin', 'manager']));

CREATE POLICY "managers_can_update_hierarchy_nodes" ON public.project_hierarchy_nodes
  FOR UPDATE
  USING (public.auth_has_role_in_org(org_id, ARRAY['owner', 'admin', 'manager']))
  WITH CHECK (public.auth_has_role_in_org(org_id, ARRAY['owner', 'admin', 'manager']));

CREATE POLICY "admins_can_delete_hierarchy_nodes" ON public.project_hierarchy_nodes
  FOR DELETE USING (public.auth_has_role_in_org(org_id, ARRAY['owner', 'admin']));

-- ============================================================================
-- 5. Table: public.inventory_status_history (RLS Policies)
-- ============================================================================
DROP POLICY IF EXISTS "members_can_read_inventory_history" ON public.inventory_status_history;
DROP POLICY IF EXISTS "members_can_insert_inventory_history" ON public.inventory_status_history;

CREATE POLICY "members_can_read_inventory_history" ON public.inventory_status_history
  FOR SELECT USING (public.auth_is_member_of_org(org_id));

-- ============================================================================
-- 6. Lead Assignment 3-Stage Pipeline Triggers
-- ============================================================================

-- STAGE 1: Check submitted input before auto-assignment runs
CREATE OR REPLACE FUNCTION public.check_lead_assignment_input()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public, pg_temp
AS $$
DECLARE
  v_caller_role public.member_role;
BEGIN
  -- Strict engine-level immutability: block changing org_id on UPDATE
  IF TG_OP = 'UPDATE' AND OLD.org_id IS DISTINCT FROM NEW.org_id THEN
    RAISE EXCEPTION 'Lead organisation ownership is immutable (attempted change from % to %)',
      OLD.org_id, NEW.org_id
      USING ERRCODE = 'check_violation';
  END IF;

  IF auth.uid() IS NOT NULL THEN
    SELECT om.role INTO v_caller_role
    FROM public.org_members om
    WHERE om.org_id = NEW.org_id
      AND om.profile_id = public.auth_profile_id();

    IF v_caller_role = 'sales_exec' THEN
      IF TG_OP = 'INSERT' AND NEW.assigned_to IS NOT NULL AND NEW.assigned_to IS DISTINCT FROM public.auth_profile_id() THEN
        RAISE EXCEPTION 'Sales executives can only assign leads to themselves on creation, or leave unassigned for automatic distribution'
          USING ERRCODE = 'insufficient_privilege';
      END IF;

      IF TG_OP = 'UPDATE' AND NEW.assigned_to IS DISTINCT FROM OLD.assigned_to THEN
        RAISE EXCEPTION 'Sales executives are not permitted to reassign leads'
          USING ERRCODE = 'insufficient_privilege';
      END IF;
    END IF;
  END IF;

  RETURN NEW;
END;
$$;

REVOKE ALL ON FUNCTION public.check_lead_assignment_input() FROM PUBLIC, anon, authenticated;

DROP TRIGGER IF EXISTS trigger_01_check_lead_assignment_input ON public.leads;
CREATE TRIGGER trigger_01_check_lead_assignment_input
  BEFORE INSERT OR UPDATE OF assigned_to, org_id ON public.leads
  FOR EACH ROW
  EXECUTE FUNCTION public.check_lead_assignment_input();

-- STAGE 2: Auto-assignment trigger
DROP TRIGGER IF EXISTS trigger_auto_assign_lead ON public.leads;
DROP TRIGGER IF EXISTS trigger_02_auto_assign_lead ON public.leads;
CREATE TRIGGER trigger_02_auto_assign_lead
  BEFORE INSERT ON public.leads
  FOR EACH ROW
  EXECUTE FUNCTION public.auto_assign_lead();

-- STAGE 3: Final validation of assigned_to
CREATE OR REPLACE FUNCTION public.validate_lead_assigned_to()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public, pg_temp
AS $$
DECLARE
  v_assignee_role public.member_role;
BEGIN
  IF NEW.assigned_to IS NOT NULL THEN
    SELECT om.role INTO v_assignee_role
    FROM public.org_members om
    WHERE om.org_id = NEW.org_id
      AND om.profile_id = NEW.assigned_to;

    IF v_assignee_role IS NULL THEN
      RAISE EXCEPTION 'Cross-tenant assignment rejected: assignee % is not an active member of organisation %',
        NEW.assigned_to, NEW.org_id
        USING ERRCODE = 'integrity_constraint_violation';
    END IF;

    IF v_assignee_role = 'readonly' THEN
      RAISE EXCEPTION 'Assignment rejected: member % has readonly role and cannot be assigned leads',
        NEW.assigned_to
        USING ERRCODE = 'check_violation';
    END IF;
  END IF;

  RETURN NEW;
END;
$$;

REVOKE ALL ON FUNCTION public.validate_lead_assigned_to() FROM PUBLIC, anon, authenticated;

DROP TRIGGER IF EXISTS trigger_validate_lead_assigned_to ON public.leads;
DROP TRIGGER IF EXISTS trigger_03_validate_lead_assigned_to ON public.leads;
CREATE TRIGGER trigger_03_validate_lead_assigned_to
  BEFORE INSERT OR UPDATE OF assigned_to, org_id ON public.leads
  FOR EACH ROW
  EXECUTE FUNCTION public.validate_lead_assigned_to();

-- ============================================================================
-- 7. Table: public.lead_assignments (Row-Level Immutable Audit Defense)
-- ============================================================================
CREATE OR REPLACE FUNCTION public.check_lead_assignment_integrity()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public, pg_temp
AS $$
DECLARE
  v_lead_org UUID;
  v_assignee_role public.member_role;
  v_assigner_role public.member_role;
BEGIN
  -- Block UPDATE unconditionally
  IF TG_OP = 'UPDATE' THEN
    RAISE EXCEPTION 'lead_assignments records are immutable: UPDATE operations are prohibited'
      USING ERRCODE = 'check_violation';
  END IF;

  -- Block direct DELETE; allow parent lead cascading DELETE
  IF TG_OP = 'DELETE' THEN
    IF EXISTS (SELECT 1 FROM public.leads WHERE id = OLD.lead_id) THEN
      RAISE EXCEPTION 'Direct deletion of lead_assignments records is prohibited. Records can only be removed via parent lead deletion.'
        USING ERRCODE = 'check_violation';
    END IF;
    RETURN OLD;
  END IF;

  -- INSERT validation
  SELECT l.org_id INTO v_lead_org FROM public.leads l WHERE l.id = NEW.lead_id;
  IF v_lead_org IS NULL THEN
    RAISE EXCEPTION 'Lead % not found', NEW.lead_id USING ERRCODE = 'foreign_key_violation';
  END IF;

  SELECT om.role INTO v_assignee_role FROM public.org_members om WHERE om.org_id = v_lead_org AND om.profile_id = NEW.assigned_to;
  IF v_assignee_role IS NULL THEN
    RAISE EXCEPTION 'Assignee % is not an active member of organisation %', NEW.assigned_to, v_lead_org USING ERRCODE = 'integrity_constraint_violation';
  END IF;
  IF v_assignee_role = 'readonly' THEN
    RAISE EXCEPTION 'Assignee % cannot be assigned leads (readonly)', NEW.assigned_to USING ERRCODE = 'check_violation';
  END IF;

  SELECT om.role INTO v_assigner_role FROM public.org_members om WHERE om.org_id = v_lead_org AND om.profile_id = NEW.assigned_by;
  IF v_assigner_role IS NULL OR v_assigner_role NOT IN ('owner', 'admin', 'manager') THEN
    RAISE EXCEPTION 'Assigner % lacks management role in organisation %', NEW.assigned_by, v_lead_org USING ERRCODE = 'insufficient_privilege';
  END IF;

  RETURN NEW;
END;
$$;

REVOKE ALL ON FUNCTION public.check_lead_assignment_integrity() FROM PUBLIC, anon, authenticated;

DROP TRIGGER IF EXISTS trg_lead_assignment_integrity ON public.lead_assignments;
CREATE TRIGGER trg_lead_assignment_integrity
  BEFORE INSERT OR UPDATE OR DELETE ON public.lead_assignments
  FOR EACH ROW
  EXECUTE FUNCTION public.check_lead_assignment_integrity();

-- ============================================================================
-- 8. Table: public.lead_assignments (Statement-Level TRUNCATE Defense)
-- ============================================================================
CREATE OR REPLACE FUNCTION public.prevent_lead_assignment_truncate()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public, pg_temp
AS $$
BEGIN
  RAISE EXCEPTION 'lead_assignments audit history cannot be truncated: TRUNCATE is strictly prohibited'
    USING ERRCODE = 'check_violation';
END;
$$;

REVOKE ALL ON FUNCTION public.prevent_lead_assignment_truncate() FROM PUBLIC, anon, authenticated;

DROP TRIGGER IF EXISTS trg_lead_assignments_prevent_truncate ON public.lead_assignments;
CREATE TRIGGER trg_lead_assignments_prevent_truncate
  BEFORE TRUNCATE ON public.lead_assignments
  FOR EACH STATEMENT
  EXECUTE FUNCTION public.prevent_lead_assignment_truncate();

-- ============================================================================
-- 9. Table: public.project_hierarchy_nodes (Deadlock-Free, Fail-Closed Depth Defense)
-- ============================================================================
CREATE OR REPLACE FUNCTION public.check_hierarchy_node_tenant_integrity()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public, pg_temp
AS $$
DECLARE
  v_proj_org UUID;
  v_parent_org UUID;
  v_parent_proj UUID;
  v_parent_depth INT := 0;
  v_new_node_depth INT := 1;
  v_subtree_height INT := 0;
  v_is_cycle BOOLEAN := FALSE;
  v_is_overflow BOOLEAN := FALSE;
  v_is_ancestor BOOLEAN := FALSE;
BEGIN
  -- 1. Immutability of organization ownership
  IF TG_OP = 'UPDATE' AND OLD.org_id IS DISTINCT FROM NEW.org_id THEN
    RAISE EXCEPTION 'Hierarchy node organisation ownership is immutable (attempted change from % to %)',
      OLD.org_id, NEW.org_id
      USING ERRCODE = 'check_violation';
  END IF;

  -- 2. Immutability of project ownership (protects descendants and associated inventory)
  IF TG_OP = 'UPDATE' AND OLD.project_id IS DISTINCT FROM NEW.project_id THEN
    RAISE EXCEPTION 'Hierarchy node project ownership is immutable (attempted change from % to %)',
      OLD.project_id, NEW.project_id
      USING ERRCODE = 'check_violation';
  END IF;

  -- 3. UNCONDITIONAL Project Serialization: acquire exclusive project advisory lock
  -- Serializes every INSERT and UPDATE (including root moves and root inserts)
  PERFORM pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtext('project_hierarchy_tree'),
    pg_catalog.hashtext(NEW.project_id::text)
  );

  -- 4. Ensure referenced project belongs to node's organisation
  SELECT p.org_id INTO v_proj_org
  FROM public.projects p
  WHERE p.id = NEW.project_id;

  IF v_proj_org IS NULL OR v_proj_org IS DISTINCT FROM NEW.org_id THEN
    RAISE EXCEPTION 'Cross-tenant project hierarchy rejected: project % belongs to org %, node belongs to org %',
      NEW.project_id, v_proj_org, NEW.org_id
      USING ERRCODE = 'foreign_key_violation';
  END IF;

  -- 5. Proposed Parent Validation (when parent_id is specified)
  IF NEW.parent_id IS NOT NULL THEN
    -- Direct self-reference check (INSERT and UPDATE)
    IF NEW.id IS NOT NULL AND NEW.parent_id = NEW.id THEN
      RAISE EXCEPTION 'Hierarchy cycle rejected: node cannot be its own parent'
        USING ERRCODE = 'check_violation';
    END IF;

    -- Plain read: verifies parent exists WITHOUT row locking (deadlock elimination)
    SELECT phn.org_id, phn.project_id INTO v_parent_org, v_parent_proj
    FROM public.project_hierarchy_nodes phn
    WHERE phn.id = NEW.parent_id;

    IF NOT FOUND THEN
      RAISE EXCEPTION 'Parent hierarchy node % does not exist', NEW.parent_id
        USING ERRCODE = 'foreign_key_violation';
    END IF;

    IF v_parent_org IS DISTINCT FROM NEW.org_id THEN
      RAISE EXCEPTION 'Cross-tenant parent hierarchy node rejected: parent belongs to org %, node belongs to org %',
        v_parent_org, NEW.org_id
        USING ERRCODE = 'foreign_key_violation';
    END IF;

    IF v_parent_proj IS DISTINCT FROM NEW.project_id THEN
      RAISE EXCEPTION 'Cross-project hierarchy node rejected: parent belongs to project %, node belongs to project %',
        v_parent_proj, NEW.project_id
        USING ERRCODE = 'foreign_key_violation';
    END IF;

    -- Fail-closed parent ancestor chain traversal
    WITH RECURSIVE parent_chain AS (
      SELECT 
        id, 
        parent_id, 
        1 AS depth, 
        ARRAY[id] AS visited,
        FALSE AS is_cycle,
        FALSE AS is_overflow
      FROM public.project_hierarchy_nodes
      WHERE id = NEW.parent_id
      UNION ALL
      SELECT 
        p.id, 
        p.parent_id, 
        pc.depth + 1, 
        pc.visited || p.id,
        p.id = ANY(pc.visited) AS is_cycle,
        pc.depth >= 21 AS is_overflow
      FROM public.project_hierarchy_nodes p
      JOIN parent_chain pc ON pc.parent_id = p.id
      WHERE NOT pc.is_cycle AND NOT pc.is_overflow
    )
    SELECT 
      COALESCE(bool_or(is_cycle), FALSE),
      COALESCE(bool_or(is_overflow), FALSE),
      COALESCE(max(depth), 0),
      COALESCE(bool_or(id = NEW.id), FALSE)
    INTO STRICT
      v_is_cycle,
      v_is_overflow,
      v_parent_depth,
      v_is_ancestor
    FROM parent_chain;

    -- Explicit Fail-Closed Exceptions
    IF v_is_cycle THEN
      RAISE EXCEPTION 'Hierarchy integrity violation: cycle detected in parent ancestor chain'
        USING ERRCODE = 'check_violation';
    END IF;

    IF v_is_overflow OR v_parent_depth >= 20 THEN
      RAISE EXCEPTION 'Hierarchy depth limit exceeded: parent node is at depth %; maximum allowed hierarchy depth is 20 levels',
        v_parent_depth
        USING ERRCODE = 'check_violation';
    END IF;

    IF TG_OP = 'UPDATE' AND v_is_ancestor THEN
      RAISE EXCEPTION 'Hierarchy cycle rejected: node % is an ancestor of proposed parent node %',
        NEW.id, NEW.parent_id
        USING ERRCODE = 'check_violation';
    END IF;

    v_new_node_depth := v_parent_depth + 1;
  ELSE
    -- Moving to Root or Inserting at Root: Root depth = 1
    v_new_node_depth := 1;
  END IF;

  -- 6. Descendant Subtree Validation on UPDATE (Executed for BOTH moves to parent and moves to root)
  IF TG_OP = 'UPDATE' THEN
    WITH RECURSIVE subtree AS (
      SELECT 
        id, 
        0 AS height, 
        ARRAY[id] AS visited,
        FALSE AS is_cycle,
        FALSE AS is_overflow
      FROM public.project_hierarchy_nodes
      WHERE id = NEW.id
      UNION ALL
      SELECT 
        c.id, 
        s.height + 1, 
        s.visited || c.id,
        c.id = ANY(s.visited) AS is_cycle,
        s.height >= 21 AS is_overflow
      FROM public.project_hierarchy_nodes c
      JOIN subtree s ON s.id = c.parent_id
      WHERE NOT s.is_cycle AND NOT s.is_overflow
    )
    SELECT 
      COALESCE(bool_or(is_cycle), FALSE),
      COALESCE(bool_or(is_overflow), FALSE),
      COALESCE(max(height), 0)
    INTO STRICT
      v_is_cycle,
      v_is_overflow,
      v_subtree_height
    FROM subtree;

    IF v_is_cycle THEN
      RAISE EXCEPTION 'Hierarchy integrity violation: cycle detected in descendant subtree'
        USING ERRCODE = 'check_violation';
    END IF;

    IF v_is_overflow OR v_subtree_height > 20 THEN
      RAISE EXCEPTION 'Hierarchy depth limit exceeded: descendant subtree height is %; maximum allowed hierarchy depth is 20 levels',
        v_subtree_height
        USING ERRCODE = 'check_violation';
    END IF;

    IF (v_new_node_depth + v_subtree_height) > 20 THEN
      RAISE EXCEPTION 'Hierarchy depth limit exceeded: moving this node would cause deepest descendant to reach depth % (maximum allowed is 20 levels)',
        (v_new_node_depth + v_subtree_height)
        USING ERRCODE = 'check_violation';
    END IF;
  END IF;

  RETURN NEW;
END;
$$;

REVOKE ALL ON FUNCTION public.check_hierarchy_node_tenant_integrity() FROM PUBLIC, anon, authenticated;

-- Drop legacy trigger from Migration 0012 and replace cleanly
DROP TRIGGER IF EXISTS trg_validate_hierarchy_node_consistency ON public.project_hierarchy_nodes;
DROP TRIGGER IF EXISTS trg_check_hierarchy_node_tenant_integrity ON public.project_hierarchy_nodes;
CREATE TRIGGER trg_check_hierarchy_node_tenant_integrity
  BEFORE INSERT OR UPDATE OF org_id, project_id, parent_id ON public.project_hierarchy_nodes
  FOR EACH ROW
  EXECUTE FUNCTION public.check_hierarchy_node_tenant_integrity();

-- ============================================================================
-- 10. Table: public.org_members (Member Removal Cleanup Trigger)
-- ============================================================================
CREATE OR REPLACE FUNCTION public.handle_member_removal_from_leads()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public, pg_temp
AS $$
DECLARE
  v_lead_record RECORD;
  v_remover_profile_id UUID;
  v_action_source TEXT;
BEGIN
  IF auth.uid() IS NOT NULL THEN
    v_remover_profile_id := public.auth_profile_id();
    v_action_source := 'authenticated_admin';
  ELSE
    SELECT om.profile_id INTO v_remover_profile_id
    FROM public.org_members om
    WHERE om.org_id = OLD.org_id
      AND om.role = 'owner'
    ORDER BY om.joined_at ASC
    LIMIT 1;

    IF v_remover_profile_id IS NULL THEN
      SELECT om.profile_id INTO v_remover_profile_id
      FROM public.org_members om
      WHERE om.org_id = OLD.org_id
        AND om.role = 'admin'
      ORDER BY om.joined_at ASC
      LIMIT 1;
    END IF;

    v_action_source := 'service_role_system';
  END IF;

  FOR v_lead_record IN
    SELECT id FROM public.leads
    WHERE org_id = OLD.org_id
      AND assigned_to = OLD.profile_id
  LOOP
    UPDATE public.leads
    SET assigned_to = NULL,
        updated_at = pg_catalog.now()
    WHERE id = v_lead_record.id;

    IF v_remover_profile_id IS NOT NULL THEN
      INSERT INTO public.lead_activities (
        lead_id, actor_id, type, note, metadata, created_at
      ) VALUES (
        v_lead_record.id,
        v_remover_profile_id,
        'assigned'::public.activity_type,
        'Lead unassigned due to team member departure',
        pg_catalog.jsonb_build_object(
          'unassigned_from', OLD.profile_id,
          'departed_role', OLD.role,
          'action_source', v_action_source,
          'reason', 'member_removed'
        ),
        pg_catalog.now()
      );
    END IF;
  END LOOP;

  RETURN OLD;
END;
$$;

REVOKE ALL ON FUNCTION public.handle_member_removal_from_leads() FROM PUBLIC, anon, authenticated;

DROP TRIGGER IF EXISTS trigger_handle_member_removal_from_leads ON public.org_members;
CREATE TRIGGER trigger_handle_member_removal_from_leads
  AFTER DELETE ON public.org_members
  FOR EACH ROW
  EXECUTE FUNCTION public.handle_member_removal_from_leads();

COMMIT;
