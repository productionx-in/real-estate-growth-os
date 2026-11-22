-- 20260073_lead_archive.sql
-- Deleting a lead moves it to the Archive for 30 days instead of erasing it (Settings → Your company → Archive).
--
-- How: the table is renamed public.leads_all and gains deleted_at / deleted_by. public.leads becomes a view of the
-- live rows (security_invoker, so row-level security still applies exactly as before). Every existing query,
-- function, report and screen keeps using public.leads unchanged and simply stops seeing archived leads; inserts and
-- updates through the view work as before (it is a simple, auto-updatable view), with the same triggers.
-- Archiving and restoring only set deleted_at, so no trigger runs: a restored lead keeps its owner, timeline and
-- clocks, and nobody is alerted again. Leads archived for more than 30 days are erased by a daily job, with
-- everything that hangs off them (as a delete did before).
--
-- FOR FUTURE MIGRATIONS: ALTER TABLE public.leads_all (not public.leads) to add a column, then recreate the view
-- with the same definition so the column appears in it.

BEGIN;

ALTER TABLE public.leads RENAME TO leads_all;
ALTER TABLE public.leads_all
  ADD COLUMN IF NOT EXISTS deleted_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS deleted_by UUID REFERENCES public.profiles(id) ON DELETE SET NULL;
CREATE INDEX IF NOT EXISTS idx_leads_all_archived ON public.leads_all (org_id, deleted_at) WHERE deleted_at IS NOT NULL;

-- A webhook replay or re-import of an archived lead's external id creates a new lead rather than colliding with
-- the archived one (restoring then refuses if a live lead now holds the same id).
DROP INDEX IF EXISTS public.uq_leads_org_idempotency_key;
CREATE UNIQUE INDEX uq_leads_org_idempotency_key ON public.leads_all (org_id, idempotency_key)
  WHERE idempotency_key IS NOT NULL AND deleted_at IS NULL;
DROP INDEX IF EXISTS public.uq_leads_connection_external_lead_id;
CREATE UNIQUE INDEX uq_leads_connection_external_lead_id ON public.leads_all (connection_id, external_lead_id)
  WHERE connection_id IS NOT NULL AND external_lead_id IS NOT NULL AND deleted_at IS NULL;

CREATE VIEW public.leads WITH (security_invoker = true) AS
  SELECT * FROM public.leads_all WHERE deleted_at IS NULL;

-- The view gets exactly the privileges the table has (row-level security on the table still decides the rows).
DO $$
DECLARE g RECORD;
BEGIN
  FOR g IN SELECT grantee, privilege_type FROM information_schema.role_table_grants
           WHERE table_schema = 'public' AND table_name = 'leads_all' AND grantee IN ('anon', 'authenticated', 'service_role')
  LOOP
    EXECUTE format('GRANT %s ON public.leads TO %I', g.privilege_type, g.grantee);
  END LOOP;
END $$;

-- Archive (instead of delete). Owners and admins only — the API checks before calling.
CREATE OR REPLACE FUNCTION public.archive_lead(p_lead UUID, p_org UUID, p_actor UUID)
RETURNS BOOLEAN LANGUAGE plpgsql SECURITY DEFINER SET search_path = pg_catalog, public, pg_temp AS $$
BEGIN
  UPDATE public.leads_all SET deleted_at = now(), deleted_by = p_actor
   WHERE id = p_lead AND org_id = p_org AND deleted_at IS NULL;
  RETURN FOUND;
END $$;

-- Bring an archived lead back exactly as it was.
CREATE OR REPLACE FUNCTION public.restore_lead(p_lead UUID, p_org UUID)
RETURNS BOOLEAN LANGUAGE plpgsql SECURITY DEFINER SET search_path = pg_catalog, public, pg_temp AS $$
BEGIN
  UPDATE public.leads_all SET deleted_at = NULL, deleted_by = NULL
   WHERE id = p_lead AND org_id = p_org AND deleted_at IS NOT NULL;
  RETURN FOUND;
