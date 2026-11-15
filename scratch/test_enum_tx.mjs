import { PGlite } from '@electric-sql/pglite';

async function test() {
  const db = new PGlite();
  await db.exec(`
    CREATE TYPE test_role AS ENUM ('super_admin', 'sales_rep');
  `);
  
  await db.exec(`
    BEGIN;
    ALTER TYPE test_role ADD VALUE IF NOT EXISTS 'platform_admin';
    CREATE OR REPLACE FUNCTION test_fn(r test_role) RETURNS boolean AS $$
    BEGIN
      RETURN r IN ('super_admin', 'platform_admin');
    END;
    $$ LANGUAGE plpgsql;
    COMMIT;
  `);

  const res = await db.query("SELECT test_fn('platform_admin'::test_role);");
  console.log('Success inside transaction:', res.rows[0]);
}

test().catch(console.error);
