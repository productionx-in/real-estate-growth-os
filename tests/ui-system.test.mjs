// tests/ui-system.test.mjs — the shared UI system: one table design (.data-table / components/ui/table.tsx), one
// overlay family (Dialog, Sheet, ModalShell — all Radix: focus trap, Escape, focus return), and one chart kit
// (components/ui/chart.tsx, --chart-1…5 in both themes). New code that draws its own table, overlay or chart fails here.
import assert from 'node:assert/strict'
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const read = (p) => fs.readFileSync(path.join(root, p), 'utf8')
const walk = (dir) => fs.readdirSync(path.join(root, dir), { withFileTypes: true }).flatMap((e) => e.isDirectory() ? walk(`${dir}/${e.name}`) : e.name.endsWith('.tsx') ? [`${dir}/${e.name}`] : [])
const files = [...walk('app'), ...walk('components')]
let passed = 0
function test(name, fn) { fn(); passed++; console.log(`  ✓ ${name}`) }
console.log('UI SYSTEM')

test('every data table uses the shared table design (printed documents excepted)', () => {
  const bad = []
  for (const f of files) {
    if (f === 'components/documents/DocumentBody.tsx') continue
    for (const m of read(f).matchAll(/<table\b[^>]*>/g)) if (!/data-table/.test(m[0])) bad.push(f)
  }
  assert.deepEqual(bad, [])
  const css = read('app/globals.css')
  assert.match(css, /\.data-table > thead > tr > th \{/); assert.match(css, /\.data-table > tbody > tr:hover/)
})
test('overlays come from the shared family; only the sidebar drawer, command palette and console shell are their own', () => {
  const allowed = new Set(['components/layout/Sidebar.tsx', 'components/layout/CommandPalette.tsx', 'components/platform/ConsoleShell.tsx'])
  const bad = files.filter((f) => !f.startsWith('components/ui/') && !allowed.has(f) && /className="[^"]*\bfixed inset-0\b/.test(read(f)))
  assert.deepEqual(bad, [])
  const shell = read('components/ui/modal-shell.tsx')
  assert.match(shell, /@radix-ui\/react-dialog/); assert.match(shell, /DialogPrimitive\.Title className="sr-only"/)
  const shells = files.filter((f) => read(f).includes('<ModalShell'))
  assert.ok(shells.length >= 14, 'the former hand-built modals use ModalShell')
  // Escape belongs to the shell (one layer at a time); a window-wide handler would close the drawer behind a dialog too.
  assert.deepEqual(shells.filter((f) => /e\.key === 'Escape'/.test(read(f))), [])
})
test('charts: one kit, tokens for both themes, a table view for every chart frame', () => {
  const css = read('app/globals.css')
  assert.equal((css.match(/--chart-1: #/g) ?? []).length, 2, 'light and dark')
  const kit = read('components/ui/chart.tsx')
  assert.match(kit, /Show as table/); assert.match(kit, /role="img" aria-label=/)
  for (const f of ['components/analytics/ExecutiveBiDashboardView.tsx', 'components/analytics/ReportCatalogue.tsx']) {
    assert.doesNotMatch(read(f), /style=\{\{ (width|height): `\$\{/, `${f} draws its own bars`)
    assert.match(read(f), /from '@\/components\/ui\/chart'/)
  }
})

console.log(`\nUI system: ${passed} checks passed.`)
