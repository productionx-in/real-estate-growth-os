-- 20260043_close_dead_rls_policies.sql
-- REGrow M1-13 — remove 17 "dead" RLS policies and make those tables server-only.
--
-- Policies created in 20260020–20260024 compared org_members.profile_id with auth.uid(). profile_id is a
-- profiles.id, auth.uid() is an auth.users.id, so the predicate never matched: the policies denied everything.
-- Meanwhile anon/authenticated still held full table privileges (102 INSERT/UPDATE/DELETE grants in production),
-- so the only thing standing between a client and these tables — API keys, webhook secrets, WhatsApp
-- conversations, commissions — was a typo. A later "fix" of the predicate would have exposed all of them.
--
-- No browser or user-scoped code reads these tables: every access goes through /api routes with the service
-- role after authorisation (verified by code search). So the correct state is: RLS on, no client policies,
-- no client privileges. Service role keeps full access. Behaviour for the app is unchanged.

BEGIN;

DO $$
DECLARE
  t TEXT;
  tables TEXT[] := ARRAY[
    'automation_executions', 'automation_workflow_steps', 'automation_workflows', 'bookings',
    'channel_partner_commissions', 'channel_partners', 'deals', 'developer_api_keys', 'inventory_blockings',
    'lead_touchpoints', 'project_microsites', 'site_visits', 'webhook_delivery_logs', 'webhook_subscriptions',
    'whatsapp_conversations', 'whatsapp_messages', 'whatsapp_templates'];
BEGIN
  FOREACH t IN ARRAY tables LOOP
    IF to_regclass('public.' || t) IS NULL THEN
      CONTINUE;
    END IF;
    EXECUTE format('DROP POLICY IF EXISTS %I ON public.%I', t || '_tenant_isolation', t);
    EXECUTE format('ALTER TABLE public.%I ENABLE ROW LEVEL SECURITY', t);
    EXECUTE format('REVOKE ALL ON public.%I FROM PUBLIC, anon, authenticated', t);
    EXECUTE format('GRANT ALL ON public.%I TO service_role', t);
    EXECUTE format('COMMENT ON TABLE public.%I IS %L', t,
      'Server-only (service role via /api after authorisation). No client policies or privileges — see 20260043.');
  END LOOP;
END;
$$;

-- Guard: no policy anywhere may compare a profile id with auth.uid() again.
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_policies WHERE schemaname = 'public'
             AND (qual LIKE '%profile_id = auth.uid()%' OR with_check LIKE '%profile_id = auth.uid()%')) THEN
    RAISE EXCEPTION 'dead RLS policies remain (profile_id = auth.uid())';
  END IF;
END;
$$;

COMMIT;
