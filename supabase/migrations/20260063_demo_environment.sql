-- 20260063_demo_environment.sql
-- Demo / testing environment support. Nothing in this migration creates data: it only lets an operator mark a
-- NON-production database as staging, and lets the demo seed (scripts/demo/seed-demo.mjs) tag and later remove the
-- records it created.
--
-- Safety model
--   1. public.deployment_environment holds at most one row. The migration inserts nothing, so every database —
--      production included — starts unmarked. Only the database owner (SQL editor / psql as postgres) can write the
--      row: service_role, authenticated and anon have no write privilege, so the seed script cannot mark a database
--      itself. The production project reference is rejected by a CHECK constraint.
--   2. organisations.is_demo can only be true on a marked staging/local/preview database, can only be set when the
--      row is inserted, and can never be changed afterwards — a real organisation cannot be re-tagged as demo.
--   3. public.demo_purge() removes only organisations with is_demo = true and auth users tagged as demo
--      (app_metadata.regrow_demo = true AND an @example.test / .example.test address). It refuses to run on an
--      unmarked database, and fails as a whole (nothing deleted) if a demo user is referenced by a non-demo record.

-- 1. Environment marker ------------------------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.deployment_environment (
  singleton    BOOLEAN PRIMARY KEY DEFAULT true CHECK (singleton),
  kind         TEXT NOT NULL CHECK (kind IN ('staging', 'local', 'preview')),
  project_ref  TEXT NOT NULL CHECK (project_ref <> '' AND project_ref <> 'rtbvzqwwhefyyuhpoznu'),
  note         TEXT,
  marked_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
  marked_by    TEXT NOT NULL DEFAULT current_user
);
COMMENT ON TABLE public.deployment_environment IS
  'At most one row, written by the database owner only, marking this database as a non-production (staging/local/preview) environment. Never insert a row in production.';

ALTER TABLE public.deployment_environment ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.deployment_environment FROM PUBLIC, anon, authenticated, service_role;
GRANT SELECT ON public.deployment_environment TO service_role;

CREATE OR REPLACE FUNCTION public.demo_environment_allowed()
RETURNS BOOLEAN
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
  SELECT EXISTS (SELECT 1 FROM public.deployment_environment WHERE kind IN ('staging', 'local', 'preview'))
$$;
REVOKE ALL ON FUNCTION public.demo_environment_allowed() FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.demo_environment_allowed() TO service_role;

-- 2. Demo tagging ------------------------------------------------------------------------------------------------
ALTER TABLE public.organisations ADD COLUMN IF NOT EXISTS is_demo BOOLEAN NOT NULL DEFAULT false;
COMMENT ON COLUMN public.organisations.is_demo IS
  'Demo/test workspace created by scripts/demo/seed-demo.mjs. Settable only at insert on a marked non-production database; immutable.';

CREATE OR REPLACE FUNCTION public.guard_organisation_demo_flag()
RETURNS TRIGGER
LANGUAGE plpgsql
SET search_path = pg_catalog, public
AS $$
BEGIN
  IF TG_OP = 'INSERT' THEN
    IF NEW.is_demo AND NOT public.demo_environment_allowed() THEN
      RAISE EXCEPTION 'Demo organisations can only be created on a database marked as staging, local or preview'
        USING ERRCODE = 'insufficient_privilege';
    END IF;
  ELSIF NEW.is_demo IS DISTINCT FROM OLD.is_demo THEN
    RAISE EXCEPTION 'organisations.is_demo cannot be changed after the organisation is created'
      USING ERRCODE = 'insufficient_privilege';
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_organisations_demo_flag ON public.organisations;
CREATE TRIGGER trg_organisations_demo_flag
  BEFORE INSERT OR UPDATE OF is_demo ON public.organisations
  FOR EACH ROW EXECUTE FUNCTION public.guard_organisation_demo_flag();

-- A demo auth user: tagged by the seed through app_metadata (writable only with the service role) AND on the
-- reserved example.test domain. Both are required.
CREATE OR REPLACE FUNCTION public.is_demo_auth_user(p_user_id UUID)
RETURNS BOOLEAN
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = pg_catalog, public, auth
AS $$
  SELECT EXISTS (
    SELECT 1 FROM auth.users u
    WHERE u.id = p_user_id
      AND coalesce(u.raw_app_meta_data ->> 'regrow_demo', '') = 'true'
      AND (lower(u.email) LIKE '%@example.test' OR lower(u.email) LIKE '%.example.test')
  )
$$;
REVOKE ALL ON FUNCTION public.is_demo_auth_user(UUID) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.is_demo_auth_user(UUID) TO service_role;

-- 3. Platform audit log: still append-only, with one narrow exception for the demo purge -------------------------
CREATE OR REPLACE FUNCTION public.prevent_audit_log_mutation()
RETURNS trigger
LANGUAGE plpgsql
SET search_path TO 'pg_catalog', 'public', 'extensions', 'pg_temp'
AS $function$
BEGIN
  IF TG_OP = 'UPDATE' THEN
    RAISE EXCEPTION 'Security Violation: platform_audit_logs records are immutable and cannot be updated.';
  ELSIF TG_OP = 'DELETE' THEN
    -- Entries written by demo accounts may be removed by public.demo_purge() on a marked non-production database.
    IF coalesce(current_setting('regrow.demo_purge', true), '') = 'on'
       AND public.demo_environment_allowed()
       AND OLD.actor_user_id IS NOT NULL
       AND public.is_demo_auth_user(OLD.actor_user_id) THEN
      RETURN OLD;
    END IF;
    RAISE EXCEPTION 'Security Violation: platform_audit_logs records are append-only and cannot be deleted.';
  END IF;
  RETURN NULL;
