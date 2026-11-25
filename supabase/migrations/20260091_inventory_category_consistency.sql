-- 20260091_inventory_category_consistency.sql
-- A unit's category must match its project's (unless the project is mixed use). Two fixes:
--   1. The unit check ran on EVERY update, so a unit that was already out of step (its project's category had been
--      changed after it was added) could no longer change status at all. The category rule now runs when a unit is
--      added, or when its category or project changes; organisation and tower/floor checks still run every time.
--   2. That out-of-step state could arise because a project's category could be changed while it had units of another
--      category. That is now refused with a plain message (unless the new category is mixed use).
-- No data is changed.

BEGIN;

CREATE OR REPLACE FUNCTION public.validate_inventory_item_integrity()
RETURNS TRIGGER
LANGUAGE plpgsql
SET search_path = pg_catalog, public, extensions, pg_temp
AS $$
DECLARE
  v_proj_org_id UUID;
  v_proj_category project_category;
  v_node_project_id UUID;
  v_node_org_id UUID;
BEGIN
  SELECT org_id, category INTO v_proj_org_id, v_proj_category FROM projects WHERE id = NEW.project_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Project % does not exist', NEW.project_id;
  END IF;

  IF NEW.org_id <> v_proj_org_id THEN
    RAISE EXCEPTION 'Inventory item organisation (%) does not match project organisation (%)', NEW.org_id, v_proj_org_id;
  END IF;

  -- Category: on insert, or when the unit's category or project changes (not on a status change).
  IF (TG_OP = 'INSERT' OR NEW.category IS DISTINCT FROM OLD.category OR NEW.project_id IS DISTINCT FROM OLD.project_id)
     AND v_proj_category <> 'mixed_use' AND NEW.category <> v_proj_category THEN
    RAISE EXCEPTION 'Inventory item category (%) cannot differ from project category (%) unless project is mixed_use',
      NEW.category, v_proj_category;
  END IF;

  IF NEW.hierarchy_node_id IS NOT NULL THEN
    SELECT project_id, org_id INTO v_node_project_id, v_node_org_id FROM project_hierarchy_nodes WHERE id = NEW.hierarchy_node_id;
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
$$;

-- A project's category cannot change away from the category of units it already has (mixed use accepts every kind).
CREATE OR REPLACE FUNCTION public.guard_project_category_change()
RETURNS TRIGGER
LANGUAGE plpgsql
SET search_path = pg_catalog, public, extensions, pg_temp
AS $$
DECLARE v_count INTEGER; v_other TEXT;
BEGIN
  IF NEW.category IS DISTINCT FROM OLD.category AND NEW.category <> 'mixed_use' THEN
    SELECT count(*), min(category::text) INTO v_count, v_other
      FROM inventory_items WHERE project_id = NEW.id AND category <> NEW.category;
    IF v_count > 0 THEN
      RAISE EXCEPTION 'project category: this project has % unit(s) listed as %. Make the project Mixed use, or change or remove those units first.',
        v_count, replace(v_other, '_', ' ') USING ERRCODE = 'check_violation';
    END IF;
  END IF;
  RETURN NEW;
END;
$$;
REVOKE ALL ON FUNCTION public.guard_project_category_change() FROM PUBLIC, anon, authenticated;

DROP TRIGGER IF EXISTS trg_guard_project_category_change ON public.projects;
CREATE TRIGGER trg_guard_project_category_change BEFORE UPDATE OF category ON public.projects
  FOR EACH ROW EXECUTE FUNCTION public.guard_project_category_change();

COMMIT;
