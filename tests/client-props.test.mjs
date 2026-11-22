// tests/client-props.test.mjs — server pages must not pass functions to client components ("Functions cannot be passed
// directly to Client Components" is a production render error). Guards the plot map, which crashed the project map
// page as soon as a layout existed.
import assert from 'node:assert/strict'
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const read = (p) => fs.readFileSync(path.join(root, p), 'utf8')
let passed = 0
const test = (name, fn) => { fn(); passed++; console.log(`  ✓ ${name}`) }

function walk(dir) {
  return fs.readdirSync(dir, { withFileTypes: true }).flatMap((e) => (e.isDirectory() ? walk(path.join(dir, e.name)) : e.name === 'page.tsx' || e.name === 'layout.tsx' ? [path.join(dir, e.name)] : []))
}

console.log('CLIENT COMPONENT PROPS')

test('PlotMap takes its links as strings, and no page passes it an inline function', () => {
  assert.match(read('components/plots/PlotMap.tsx'), /unitHref\?: string/)
  for (const f of walk(path.join(root, 'app'))) {
    const s = fs.readFileSync(f, 'utf8')
    if (/^['"]use client['"]/.test(s)) continue
    const tags = s.match(/<PlotMap\b[^>]*>/g) ?? []
    for (const t of tags) assert.doesNotMatch(t, /=\{\s*(\([^)]*\)|[a-z_]\w*)\s*=>/i, `${path.relative(root, f)} passes a function to PlotMap`)
  }
})

console.log(`\nClient component props: ${passed} checks passed.`)
