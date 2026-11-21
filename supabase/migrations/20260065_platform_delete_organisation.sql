-- 20260065_platform_delete_organisation.sql — permanent deletion of a customer workspace by the Platform Owner,
-- only while it holds no business data (a workspace created by mistake, a test, a duplicate). Anything with
-- leads, projects, inventory, bookings, deals, site visits, partners, WhatsApp messages, invoices or payments is
-- refused: deactivate it instead (data kept). One transaction: nothing is half-deleted. People's sign-in
-- accounts are never deleted (they may belong to other workspaces). Additive: nothing existing changes.

CREATE OR REPLACE FUNCTION public.platform_delete_organisation(p_org UUID, p_confirm_name TEXT, p_reason TEXT, p_actor_user UUID)
RETURNS JSONB
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = pg_catalog, public, pg_temp
AS $$
DECLARE
  o RECORD;
  blockers JSONB := '{}'::jsonb;
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

  -- Business data that must never be deleted this way.
  FOREACH t IN ARRAY ARRAY['leads', 'projects', 'inventory_items', 'bookings', 'deals', 'site_visits', 'channel_partners',
                           'whatsapp_messages', 'org_subscription_invoices', 'org_subscription_payments', 'credit_notes',
                           'payment_attempts', 'payment_refunds', 'payment_mandates', 'unapplied_payments', 'payment_disputes'] LOOP
    EXECUTE format('SELECT count(*) FROM public.%I WHERE org_id = $1', t) INTO n USING p_org;
    IF n > 0 THEN blockers := blockers || jsonb_build_object(t, n); END IF;
  END LOOP;
  SELECT count(*) INTO n FROM public.deal_registrations WHERE developer_org_id = p_org OR agency_org_id = p_org;
  IF n > 0 THEN blockers := blockers || jsonb_build_object('deal_registrations', n); END IF;
  IF blockers <> '{}'::jsonb THEN
    RETURN jsonb_build_object('deleted', false, 'blockers', blockers);
  END IF;

  SELECT count(*) INTO members FROM public.org_members WHERE org_id = p_org;
  -- Audit first (append-only, survives the workspace).
  INSERT INTO public.platform_audit_logs (actor_user_id, actor_role, action, target_entity_type, target_entity_id, metadata)
  VALUES (p_actor_user, 'super_admin', 'organisation.deleted', 'organisations', p_org,
          jsonb_build_object('name', o.name, 'slug', o.slug, 'type', o.type, 'members', members, 'reason', btrim(p_reason)));

  -- Rows that do not cascade (and are empty of business data by the checks above).
  DELETE FROM public.inventory_status_history WHERE org_id = p_org;
  DELETE FROM public.project_hierarchy_nodes WHERE org_id = p_org;
  DELETE FROM public.org_members WHERE org_id = p_org;
  DELETE FROM public.organisations WHERE id = p_org;   -- everything else cascades or is set null
  RETURN jsonb_build_object('deleted', true, 'name', o.name, 'members_removed', members);
END $$;

REVOKE ALL ON FUNCTION public.platform_delete_organisation(UUID, TEXT, TEXT, UUID) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.platform_delete_organisation(UUID, TEXT, TEXT, UUID) TO service_role;