EXCEPTION WHEN unique_violation THEN
  RAISE EXCEPTION 'restore: a live lead already has this lead''s source id (it was received again after archiving)' USING ERRCODE = 'unique_violation';
END $$;

-- Erase one archived lead now (owners and admins), with everything that hangs off it.
CREATE OR REPLACE FUNCTION public.erase_archived_lead(p_lead UUID, p_org UUID)
RETURNS BOOLEAN LANGUAGE plpgsql SECURITY DEFINER SET search_path = pg_catalog, public, pg_temp AS $$
BEGIN
  DELETE FROM public.leads_all WHERE id = p_lead AND org_id = p_org AND deleted_at IS NOT NULL;
  RETURN FOUND;
END $$;

-- Daily: erase leads archived more than 30 days ago.
CREATE OR REPLACE FUNCTION public.purge_archived_leads()
RETURNS INTEGER LANGUAGE plpgsql SECURITY DEFINER SET search_path = pg_catalog, public, pg_temp AS $$
DECLARE n INTEGER;
BEGIN
  DELETE FROM public.leads_all WHERE deleted_at IS NOT NULL AND deleted_at < now() - interval '30 days';
  GET DIAGNOSTICS n = ROW_COUNT;
  RETURN n;
END $$;

REVOKE ALL ON FUNCTION public.archive_lead(UUID, UUID, UUID), public.restore_lead(UUID, UUID),
  public.erase_archived_lead(UUID, UUID), public.purge_archived_leads() FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.archive_lead(UUID, UUID, UUID), public.restore_lead(UUID, UUID),
  public.erase_archived_lead(UUID, UUID), public.purge_archived_leads() TO service_role;

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_extension WHERE extname = 'pg_cron') THEN
    PERFORM cron.unschedule(jobid) FROM cron.job WHERE jobname = 'regrow-purge-archived-leads';
    PERFORM cron.schedule('regrow-purge-archived-leads', '17 3 * * *', 'SELECT public.purge_archived_leads()');
  END IF;
END $$;

-- Deleting a whole workspace (Platform Owner) must count and remove archived leads too: same function as
-- 20260067 with public.leads_all in place of public.leads.
CREATE OR REPLACE FUNCTION public.platform_delete_organisation(p_org UUID, p_confirm_name TEXT, p_reason TEXT, p_actor_user UUID, p_purge_data BOOLEAN DEFAULT false)
RETURNS JSONB
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = pg_catalog, public, pg_temp
AS $$
DECLARE
  o RECORD;
  data_found JSONB := '{}'::jsonb;  -- working data: removable only with p_purge_data
  locked JSONB := '{}'::jsonb;      -- money and cross-company records: never removable here
  n BIGINT;
  t TEXT;
  members INTEGER;
