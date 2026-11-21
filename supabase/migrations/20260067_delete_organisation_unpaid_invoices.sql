-- 20260067_delete_organisation_unpaid_invoices.sql — a workspace whose invoices were never paid (issued, void or
-- cancelled, with no payment, attempt, refund, credit note, mandate or dispute) can now be permanently deleted with
-- its data: those invoices are listed in the warning and removed with it (they cascade from the workspace). A PAID
-- invoice, and every payment-side record, still always blocks deletion. Same signature and grants as 20260066.

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

  FOREACH t IN ARRAY ARRAY['leads', 'projects', 'inventory_items', 'bookings', 'deals', 'site_visits', 'channel_partners', 'whatsapp_messages'] LOOP
    EXECUTE format('SELECT count(*) FROM public.%I WHERE org_id = $1', t) INTO n USING p_org;
    IF n > 0 THEN data_found := data_found || jsonb_build_object(t, n); END IF;
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
  DELETE FROM public.leads WHERE org_id = p_org;              -- activities, tasks, assignments, routing history cascade
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
