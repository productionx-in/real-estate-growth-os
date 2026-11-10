-- supabase/seed.sql
-- Development seed data — run after migrations
-- Do NOT run in production

-- Note: Requires a valid auth.users entry. 
-- Create a user via Supabase Auth dashboard first, then update the UUID below.

DO $$
DECLARE
  v_org_id uuid := gen_random_uuid();
  v_profile_id uuid;
BEGIN
  -- Insert a test org
  INSERT INTO organisations (id, name, slug, type, plan)
  VALUES (v_org_id, 'Demo Realty', 'demo-realty', 'developer', 'free');

  -- The profile is created by trigger when auth user signs up.
  -- Seed a fake profile for local testing:
  INSERT INTO profiles (id, auth_user_id, full_name, phone)
  VALUES (
    gen_random_uuid(),
    '00000000-0000-0000-0000-000000000000', -- replace with real auth user id
    'Demo Owner',
    '+91 98765 43210'
  )
  RETURNING id INTO v_profile_id;

  -- Make them owner
  INSERT INTO org_members (org_id, profile_id, role)
  VALUES (v_org_id, v_profile_id, 'owner');

  -- Insert a demo project
  INSERT INTO projects (org_id, name, slug, type, status, city)
  VALUES (v_org_id, 'Prestige Heights', 'prestige-heights', 'residential', 'launched', 'Bangalore');

END $$;
