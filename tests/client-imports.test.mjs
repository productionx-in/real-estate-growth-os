// tests/client-imports.test.mjs — a server file must not import plain values (constants, helpers) from a module marked
// 'use client': on the server that import is a client reference, not the value. STAGE_LABEL imported that way left
// every stage badge on REGrow's sales pipeline empty. Components (capitalised) and types are fine.
import assert from 'node:assert/strict'
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
let passed = 0
const test = (name, fn) => { fn(); passed++; console.log(`  ✓ ${name}`) }
const all = (dir) => fs.readdirSync(dir, { withFileTypes: true }).flatMap((e) => e.name === 'node_modules' || e.name.startsWith('.') ? [] : e.isDirectory() ? all(path.join(dir, e.name)) : /\.tsx?$/.test(e.name) ? [path.join(dir, e.name)] : [])
const isClient = (s) => /^\s*(\/\/[^\n]*\n|\/\*[\s\S]*?\*\/\s*)*['"]use client['"]/.test(s)

console.log('CLIENT IMPORTS')

test('server files import only components and types from "use client" modules', () => {
  const files = [...all(path.join(root, 'app')), ...all(path.join(root, 'components')), ...all(path.join(root, 'lib'))]
  const client = new Set(files.filter((f) => isClient(fs.readFileSync(f, 'utf8'))).map((f) => '@/' + path.relative(root, f).replace(/\.tsx?$/, '')))
  const bad = []
  for (const f of files) {
    const s = fs.readFileSync(f, 'utf8')
    if (isClient(s)) continue
    for (const m of s.matchAll(/import (type )?\{([^}]+)\} from '(@\/[^']+)'/g)) {
      if (m[1] || !client.has(m[3])) continue
      for (const raw of m[2].split(',').map((x) => x.trim()).filter(Boolean)) {
        if (raw.startsWith('type ')) continue
        const name = raw.split(/\s+as\s+/)[0]
        if (!/^[A-Z][A-Za-z0-9]*$/.test(name) || /^[A-Z0-9_]+$/.test(name)) bad.push(`${path.relative(root, f)}: ${name} from ${m[3]}`)
      }
    }
  }
  assert.deepEqual(bad, [])
})

console.log(`\nClient imports: ${passed} checks passed.`)
