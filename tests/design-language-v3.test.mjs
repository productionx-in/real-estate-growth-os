// tests/design-language-v3.test.mjs — the product-wide look (docs/ui-ux-audit.md, "Design language v3"): the shared
// components carry it, the shell is frosted, feedback goes through one toast system, and hand-built cards share depth.
import assert from 'node:assert/strict'
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const read = (p) => fs.readFileSync(path.join(root, p), 'utf8')
let passed = 0
function test(name, fn) { fn(); passed++; console.log(`  ✓ ${name}`) }
console.log('DESIGN LANGUAGE V3')

test('tokens: canvas lights, clay depth, brand gradient and glow, field inset — light and dark', () => {
  const css = read('app/globals.css')
  for (const t of ['--canvas-glow-1', '--brand-gradient', '--brand-glow', '--shadow-inset', '--focus-glow', '--glass']) {
    assert.equal((css.match(new RegExp(`${t}:`, 'g')) ?? []).length, 2, `${t} in both themes`)
  }
  assert.match(css, /background-attachment: fixed;/, 'the canvas lights paint once')
  for (const c of ['.btn-primary', '.btn-secondary', '.field', '.glass', '.toast', '.anim-side']) assert.ok(css.includes(`${c} {`) || css.includes(`${c}[`), c)
  assert.match(css, /prefers-reduced-motion: reduce/)
})

test('shared components carry the look, so every screen built from them changes together', () => {
  assert.match(read('components/ui/button.tsx'), /primary: 'btn-primary /)
  assert.match(read('components/ui/button.tsx'), /secondary: 'btn-secondary /)
  assert.match(read('components/ui/field.tsx'), /'field w-full rounded-md/)
  assert.match(read('components/ui/card.tsx'), /surface-raised rounded-2xl/)
  for (const f of ['components/layout/Sidebar.tsx', 'components/layout/Header.tsx', 'components/layout/BottomNav.tsx']) assert.match(read(f), /\bglass\b/, f)
})

test('one feedback system: toasts are mounted in the workspace and the console, and are accessible', () => {
  const t = read('components/ui/toast.tsx')
  assert.match(t, /role=\{t\.tone === 'error' \? 'alert' : 'status'\}/)
  assert.match(t, /onMouseEnter=\{\(\) => setHover\(true\)\}/, 'pauses while hovered')
  assert.match(read('app/(dashboard)/[orgSlug]/layout.tsx'), /<Toaster \/>/)
  assert.match(read('app/platform/layout.tsx'), /<Toaster \/>/)
  const cal = read('components/calendar/CalendarBoard.tsx')
  assert.match(cal, /toast\.success\(ok, undo \? \{ action: \{ label: 'Undo', onClick: undo \} \} : undefined\)/)
})

test('hand-built cards share the raised depth (no flat card-sized surfaces left)', () => {
  const walk = (d) => fs.readdirSync(path.join(root, d), { withFileTypes: true }).flatMap((e) => e.isDirectory() ? walk(path.join(d, e.name)) : e.name.endsWith('.tsx') ? [path.join(d, e.name)] : [])
  const flat = []
  for (const f of [...walk('app'), ...walk('components')].filter((f) => !f.includes('components/ui/'))) {
    for (const m of read(f).matchAll(/className="([^"]*)"/g)) {
      const t = m[1].split(/\s+/)
      if ((t.includes('rounded-xl') || t.includes('rounded-2xl')) && t.includes('border') && t.includes('border-default') && t.includes('bg-surface')
        && !t.includes('surface-raised') && !t.some((x) => /^(shadow-(md|lg|xl|2xl)|\[box-shadow)/.test(x))) flat.push(f)
    }
  }
  assert.deepEqual(flat, [])
})

console.log(`\nDesign language v3: ${passed} checks passed.`)
