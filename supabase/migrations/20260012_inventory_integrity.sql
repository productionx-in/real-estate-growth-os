-- supabase/migrations/20260012_inventory_integrity.sql
-- Migration 0012: Comprehensive Inventory Integrity & Atomic State Transitions
-- Enforces:
-- 1. Inventory-to-project organisation consistency
-- 2. Hierarchy parent/project consistency
-- 3. Inventory category vs project category validation
-- 4. Atomic inventory status transitions with audit history & concurrency control

-- 1. Trigger function: Ensure hierarchy nodes belong to same project & org as their parent
CREATE OR REPLACE FUNCTION validate_hierarchy_node_consistency()
RETURNS TRIGGER AS $$
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
RETURNS TRIGGER AS $$
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

-- 3. Atomic status transition stored procedure with optimistic concurrency control
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
) AS $$
DECLARE
  v_current_status inventory_status;
  v_org_id UUID;
  v_project_id UUID;
  v_unit_number TEXT;
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

  -- Update inventory status
  UPDATE inventory_items
  SET status = p_new_status,
      updated_at = now()
  WHERE inventory_items.id = p_inventory_id;

  -- Append immutable audit history record
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
$$ LANGUAGE plpgsql SECURITY DEFINER;