BEGIN
  IF NOT EXISTS (SELECT 1 FROM public.platform_users WHERE user_id = p_actor_user AND role = 'super_admin' AND is_active) THEN
    RAISE EXCEPTION 'delete: only an active Platform Owner can delete a workspace' USING ERRCODE = 'insufficient_privilege';
  END IF;
  IF p_reason IS NULL OR length(btrim(p_reason)) < 3 THEN
    RAISE EXCEPTION 'delete: give a reason of at least 3 characters' USING ERRCODE = 'check_violation';
  END IF;
  SELECT id, name, slug, type INTO o FROM public.organisations WHERE id = p_org FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'delete: organisation not found' USING ERRCODE = 'no_data_found'; END IF;
  IF btrim(p_confirm_name) IS DISTINCT FROM btrim(o.name) THEN
    RAISE EXCEPTION 'delete: type the workspace name exactly to confirm' USING ERRCODE = 'check_violation';
  END IF;

  FOREACH t IN ARRAY ARRAY['leads_all', 'projects', 'inventory_items', 'bookings', 'deals', 'site_visits', 'channel_partners', 'whatsapp_messages'] LOOP
    EXECUTE format('SELECT count(*) FROM public.%I WHERE org_id = $1', t) INTO n USING p_org;
    -- Reported as "leads" (live and archived together), the name the console and audit log already use.
    IF n > 0 THEN data_found := data_found || jsonb_build_object(CASE t WHEN 'leads_all' THEN 'leads' ELSE t END, n); END IF;
  END LOOP;
  -- Invoices never paid (issued, void or cancelled) are removable data; a paid invoice is a money record.
  SELECT count(*) INTO n FROM public.org_subscription_invoices WHERE org_id = p_org AND status <> 'paid';
  IF n > 0 THEN data_found := data_found || jsonb_build_object('unpaid_invoices', n); END IF;
  SELECT count(*) INTO n FROM public.org_subscription_invoices WHERE org_id = p_org AND status = 'paid';
  IF n > 0 THEN locked := locked || jsonb_build_object('paid_invoices', n); END IF;
  FOREACH t IN ARRAY ARRAY['org_subscription_payments', 'credit_notes', 'payment_attempts', 'payment_refunds',
                           'payment_mandates', 'unapplied_payments', 'payment_disputes'] LOOP
    EXECUTE format('SELECT count(*) FROM public.%I WHERE org_id = $1', t) INTO n USING p_org;
    IF n > 0 THEN locked := locked || jsonb_build_object(t, n); END IF;
  END LOOP;
  SELECT count(*) INTO n FROM public.deal_registrations WHERE developer_org_id = p_org OR agency_org_id = p_org;
  IF n > 0 THEN locked := locked || jsonb_build_object('deal_registrations', n); END IF;

  IF locked <> '{}'::jsonb OR (data_found <> '{}'::jsonb AND NOT p_purge_data) THEN
    RETURN jsonb_build_object('deleted', false, 'blockers', data_found || locked, 'purgeable', locked = '{}'::jsonb);
  END IF;

  SELECT count(*) INTO members FROM public.org_members WHERE org_id = p_org;
  -- Audit first (append-only, survives the workspace).
  INSERT INTO public.platform_audit_logs (actor_user_id, actor_role, action, target_entity_type, target_entity_id, metadata)
  VALUES (p_actor_user, 'super_admin', 'organisation.deleted', 'organisations', p_org,
          jsonb_build_object('name', o.name, 'slug', o.slug, 'type', o.type, 'members', members, 'reason', btrim(p_reason),
                             'data_purged', data_found));

  -- Working data, in dependency order (bookings point at leads and inventory; rules point at teams).
  DELETE FROM public.routing_rules WHERE org_id = p_org;
  DELETE FROM public.bookings WHERE org_id = p_org;
  DELETE FROM public.leads_all WHERE org_id = p_org;          -- archived ones too; activities, tasks, assignments cascade
  DELETE FROM public.deals WHERE org_id = p_org;
  DELETE FROM public.site_visits WHERE org_id = p_org;
  DELETE FROM public.whatsapp_messages WHERE org_id = p_org;
  DELETE FROM public.channel_partners WHERE org_id = p_org;
  DELETE FROM public.inventory_status_history WHERE org_id = p_org;
  DELETE FROM public.inventory_items WHERE org_id = p_org;
  DELETE FROM public.project_hierarchy_nodes WHERE org_id = p_org;
  DELETE FROM public.projects WHERE org_id = p_org;
  DELETE FROM public.org_members WHERE org_id = p_org;
  DELETE FROM public.organisations WHERE id = p_org;          -- everything else cascades or is set null
  RETURN jsonb_build_object('deleted', true, 'name', o.name, 'members_removed', members, 'data_purged', data_found);
END $$;

REVOKE ALL ON FUNCTION public.platform_delete_organisation(UUID, TEXT, TEXT, UUID, BOOLEAN) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.platform_delete_organisation(UUID, TEXT, TEXT, UUID, BOOLEAN) TO service_role;

COMMIT;
