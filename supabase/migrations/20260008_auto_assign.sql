-- supabase/migrations/20260008_auto_assign.sql
-- Auto-assignment: when a lead is inserted with no assigned_to,
-- assign it to the sales_exec with the fewest open leads in that org.
-- Managers can override this at any time.

CREATE OR REPLACE FUNCTION auto_assign_lead()
RETURNS TRIGGER AS $$
DECLARE
  v_assignee_id uuid;
BEGIN
  -- Only auto-assign if no explicit assignee was set
  IF NEW.assigned_to IS NOT NULL THEN
    RETURN NEW;
  END IF;

  -- Find the sales_exec in this org with the fewest currently-open leads
  -- (status not in booked/lost/junk)
  SELECT om.profile_id
  INTO v_assignee_id
  FROM org_members om
  WHERE om.org_id = NEW.org_id
    AND om.role = 'sales_exec'
  ORDER BY (
    SELECT COUNT(*)
    FROM leads l
    WHERE l.assigned_to = om.profile_id
      AND l.org_id = NEW.org_id
      AND l.status NOT IN ('booked', 'lost', 'junk')
  ) ASC,
  om.joined_at ASC   -- tiebreak: first joined gets priority
  LIMIT 1;

  IF v_assignee_id IS NOT NULL THEN
    NEW.assigned_to := v_assignee_id;
  END IF;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

CREATE TRIGGER trigger_auto_assign_lead
  BEFORE INSERT ON leads
  FOR EACH ROW
  EXECUTE FUNCTION auto_assign_lead();
