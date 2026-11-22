-- 20260074_workspace_settings.sql
-- Workspace settings (Settings → Lead / Inventory / Report settings), and the features they drive:
--   * org_settings: one row per organisation, one JSON object per section (leads, inventory, reports), validated by lib/settings/workspace.ts
--     before it is saved. Server-only like org_business_profiles (20260071): RLS on, no client privileges.
--   * leads_all.closed_reason: why a lead was marked Lost or Junk, picked from the workspace's list. The column is
--     added to the table and the live-leads view is recreated (rule from 20260073).
--   * inventory_items.held_until: when a unit is put on hold and the workspace has a hold time, the hold expires at
--     that moment; a job every 10 minutes puts expired units back to Available and records it in the unit's history
--     against the person who placed the hold. Changing the hold time affects new holds only.
-- Additive only.

BEGIN;

CREATE TABLE IF NOT EXISTS public.org_settings (
  org_id     UUID PRIMARY KEY REFERENCES public.organisations(id) ON DELETE CASCADE,
  leads      JSONB NOT NULL DEFAULT '{}'::jsonb CHECK (jsonb_typeof(leads) = 'object' AND pg_column_size(leads) < 16384),
  inventory  JSONB NOT NULL DEFAULT '{}'::jsonb CHECK (jsonb_typeof(inventory) = 'object' AND pg_column_size(inventory) < 4096),
  reports    JSONB NOT NULL DEFAULT '{}'::jsonb CHECK (jsonb_typeof(reports) = 'object' AND pg_column_size(reports) < 4096),
  updated_by UUID REFERENCES public.profiles(id) ON DELETE SET NULL,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
ALTER TABLE public.org_settings ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.org_settings FROM PUBLIC, anon, authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.org_settings TO service_role;

-- Why a lead was closed.
ALTER TABLE public.leads_all
  ADD COLUMN IF NOT EXISTS closed_reason TEXT CHECK (closed_reason IS NULL OR char_length(btrim(closed_reason)) BETWEEN 1 AND 80);
CREATE OR REPLACE VIEW public.leads WITH (security_invoker = true) AS
  SELECT * FROM public.leads_all WHERE deleted_at IS NULL;

-- Hold expiry.
ALTER TABLE public.inventory_items ADD COLUMN IF NOT EXISTS held_until TIMESTAMPTZ;
CREATE INDEX IF NOT EXISTS idx_inventory_items_hold_expiry ON public.inventory_items (held_until)
  WHERE status = 'on_hold' AND held_until IS NOT NULL;

CREATE OR REPLACE FUNCTION public.inventory_set_hold_expiry()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER SET search_path = pg_catalog, public, pg_temp AS $$
DECLARE v_hours INTEGER;
BEGIN
  IF NEW.status = 'on_hold' THEN
    IF TG_OP = 'INSERT' OR OLD.status IS DISTINCT FROM 'on_hold' THEN
      SELECT CASE WHEN jsonb_typeof(s.inventory -> 'holdHours') = 'number'
                   AND (s.inventory ->> 'holdHours')::numeric BETWEEN 1 AND 720
                  THEN (s.inventory ->> 'holdHours')::numeric::integer END
        INTO v_hours FROM public.org_settings s WHERE s.org_id = NEW.org_id;
      NEW.held_until := CASE WHEN v_hours IS NULL THEN NULL ELSE now() + make_interval(hours => v_hours) END;
    END IF;
  ELSE
    NEW.held_until := NULL;
  END IF;
  RETURN NEW;
END $$;
REVOKE ALL ON FUNCTION public.inventory_set_hold_expiry() FROM PUBLIC, anon, authenticated;

DROP TRIGGER IF EXISTS trg_inventory_hold_expiry ON public.inventory_items;
CREATE TRIGGER trg_inventory_hold_expiry BEFORE INSERT OR UPDATE OF status ON public.inventory_items
  FOR EACH ROW EXECUTE FUNCTION public.inventory_set_hold_expiry();

-- Every 10 minutes: expired holds go back to Available, with a history row.
CREATE OR REPLACE FUNCTION public.release_expired_holds()
RETURNS INTEGER LANGUAGE plpgsql SECURITY DEFINER SET search_path = pg_catalog, public, pg_temp AS $$
DECLARE r RECORD; v_by UUID; n INTEGER := 0;
BEGIN
  FOR r IN SELECT i.id, i.org_id, i.held_until FROM public.inventory_items i
            WHERE i.status = 'on_hold' AND i.held_until IS NOT NULL AND i.held_until <= now()
            ORDER BY i.held_until LIMIT 500 FOR UPDATE SKIP LOCKED
  LOOP
    -- The person who placed the hold; failing that, the workspace owner (history needs a person).
    SELECT h.changed_by INTO v_by FROM public.inventory_status_history h
     WHERE h.inventory_id = r.id AND h.new_status = 'on_hold' ORDER BY h.created_at DESC LIMIT 1;
    IF v_by IS NULL THEN
      SELECT m.profile_id INTO v_by FROM public.org_members m
       WHERE m.org_id = r.org_id AND m.role = 'owner' ORDER BY m.joined_at LIMIT 1;
    END IF;
    CONTINUE WHEN v_by IS NULL;
    UPDATE public.inventory_items SET status = 'available', updated_at = now() WHERE id = r.id;
    INSERT INTO public.inventory_status_history (inventory_id, org_id, previous_status, new_status, changed_by, reason, metadata)
    VALUES (r.id, r.org_id, 'on_hold', 'available', v_by, 'Hold expired',
            jsonb_build_object('automatic', true, 'held_until', r.held_until));
    n := n + 1;
  END LOOP;
  RETURN n;
END $$;
REVOKE ALL ON FUNCTION public.release_expired_holds() FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.release_expired_holds() TO service_role;

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_extension WHERE extname = 'pg_cron') THEN
    PERFORM cron.unschedule(jobid) FROM cron.job WHERE jobname = 'regrow-release-expired-holds';
    PERFORM cron.schedule('regrow-release-expired-holds', '*/10 * * * *', 'SELECT public.release_expired_holds()');
  END IF;
END $$;

COMMIT;
