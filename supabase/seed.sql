-- supabase/seed.sql
-- Development seed data — run after migrations
-- Do NOT run in production

DO $$
DECLARE
  v_org_id uuid := gen_random_uuid();
  v_profile_id uuid;
  v_test_auth_id uuid := '00000000-0000-0000-0000-000000000000';
BEGIN
  -- Ensure test auth user exists in auth.users
  INSERT INTO auth.users (id, email, encrypted_password, email_confirmed_at, raw_app_meta_data, raw_user_meta_data, created_at, updated_at, role, aud)
  VALUES (
    v_test_auth_id,
    'demo@demo-realty.com',
    '$2a$10$abcdefghijklmnopqrstuvwxyzABCDEF',
    now(),
    '{"provider":"email","providers":["email"]}',
    '{"full_name":"Demo Owner"}',
    now(),
    now(),
    'authenticated',
    'authenticated'
  )
  ON CONFLICT (id) DO NOTHING;

  -- Insert a test org
  INSERT INTO organisations (id, name, slug, type, plan)
  VALUES (v_org_id, 'Demo Realty', 'demo-realty', 'developer', 'free');

  -- Ensure profile exists
  INSERT INTO profiles (id, auth_user_id, full_name, phone)
  VALUES (
    gen_random_uuid(),
    v_test_auth_id,
    'Demo Owner',
    '+91 98765 43210'
  )
  ON CONFLICT (auth_user_id) DO UPDATE SET full_name = EXCLUDED.full_name
  RETURNING id INTO v_profile_id;

  -- Make them owner
  INSERT INTO org_members (org_id, profile_id, role)
  VALUES (v_org_id, v_profile_id, 'owner');

  -- Insert a demo project
  INSERT INTO projects (org_id, name, slug, type, status, city)
  VALUES (v_org_id, 'Prestige Heights', 'prestige-heights', 'residential', 'launched', 'Bangalore');

END $$;
