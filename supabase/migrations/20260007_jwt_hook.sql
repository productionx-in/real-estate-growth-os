-- supabase/migrations/20260007_jwt_hook.sql
-- Auth hook: inject org_id, org_slug, and app_role into JWT custom claims
-- This function must be registered in Supabase Dashboard:
--   Authentication > Hooks > Customize Access Token (JWT) > Database function

CREATE OR REPLACE FUNCTION public.custom_access_token_hook(event jsonb)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
AS $$
DECLARE
  claims jsonb;
  v_profile_id uuid;
  v_org_id uuid;
  v_org_slug text;
  v_role text;
BEGIN
  claims := event->'claims';

  -- Look up the profile for this auth user
  SELECT id INTO v_profile_id
  FROM public.profiles
  WHERE auth_user_id = (event->>'user_id')::uuid
  LIMIT 1;

  IF v_profile_id IS NULL THEN
    RETURN event;
  END IF;

  -- Look up the user's org membership (first org for now; multi-org handled via cookie in future)
  SELECT om.org_id, o.slug, om.role::text
  INTO v_org_id, v_org_slug, v_role
  FROM public.org_members om
  JOIN public.organisations o ON o.id = om.org_id
  WHERE om.profile_id = v_profile_id
  ORDER BY om.joined_at ASC
  LIMIT 1;

  IF v_org_id IS NOT NULL THEN
    claims := jsonb_set(claims, '{org_id}', to_jsonb(v_org_id::text));
    claims := jsonb_set(claims, '{org_slug}', to_jsonb(v_org_slug));
    claims := jsonb_set(claims, '{app_role}', to_jsonb(v_role));
  END IF;

  RETURN jsonb_set(event, '{claims}', claims);
END;
$$;

-- Grant execute to supabase_auth_admin
GRANT EXECUTE ON FUNCTION public.custom_access_token_hook TO supabase_auth_admin;
REVOKE EXECUTE ON FUNCTION public.custom_access_token_hook FROM authenticated, anon, public;
