// tests/theme.test.mjs — day/night appearance (lib/theme/runtime.ts): sunrise/sunset maths against known times,
// the preference rules, which pages stay light, and that the inline boot script really runs. Module test.
import assert from 'node:assert/strict'
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { createJiti } from 'jiti'

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const jiti = createJiti(import.meta.url, { alias: { '@': root } })
const { themeRuntime, THEME_BOOT_SCRIPT } = await jiti.import(path.join(root, 'lib/theme/runtime.ts'))
const T = themeRuntime()
let passed = 0
function test(name, fn) { fn(); passed++; console.log(`  ✓ ${name}`) }
const near = (ms, iso, minutes, label) => assert.ok(Math.abs(ms - Date.parse(iso)) <= minutes * 60_000, `${label}: ${new Date(ms).toISOString()} vs ${iso}`)

console.log('DAY / NIGHT THEME')

test('sunrise and sunset match published times within 5 minutes', () => {
  let t = T.sunTimes(new Date('2026-06-21T06:30:00Z'), 19.076, 72.877) // Mumbai: 06:02 / 19:18 IST
  near(t.rise, '2026-06-21T00:32:00Z', 5, 'Mumbai June rise'); near(t.set, '2026-06-21T13:48:00Z', 5, 'Mumbai June set')
  t = T.sunTimes(new Date('2026-12-21T06:30:00Z'), 19.076, 72.877) // 07:09 / 18:04 IST
  near(t.rise, '2026-12-21T01:39:00Z', 5, 'Mumbai Dec rise'); near(t.set, '2026-12-21T12:34:00Z', 5, 'Mumbai Dec set')
  t = T.sunTimes(new Date('2026-06-21T12:00:00Z'), 51.5, -0.13) // London: 04:43 / 21:21 BST
  near(t.rise, '2026-06-21T03:43:00Z', 5, 'London rise'); near(t.set, '2026-06-21T20:21:00Z', 5, 'London set')
  assert.equal(T.sunTimes(new Date('2026-06-21T12:00:00Z'), 69.65, 18.96), null, 'midnight sun: no sunset')
})

test('"sunrise & sunset": light by day, dark by night, in the device’s timezone (India)', () => {
  const ist = (h, m = 0) => new Date(Date.UTC(2026, 10, 18, h - 5, m - 30))
  assert.equal(T.effective('sun', ist(12), false, 'Asia/Kolkata', -330), 'light')
  assert.equal(T.effective('sun', ist(22), false, 'Asia/Kolkata', -330), 'dark')
  assert.equal(T.effective('sun', ist(5), false, 'Asia/Kolkata', -330), 'dark')
  assert.equal(T.effective('sun', ist(8), false, 'Asia/Kolkata', -330), 'light')
  assert.equal(T.effective('sun', ist(12), false, 'Mars/Olympus', -330), 'light', 'unknown zone: estimated from the UTC offset')
})

test('the other preferences: match device, always light, always dark', () => {
  const noon = new Date('2026-11-18T06:30:00Z')
  assert.equal(T.effective('system', noon, true, 'Asia/Kolkata', -330), 'dark')
  assert.equal(T.effective('system', noon, false, 'Asia/Kolkata', -330), 'light')
  assert.equal(T.effective('dark', noon, false, 'Asia/Kolkata', -330), 'dark')
  assert.equal(T.effective('light', new Date('2026-11-18T18:30:00Z'), true, 'Asia/Kolkata', -330), 'light')
})

test('public, buyer-facing and marketing pages stay light; the app and sign-in follow the preference', () => {
  for (const p of ['/', '/pricing', '/demo', '/leakage-audit', '/privacy', '/terms', '/p/skyline', '/d/abc', '/forms/x']) assert.equal(T.lightOnly(p), true, p)
  for (const p of ['/acme/leads', '/select-org', '/login', '/platform', '/pricingcalc']) assert.equal(T.lightOnly(p), false, p)
})

test('the inline boot script runs on its own and sets the theme before paint; storage errors are harmless', () => {
  const run = (stored, isoNow, path) => {
    const attrs = {}
    const RealDate = Date
    const FakeDate = class extends RealDate { constructor(...a) { super(...(a.length ? a : [isoNow])) } static now() { return new RealDate(isoNow).valueOf() } }
    const win = {}
    const env = {
      window: win, location: { pathname: path }, Date: FakeDate, Intl,
      localStorage: { getItem: () => { if (stored === 'throw') throw new Error('blocked'); return stored } },
      matchMedia: () => ({ matches: false }),
      document: { documentElement: { setAttribute: (k, v) => { attrs[k] = v }, removeAttribute: (k) => { delete attrs[k] } } },
    }
    win.matchMedia = env.matchMedia
    new Function(...Object.keys(env), THEME_BOOT_SCRIPT)(...Object.values(env))
    return { theme: attrs['data-theme'] ?? 'light', api: win.__regrowTheme }
  }
  assert.equal(run('dark', '2026-11-18T06:30:00Z', '/acme/leads').theme, 'dark')
  assert.equal(run('dark', '2026-11-18T06:30:00Z', '/pricing').theme, 'light', 'marketing stays light')
  assert.equal(run('light', '2026-11-18T18:30:00Z', '/acme').theme, 'light')
  assert.equal(run('throw', '2026-11-18T06:30:00Z', '/acme').api.readPreference(), 'sun', 'blocked storage: default')
})

test('wiring: script in <head>, controller in the root layout, choice in the account menu', () => {
  const layout = fs.readFileSync(path.join(root, 'app/layout.tsx'), 'utf8')
  assert.match(layout, /<head>[\s\S]*THEME_BOOT_SCRIPT[\s\S]*<\/head>/)
  assert.match(layout, /<ThemeController \/>/)
  assert.match(fs.readFileSync(path.join(root, 'components/layout/Header.tsx'), 'utf8'), /<AppearanceMenu \/>/)
})

console.log(`\nDay/night theme: ${passed} checks passed.`)
