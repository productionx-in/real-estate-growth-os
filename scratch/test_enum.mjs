import { PGlite } from '@electric-sql/pglite';

async function test() {
  const db = new PGlite();
  await db.exec(`
    CREATE TABLE test_tab (id uuid, price bigint);
    CREATE OR REPLACE FUNCTION test_fn(has_row boolean) RETURNS bigint AS $$
    DECLARE
      v_row test_tab%ROWTYPE;
    BEGIN
      IF has_row THEN
        SELECT * INTO v_row FROM test_tab;
      END IF;
      RETURN COALESCE(v_row.price, 100);
    END;
    $$ LANGUAGE plpgsql;
  `);

  const res = await db.query('SELECT test_fn(false);');
  console.log('Result when has_row is false:', res.rows[0]);
}

test().catch(console.error);
