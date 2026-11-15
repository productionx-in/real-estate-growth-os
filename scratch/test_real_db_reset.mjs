import fs from 'node:fs';
import path from 'node:path';
import { PGlite } from '@electric-sql/pglite';

async function runCleanDbReset() {
  console.log('===================================================================');
  console.log('STARTING REAL DISPOSABLE POSTGRESQL CLEAN DATABASE RESET');
  console.log('===================================================================');

  const db = new PGlite();

  // 1. Setup Supabase baseline environment
  console.log('\n--- 1. Initializing Supabase Base Roles & Schemas ---');
  await db.exec(`
    CREATE SCHEMA IF NOT EXISTS auth;
    CREATE SCHEMA IF NOT EXISTS storage;
    CREATE SCHEMA IF NOT EXISTS extensions;

    -- Roles
    DO $$ BEGIN CREATE ROLE anon; EXCEPTION WHEN duplicate_object THEN NULL; END $$;
    DO $$ BEGIN CREATE ROLE authenticated; EXCEPTION WHEN duplicate_object THEN NULL; END $$;
    DO $$ BEGIN CREATE ROLE service_role; EXCEPTION WHEN duplicate_object THEN NULL; END $$;
    DO $$ BEGIN CREATE ROLE supabase_admin; EXCEPTION WHEN duplicate_object THEN NULL; END $$;
    DO $$ BEGIN CREATE ROLE supabase_auth_admin; EXCEPTION WHEN duplicate_object THEN NULL; END $$;
    DO $$ BEGIN CREATE ROLE authenticator; EXCEPTION WHEN duplicate_object THEN NULL; END $$;
    DO $$ BEGIN CREATE ROLE dashboard_user; EXCEPTION WHEN duplicate_object THEN NULL; END $$;

    -- Auth schema minimal mocks for local runner
    CREATE TABLE IF NOT EXISTS auth.users (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      email TEXT UNIQUE,
      encrypted_password TEXT,
      email_confirmed_at TIMESTAMPTZ,
      raw_app_meta_data JSONB DEFAULT '{}'::jsonb,
      raw_user_meta_data JSONB DEFAULT '{}'::jsonb,
      created_at TIMESTAMPTZ DEFAULT now(),
      updated_at TIMESTAMPTZ DEFAULT now(),
      role TEXT DEFAULT 'authenticated',
      aud TEXT DEFAULT 'authenticated'
    );

    CREATE OR REPLACE FUNCTION auth.uid() RETURNS UUID AS $$
      SELECT NULL::UUID;
    $$ LANGUAGE sql STABLE;

    CREATE OR REPLACE FUNCTION auth.role() RETURNS TEXT AS $$
      SELECT 'authenticated'::TEXT;
    $$ LANGUAGE sql STABLE;

    CREATE OR REPLACE FUNCTION auth.jwt() RETURNS JSONB AS $$
      SELECT '{}'::JSONB;
    $$ LANGUAGE sql STABLE;
  `);
  console.log('✓ Supabase baseline environment initialized successfully');

  // 2. Read all migrations in exact alphabetical order
  const dir = 'supabase/migrations';
  const files = fs.readdirSync(dir).filter(f => f.endsWith('.sql')).sort();
  console.log(`\nFound ${files.length} migrations to apply in sequence.`);

  let appliedCount = 0;
  const timings = [];

  for (let idx = 0; idx < files.length; idx++) {
    const file = files[idx];
    const filePath = path.join(dir, file);
    const sql = fs.readFileSync(filePath, 'utf8');

    process.stdout.write(`Applying [${idx + 1}/${files.length}] ${file}... `);
    const start = Date.now();

    try {
      await db.exec(sql);
      const elapsed = Date.now() - start;
      timings.push({ file, elapsed });
      console.log(`✓ OK (${elapsed}ms)`);
      appliedCount++;
    } catch (err) {
      console.log(`FAILED!`);
      console.error(`\n===================================================================`);
      console.error(`MIGRATION FAILED: ${file}`);
      console.error(`Error message: ${err.message}`);
      if (err.position) console.error(`Error position: ${err.position}`);
      console.error(`===================================================================\n`);
      throw err;
    }
  }

  console.log('\n===================================================================');
  console.log(`ALL ${appliedCount} MIGRATIONS APPLIED CLEANLY WITH ZERO ERRORS!`);
  console.log('===================================================================');

  // 3. Verify Database Catalog Integrity
  console.log('\n--- 3. Verifying Database Catalog Integrity ---');
  
  // Count tables in public schema
  const tablesRes = await db.query(`
    SELECT table_name 
    FROM information_schema.tables 
    WHERE table_schema = 'public' 
    ORDER BY table_name;
  `);
  console.log(`Total public tables created: ${tablesRes.rows.length}`);

  // Count functions in public schema
  const funcRes = await db.query(`
    SELECT routine_name 
    FROM information_schema.routines 
    WHERE routine_schema = 'public' 
    ORDER BY routine_name;
  `);
  console.log(`Total public routines created: ${funcRes.rows.length}`);

  // Count triggers in public schema
  const trgRes = await db.query(`
    SELECT trigger_name, event_object_table 
    FROM information_schema.triggers 
    WHERE trigger_schema = 'public' 
    ORDER BY event_object_table, trigger_name;
  `);
  console.log(`Total public triggers active: ${trgRes.rows.length}`);

  // Check unique index on subscription_plan_versions
  const idxRes = await db.query(`
    SELECT indexname, indexdef 
    FROM pg_indexes 
    WHERE tablename = 'subscription_plan_versions';
  `);
  console.log('\nIndexes on subscription_plan_versions:');
  for (const row of idxRes.rows) {
    console.log(`- ${row.indexname}: ${row.indexdef}`);
  }

  // Check platform_bootstrap_state
  const bootRes = await db.query(`SELECT * FROM public.platform_bootstrap_state;`);
  console.log('\nPlatform bootstrap state rows:', bootRes.rows.length);

  return { db, appliedCount, totalTables: tablesRes.rows.length };
}

runCleanDbReset().catch(err => {
  console.error('Fatal execution error:', err);
  process.exit(1);
});
