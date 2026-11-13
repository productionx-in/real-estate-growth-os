-- supabase/migrations/20260012_inventory_integrity.sql
-- Migration 0012: Comprehensive Inventory Integrity & Atomic State Transitions
-- Enforces:
-- 1. Inventory-to-project organisation consistency
-- 2. Hierarchy parent/project consistency & self-reference prevention
-- 3. Inventory category vs project category validation
-- 4. Atomic inventory status transitions with row locking, transition rules & audit history

-- 1. Trigger function: Ensure hierarchy nodes belong to same project & org as their parent
CREATE OR REPLACE FUNCTION validate_hierarchy_node_consistency()
RETURNS TRIGGER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_parent_project_id UUID;
  v_parent_org_id UUID;
BEGIN
  IF NEW.parent_id IS NOT NULL THEN
    IF NEW.parent_id = NEW.id THEN
      RAISE EXCEPTION 'Hierarchy node cannot be its own parent';
    END IF;

    SELECT project_id, org_id INTO v_parent_project_id, v_parent_org_id
    FROM project_hierarchy_nodes
    WHERE id = NEW.parent_id;

    IF NOT FOUND THEN
      RAISE EXCEPTION 'Parent hierarchy node % does not exist', NEW.parent_id;
    END IF;

    IF v_parent_project_id <> NEW.project_id OR v_parent_org_id <> NEW.org_id THEN
      RAISE EXCEPTION 'Parent hierarchy node belongs to project % / org %, expected project % / org %',
        v_parent_project_id, v_parent_org_id, NEW.project_id, NEW.org_id;
    END IF;
  END IF;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_validate_hierarchy_node_consistency ON project_hierarchy_nodes;
CREATE TRIGGER trg_validate_hierarchy_node_consistency
  BEFORE INSERT OR UPDATE ON project_hierarchy_nodes
  FOR EACH ROW EXECUTE FUNCTION validate_hierarchy_node_consistency();

-- 2. Trigger function: Ensure inventory item consistency (org match, category match, hierarchy node match)
CREATE OR REPLACE FUNCTION validate_inventory_item_integrity()
RETURNS TRIGGER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_proj_org_id UUID;
  v_proj_category project_category;
  v_node_project_id UUID;
  v_node_org_id UUID;
BEGIN
  -- Verify project exists and get org & category
  SELECT org_id, category INTO v_proj_org_id, v_proj_category
  FROM projects
  WHERE id = NEW.project_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Project % does not exist', NEW.project_id;
  END IF;

  -- Ensure inventory item org matches project org
  IF NEW.org_id <> v_proj_org_id THEN
    RAISE EXCEPTION 'Inventory item organisation (%) does not match project organisation (%)',
      NEW.org_id, v_proj_org_id;
  END IF;

  -- Ensure category matches project category (unless project is mixed_use)
  IF v_proj_category <> 'mixed_use' AND NEW.category <> v_proj_category THEN
    RAISE EXCEPTION 'Inventory item category (%) cannot differ from project category (%) unless project is mixed_use',
      NEW.category, v_proj_category;
  END IF;

  -- Ensure hierarchy node belongs to this project and organisation
  IF NEW.hierarchy_node_id IS NOT NULL THEN
    SELECT project_id, org_id INTO v_node_project_id, v_node_org_id
    FROM project_hierarchy_nodes
    WHERE id = NEW.hierarchy_node_id;

    IF NOT FOUND THEN
      RAISE EXCEPTION 'Hierarchy node % does not exist', NEW.hierarchy_node_id;
    END IF;

    IF v_node_project_id <> NEW.project_id OR v_node_org_id <> NEW.org_id THEN
      RAISE EXCEPTION 'Hierarchy node belongs to project % / org %, expected project % / org %',
        v_node_project_id, v_node_org_id, NEW.project_id, NEW.org_id;
    END IF;
  END IF;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_validate_inventory_item_integrity ON inventory_items;
CREATE TRIGGER trg_validate_inventory_item_integrity
  BEFORE INSERT OR UPDATE ON inventory_items
  FOR EACH ROW EXECUTE FUNCTION validate_inventory_item_integrity();

