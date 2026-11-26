// tests/profile-photo.test.mjs — profile photos (lib/profile/photo.ts, migration 20260102): a photo is recognised from
// its bytes, limited to 2 MB, and only ever set for the signed-in person's own profile; initials when there is none.
import assert from 'node:assert/strict'
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { createJiti } from 'jiti'

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const jiti = createJiti(import.meta.url, { alias: { '@': root } })
const P = await jiti.import(path.join(root, 'lib/profile/photo.ts'))
const read = (p) => fs.readFileSync(path.join(root, p), 'utf8')
let passed = 0
function test(name, fn) { fn(); passed++; console.log(`  ✓ ${name}`) }
console.log('PROFILE PHOTO')

const bytes = (...b) => new Uint8Array(b)
const webp = new Uint8Array([...'RIFF'].map((c) => c.charCodeAt(0)).concat([0, 0, 0, 0], [...'WEBP'].map((c) => c.charCodeAt(0))))

test('JPEG, PNG and WebP are recognised from their bytes; anything else is refused whatever it is called', () => {
  assert.equal(P.sniffPhoto(bytes(0xff, 0xd8, 0xff, 0xe0)), 'jpg')
  assert.equal(P.sniffPhoto(bytes(0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a)), 'png')
  assert.equal(P.sniffPhoto(webp), 'webp')
  assert.equal(P.sniffPhoto(new TextEncoder().encode('<svg onload=alert(1)>')), null)
  assert.equal(P.sniffPhoto(new TextEncoder().encode('GIF89a')), null)
  assert.equal(P.sniffPhoto(bytes(0x25, 0x50, 0x44, 0x46)), null) // %PDF
})
test('size and emptiness are checked', () => {
  assert.equal(P.photoProblem(new Uint8Array(0)), 'Choose a photo.')
  const big = new Uint8Array(P.MAX_PHOTO_BYTES + 1); big.set([0xff, 0xd8, 0xff])
  assert.match(P.photoProblem(big), /2 MB/)
  assert.equal(P.photoProblem(bytes(0xff, 0xd8, 0xff, 0xe0)), null)
})
test('initials when there is no photo', () => {
  assert.equal(P.initials('Asha Menon'), 'AM'); assert.equal(P.initials('ravi'), 'R'); assert.equal(P.initials(''), '?'); assert.equal(P.initials('  Priya  K  S '), 'PK')
})
test('the API only ever changes the signed-in person’s own photo, checked from its bytes', () => {
  const api = read('app/api/profile/photo/route.ts')
  assert.match(api, /supabase\.auth\.getUser\(\)/)
  assert.match(api, /\.eq\('auth_user_id', user\.id\)/)
  assert.ok(!/searchParams|params|profileId'\)/.test(api.replace('const profileId = await me()', '')), 'no profile id from the request')
  assert.match(api, /photoProblem\(bytes\)/)
  const dal = read('lib/dal/profile-photo.ts')
  assert.match(dal, /`\$\{profileId\}\/\$\{randomUUID\(\)\}\.\$\{type\}`/)
  assert.match(dal, /upsert: false/)
})
test('the bucket: public to read, 2 MB, images only, and no storage policies (only the server writes)', () => {
  const sql = read('supabase/migrations/20260102_profile_photos.sql')
  assert.match(sql, /VALUES \('avatars', 'avatars', true, 2097152, ARRAY\['image\/jpeg', 'image\/png', 'image\/webp'\]\)/)
  assert.ok(!/CREATE POLICY/i.test(sql))
})
test('photos appear wherever a person does: header, team, profile', () => {
  assert.match(read('components/layout/Header.tsx'), /<UserAvatar name=\{profile\?\.full_name\} src=\{profile\?\.avatar_url\}/)
  assert.match(read('components/team/TeamManagementClient.tsx'), /<UserAvatar name=\{m\.name\} src=\{m\.avatar_url\}/)
  assert.match(read('app/(dashboard)/[orgSlug]/settings/profile/page.tsx'), /<ProfilePhoto /)
})

console.log(`\nProfile photo: ${passed} checks passed.`)