END;
$function$;

-- 4. Purge ------------------------------------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.demo_purge()
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public, auth
AS $$
DECLARE
  v_orgs UUID[];
  v_users UUID[];
  v_profiles UUID[];
  v_pass INTEGER;
  v_progress BOOLEAN;
  v_rows BIGINT;
  v_total BIGINT := 0;
  v_ref RECORD;
  v_remaining INTEGER;
BEGIN
  IF NOT public.demo_environment_allowed() THEN
    RAISE EXCEPTION 'demo_purge refused: this database is not marked as staging, local or preview'
      USING ERRCODE = 'insufficient_privilege';
  END IF;

  SELECT coalesce(array_agg(id), '{}') INTO v_orgs FROM public.organisations WHERE is_demo;
  SELECT coalesce(array_agg(u.id), '{}') INTO v_users FROM auth.users u WHERE public.is_demo_auth_user(u.id);
  SELECT coalesce(array_agg(p.id), '{}') INTO v_profiles FROM public.profiles p WHERE p.auth_user_id = ANY (v_users);

  -- A demo user must never belong to a real workspace; if one does, stop before touching anything.
  IF EXISTS (
    SELECT 1 FROM public.org_members m
    WHERE m.profile_id = ANY (v_profiles) AND NOT (m.org_id = ANY (v_orgs))
  ) THEN
    RAISE EXCEPTION 'demo_purge refused: a demo account is a member of a non-demo organisation';
  END IF;

  PERFORM set_config('regrow.demo_purge', 'on', true);

  -- Records that belong to demo organisations. Tables reference organisations with a mix of CASCADE and RESTRICT
  -- keys and reference each other, so delete repeatedly until nothing more can go; each attempt runs in its own
  -- sub-transaction so a still-referenced row simply waits for the next pass.
  IF cardinality(v_orgs) > 0 THEN
    FOR v_pass IN 1..12 LOOP
      v_progress := false;
      FOR v_ref IN
        SELECT DISTINCT c.table_name, c.column_name
        FROM information_schema.columns c
        JOIN information_schema.tables t ON t.table_schema = c.table_schema AND t.table_name = c.table_name
        WHERE c.table_schema = 'public' AND t.table_type = 'BASE TABLE'
          AND c.column_name IN ('org_id', 'developer_org_id', 'agency_org_id', 'linked_org_id')
          AND c.data_type = 'uuid'
          AND c.table_name <> 'organisations'
        ORDER BY c.table_name
      LOOP
        BEGIN
          IF v_ref.column_name = 'linked_org_id' THEN
            EXECUTE format('UPDATE public.%I SET linked_org_id = NULL WHERE linked_org_id = ANY ($1)', v_ref.table_name) USING v_orgs;
          ELSE
            EXECUTE format('DELETE FROM public.%I WHERE %I = ANY ($1)', v_ref.table_name, v_ref.column_name) USING v_orgs;
          END IF;
          GET DIAGNOSTICS v_rows = ROW_COUNT;
          IF v_rows > 0 THEN v_progress := true; v_total := v_total + v_rows; END IF;
        EXCEPTION WHEN foreign_key_violation OR raise_exception OR insufficient_privilege THEN
          NULL; -- still referenced or guarded until its parent goes; retried next pass
        END;
      END LOOP;
      BEGIN
        DELETE FROM public.organisations WHERE id = ANY (v_orgs);
        GET DIAGNOSTICS v_rows = ROW_COUNT;
        v_total := v_total + v_rows;
      EXCEPTION WHEN foreign_key_violation THEN
        v_rows := 0;
      END;
      EXIT WHEN NOT EXISTS (SELECT 1 FROM public.organisations WHERE id = ANY (v_orgs));
      IF NOT v_progress THEN EXIT; END IF;
    END LOOP;
    SELECT count(*) INTO v_remaining FROM public.organisations WHERE id = ANY (v_orgs);
    IF v_remaining > 0 THEN
      -- Run the delete once more without a handler so the caller sees which record blocks it.
      DELETE FROM public.organisations WHERE id = ANY (v_orgs);
    END IF;
  END IF;

  -- Records written by demo accounts outside demo organisations (internal portal demo data, audit entries).
  IF cardinality(v_users) > 0 THEN
    DELETE FROM public.internal_prospect_activities a USING public.internal_prospects p
      WHERE a.prospect_id = p.id AND (p.created_by = ANY (v_users) OR p.owner_user_id = ANY (v_users));
    DELETE FROM public.internal_prospects WHERE created_by = ANY (v_users) OR owner_user_id = ANY (v_users);
    DELETE FROM public.platform_audit_logs WHERE actor_user_id = ANY (v_users);
    DELETE FROM public.platform_users WHERE user_id = ANY (v_users);
    DELETE FROM public.profiles WHERE id = ANY (v_profiles);
    -- Any other record still pointing at a demo user is not demo data: the FK error stops the purge and nothing
    -- is removed.
    DELETE FROM auth.users WHERE id = ANY (v_users);
  END IF;

  RETURN jsonb_build_object(
    'organisations', cardinality(v_orgs),
    'users', cardinality(v_users),
    'rows', v_total
  );
END;
$$;
REVOKE ALL ON FUNCTION public.demo_purge() FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.demo_purge() TO service_role;
