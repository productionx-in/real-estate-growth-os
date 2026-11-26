// scripts/backup-storage.mjs — copies every object in every Supabase Storage bucket to a local folder (read-only
// against the project). Used by .github/workflows/db-backup.yml; database dumps do not include Storage files.
// Env: SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY. Usage: node scripts/backup-storage.mjs <out-dir>
import { mkdir, writeFile } from 'node:fs/promises'
import { dirname, join } from 'node:path'

const base = process.env.SUPABASE_URL?.replace(/\/$/, '')
const key = process.env.SUPABASE_SERVICE_ROLE_KEY
const out = process.argv[2]
if (!base || !key || !out) { console.error('SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY and an output folder are required'); process.exit(2) }
const headers = { apikey: key, Authorization: `Bearer ${key}` }

async function api(path, init = {}) {
  const res = await fetch(`${base}/storage/v1${path}`, { ...init, headers: { ...headers, ...(init.headers ?? {}) } })
  if (!res.ok) throw new Error(`${init.method ?? 'GET'} ${path}: ${res.status} ${await res.text()}`)
  return res
}

const enc = (p) => p.split('/').map(encodeURIComponent).join('/')

async function listAll(bucket, prefix = '') {
  const files = []
  for (let offset = 0; ; offset += 1000) {
    const res = await api(`/object/list/${encodeURIComponent(bucket)}`, {
      method: 'POST', headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ prefix, limit: 1000, offset, sortBy: { column: 'name', order: 'asc' } }),
    })
    const items = await res.json()
    for (const it of items) {
      const path = prefix ? `${prefix}/${it.name}` : it.name
      if (it.id === null) files.push(...await listAll(bucket, path)) // a folder
      else files.push(path)
    }
    if (items.length < 1000) break
  }
  return files
}

const buckets = await (await api('/bucket')).json()
let count = 0, bytes = 0
for (const b of buckets) {
  const files = await listAll(b.id)
  for (const f of files) {
    const res = await api(`/object/${encodeURIComponent(b.id)}/${enc(f)}`)
    const buf = Buffer.from(await res.arrayBuffer())
    const dest = join(out, b.id, f)
    await mkdir(dirname(dest), { recursive: true })
    await writeFile(dest, buf)
    count++; bytes += buf.length
  }
  console.log(`${b.id}: ${files.length} files`)
}
console.log(`Storage: ${count} files, ${(bytes / 1048576).toFixed(1)} MB from ${buckets.length} buckets`)
