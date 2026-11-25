// tests/db-integration/p50-inventory-category.test.mjs — unit and project categories (20260091) on the local Supabase
// stack: a unit whose project's category was changed earlier can still change status; a unit can never be added to,
// or moved into, a category its project does not allow; and a project's category can no longer be changed away
// from the units it has (mixed use is always allowed).
import assert from 'node:assert/strict'
import crypto from 'node:crypto'

const DATABASE_URL = process.env.DATABASE_URL || 'postgresql://postgres:postgres@127.0.0.1:54322/postgres'
const RUN = crypto.randomBytes(4).toString('hex')
let passed = 0
async function test(name, fn) { try { await fn(); passed++; console.log(`  ✓ ${name}`) } catch (e) { console.error(`  ✗ ${name}`); throw e } }

async function main() {
  const pg = await import('pg')
  const db = new (pg.default || pg).Client({ connectionString: DATABASE_URL }); await db.connect()
  const one = async (s, p) => (await db.query(s, p)).rows[0]
  console.log('P50 — INVENTORY CATEGORY CONSISTENCY')
  const org = (await one(`INSERT INTO public.organisations (name, slug, type) VALUES ($1,$2,'developer') RETURNING id`, [`Cat ${RUN}`, `cat-${RUN}`])).id
  try {
    const proj = (await one(`INSERT INTO public.projects (org_id, name, slug, city, category) VALUES ($1,'Green Acres',$2,'Pune','apartments') RETURNING id`, [org, `ga-${RUN}`])).id
    const unit = (await one(`INSERT INTO public.inventory_items (org_id, project_id, unit_number, category, area_value, total_price, status)
      VALUES ($1,$2,'302','apartments',1000,9000000,'available') RETURNING id`, [org, proj])).id

    await test('a project’s category cannot change away from the units it has; mixed use is allowed', async () => {
      await assert.rejects(db.query(`UPDATE public.projects SET category='plotted_developments' WHERE id=$1`, [proj]),
        /this project has 1 unit\(s\) listed as apartments\. Make the project Mixed use/)
      await db.query(`UPDATE public.projects SET category='mixed_use' WHERE id=$1`, [proj])
      await db.query(`UPDATE public.projects SET category='apartments' WHERE id=$1`, [proj])
    })

    await test('a unit already out of step (from before this fix) can still change status', async () => {
      // Recreate the production situation: the project's category was changed while it had apartment units.
      await db.query(`ALTER TABLE public.projects DISABLE TRIGGER trg_guard_project_category_change`)
      await db.query(`UPDATE public.projects SET category='plotted_developments' WHERE id=$1`, [proj])
      await db.query(`ALTER TABLE public.projects ENABLE TRIGGER trg_guard_project_category_change`)
      await db.query(`UPDATE public.inventory_items SET status='on_hold' WHERE id=$1`, [unit])
      assert.equal((await one(`SELECT status FROM public.inventory_items WHERE id=$1`, [unit])).status, 'on_hold')
      await db.query(`UPDATE public.inventory_items SET total_price=9500000, status='available' WHERE id=$1`, [unit])
    })

    await test('…and can be brought into line; a wrong category is still refused on add and on change', async () => {
      await db.query(`UPDATE public.inventory_items SET category='plotted_developments' WHERE id=$1`, [unit])
      await assert.rejects(db.query(`UPDATE public.inventory_items SET category='villas_gated_communities' WHERE id=$1`, [unit]), /cannot differ from project category/)
      await assert.rejects(db.query(`INSERT INTO public.inventory_items (org_id, project_id, unit_number, category, area_value, total_price, status)
        VALUES ($1,$2,'303','apartments',1000,9000000,'available')`, [org, proj]), /cannot differ from project category/)
    })
  } finally {
    await db.query('DELETE FROM public.inventory_items WHERE org_id=$1', [org]).catch(() => {})
    await db.query('DELETE FROM public.projects WHERE org_id=$1', [org]).catch(() => {})
    await db.query('DELETE FROM public.organisations WHERE id=$1', [org]).catch((e) => console.error('cleanup', e.message))
    await db.end()
  }
  console.log(`\nInventory category consistency: ${passed} checks passed.`)
}
main().catch((e) => { console.error(e); process.exit(1) })
