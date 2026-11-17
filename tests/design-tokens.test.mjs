// tests/design-tokens.test.mjs
// Design-system guard (Phase 2):
//   1. every CSS variable the app uses is defined (undefined variables silently render as nothing);
//   2. the dark theme overrides every semantic colour the light theme defines;
//   3. every text colour meets WCAG AA (4.5:1) against the page and card backgrounds, in both themes;
//   4. the design-system primitives use only tokens, never raw Tailwind palette colours;
//   5. raw palette colours elsewhere can only go DOWN (ratchet) — lower BASELINE as modules move to tokens.
import assert from 'node:assert/strict'
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const BASELINE_RAW_PALETTE = 2119 // measured at the start of Phase 2; lower it when you migrate a module

let passed = 0
function test(name, fn) { fn(); passed++; console.log(`  ✓ ${name}`) }
const walk = (dir) => fs.readdirSync(dir, { withFileTypes: true }).flatMap((d) => {
  const p = path.join(dir, d.name)
  return d.isDirectory() ? walk(p) : /\.(tsx?|css)$/.test(p) ? [p] : []
})
const sources = ['app', 'components', 'lib'].flatMap((d) => walk(path.join(root, d)))
const css = fs.readFileSync(path.join(root, 'app/globals.css'), 'utf8')

const block = (selector) => {
  const i = css.indexOf(`${selector} {`)
  assert.ok(i >= 0, `missing ${selector} block`)
  return css.slice(i, css.indexOf('\n}', i))
}
const decls = (text) => Object.fromEntries([...text.matchAll(/^\s*(--[a-z0-9-]+):\s*([^;]+);/gm)].map((m) => [m[1], m[2].trim()]))
const light = decls(block(':root'))
const dark = decls(block(':root[data-theme="dark"]'))
const defined = new Set([...Object.keys(light), ...Object.keys(dark), ...[...css.matchAll(/^\s*(--[a-z0-9-]+):/gm)].map((m) => m[1]), '--font-inter'])

console.log('DESIGN TOKENS')

test('every var(--…) used in app/, components/ and lib/ is defined in globals.css', () => {
  const missing = new Set()
  for (const f of sources) for (const m of fs.readFileSync(f, 'utf8').matchAll(/var\((--[a-z0-9-]+)/g)) {
    if (!defined.has(m[1])) missing.add(`${m[1]} (${path.relative(root, f)})`)
  }
  assert.deepEqual([...missing], [])
})

const SEMANTIC = Object.keys(light).filter((k) => !/^--(gray|blue|green|amber|red)-\d+$/.test(k) && !/^--(sidebar-width|header-height|radius)/.test(k))
test('the dark theme overrides every semantic colour', () => {
  assert.deepEqual(SEMANTIC.filter((k) => !(k in dark)), [])
})

const resolve = (theme, value, depth = 0) => {
  const m = value.match(/^var\((--[a-z0-9-]+)\)$/)
  if (!m) return value
  assert.ok(depth < 5)
  return resolve(theme, theme[m[1]] ?? light[m[1]], depth + 1)
}
const lum = (hex) => {
  const n = hex.replace('#', '')
  const [r, g, b] = [0, 2, 4].map((i) => parseInt(n.slice(i, i + 2), 16) / 255).map((c) => (c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4))
  return 0.2126 * r + 0.7152 * g + 0.0722 * b
}
const contrast = (a, b) => { const [x, y] = [lum(a), lum(b)].sort((p, q) => q - p); return (x + 0.05) / (y + 0.05) }

test('text colours meet WCAG AA (4.5:1) on background and surface, light and dark', () => {
  const failures = []
  for (const [name, theme] of [['light', light], ['dark', { ...light, ...dark }]]) {
    for (const bg of ['--background', '--surface']) {
      for (const fg of ['--foreground', '--foreground-muted', '--foreground-subtle', '--brand', '--success', '--warning', '--danger', '--info']) {
        const [f, b] = [resolve(theme, theme[fg]), resolve(theme, theme[bg])]
        if (!/^#[0-9a-f]{6}$/i.test(f) || !/^#[0-9a-f]{6}$/i.test(b)) continue
        const r = contrast(f, b)
        if (r < 4.5) failures.push(`${name}: ${fg} on ${bg} = ${r.toFixed(2)}:1`)
      }
    }
    for (const [fg, bg] of [['--brand-foreground', '--brand'], ['--danger-foreground', '--danger']]) {
      const r = contrast(resolve(theme, theme[fg]), resolve(theme, theme[bg]))
      if (r < 4.5) failures.push(`${name}: ${fg} on ${bg} = ${r.toFixed(2)}:1`)
    }
  }
  assert.deepEqual(failures, [])
})

const RAW = /\b(?:bg|text|border|ring|from|to|via|divide|outline|fill|stroke)-(?:slate|gray|zinc|neutral|stone|red|orange|amber|yellow|lime|green|emerald|teal|cyan|sky|blue|indigo|violet|purple|fuchsia|pink|rose|white|black)(?:-[0-9]{2,3})?\b/g
const rawIn = (files) => files.reduce((n, f) => n + (fs.readFileSync(f, 'utf8').match(RAW)?.length ?? 0), 0)

test('design-system primitives (components/ui) use tokens only', () => {
  const ui = walk(path.join(root, 'components/ui'))
  const offenders = ui.filter((f) => (fs.readFileSync(f, 'utf8').match(RAW) ?? []).length > 0)
  assert.deepEqual(offenders.map((f) => path.relative(root, f)), [])
})

test(`raw Tailwind palette colours do not increase (baseline ${BASELINE_RAW_PALETTE})`, () => {
  const n = rawIn(sources.filter((f) => !f.endsWith('.css')))
  assert.ok(n <= BASELINE_RAW_PALETTE,
    `${n} raw palette classes (baseline ${BASELINE_RAW_PALETTE}). Use semantic tokens (bg-surface, text-muted, text-danger …) from components/ui instead.`)
  if (n < BASELINE_RAW_PALETTE) console.log(`    ↳ ${n} now — lower BASELINE_RAW_PALETTE to ${n} to lock in the progress`)
})

console.log(`\nDesign tokens: ${passed} checks passed.`)