-- 3. Atomic status transition stored procedure with row-level locking, transition rules & audit logging
CREATE OR REPLACE FUNCTION transition_inventory_status_atomic(
  p_inventory_id UUID,
  p_expected_status inventory_status,
  p_new_status inventory_status,
  p_changed_by UUID,
  p_reason TEXT DEFAULT NULL,
  p_metadata JSONB DEFAULT '{}'::jsonb
)
RETURNS TABLE (
  id UUID,
  org_id UUID,
  project_id UUID,
  unit_number TEXT,
  status inventory_status
)
SET search_path = public, pg_temp
SECURITY DEFINER
AS $$
DECLARE
  v_current_status inventory_status;
  v_org_id UUID;
  v_project_id UUID;
  v_unit_number TEXT;
  v_is_valid_transition BOOLEAN := FALSE;
  v_caller_role member_role;
BEGIN
  -- Row-level locking to prevent race conditions during status transition
  SELECT inv.status, inv.org_id, inv.project_id, inv.unit_number
  INTO v_current_status, v_org_id, v_project_id, v_unit_number
  FROM inventory_items inv
  WHERE inv.id = p_inventory_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Inventory unit % not found', p_inventory_id;
  END IF;

  -- Optimistic concurrency check
  IF v_current_status <> p_expected_status THEN
    RAISE EXCEPTION 'Concurrent modification conflict: inventory status is %, expected %',
      v_current_status, p_expected_status;
  END IF;

  -- Validate state machine transitions
  IF v_current_status = 'available' AND p_new_status IN ('on_hold', 'booked', 'blocked') THEN
    v_is_valid_transition := TRUE;
  ELSIF v_current_status = 'on_hold' AND p_new_status IN ('available', 'booked') THEN
    v_is_valid_transition := TRUE;
  ELSIF v_current_status = 'booked' AND p_new_status IN ('available', 'sold') THEN
    v_is_valid_transition := TRUE;
  ELSIF v_current_status = 'blocked' AND p_new_status = 'available' THEN
    v_is_valid_transition := TRUE;
  END IF;

  IF NOT v_is_valid_transition THEN
    RAISE EXCEPTION 'Illegal status transition: cannot move from % to %',
      v_current_status, p_new_status;
  END IF;

  -- Verify caller membership and role in organisation if called by authenticated user
  IF auth.uid() IS NOT NULL THEN
    SELECT role INTO v_caller_role
    FROM org_members
    WHERE org_id = v_org_id
      AND profile_id = (SELECT id FROM profiles WHERE auth_user_id = auth.uid() LIMIT 1);

    IF v_caller_role IS NULL THEN
      RAISE EXCEPTION 'Permission denied: caller is not a member of organisation %', v_org_id;
    END IF;

    IF v_caller_role = 'readonly' THEN
      RAISE EXCEPTION 'Permission denied: readonly accounts cannot change inventory status';
    END IF;

    IF p_new_status IN ('booked', 'sold', 'blocked') AND v_caller_role NOT IN ('owner', 'admin', 'manager') THEN
      RAISE EXCEPTION 'Permission denied: status % requires manager, admin, or owner role', p_new_status;
    END IF;
  END IF;

  -- Update inventory status
  UPDATE inventory_items
  SET status = p_new_status,
      updated_at = now()
  WHERE inventory_items.id = p_inventory_id;

  -- Append immutable audit history record inside the same transaction
  INSERT INTO inventory_status_history (
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
    v_org_id,
    v_current_status,
    p_new_status,
    p_changed_by,
    p_reason,
    p_metadata,
    now()
  );

  RETURN QUERY
  SELECT p_inventory_id, v_org_id, v_project_id, v_unit_number, p_new_status;
END;
$$ LANGUAGE plpgsql;

-- Secure execution permissions
REVOKE ALL ON FUNCTION transition_inventory_status_atomic(UUID, inventory_status, inventory_status, UUID, TEXT, JSONB) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION transition_inventory_status_atomic(UUID, inventory_status, inventory_status, UUID, TEXT, JSONB) TO authenticated, service_role;
