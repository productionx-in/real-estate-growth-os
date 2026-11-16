// tests/proxy-routing.test.mjs
// Exercises the REAL proxy.ts (via jiti): API routes must never be redirected to /login (machine callers
// such as lead webhooks would silently fail), while app pages still require a session.
import assert from 'node:assert/strict'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { createJiti } from 'jiti'

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
// Point Supabase at a closed local port: no session cookie means no network call, and any call fails fast.
process.env.NEXT_PUBLIC_SUPABASE_URL = 'http://127.0.0.1:9'
process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY = 'test-anon-key'
if (!globalThis.WebSocket) globalThis.WebSocket = class UnusedRealtimeTransport {}

const jiti = createJiti(import.meta.url, { alias: { '@': root } })
const { proxy } = await jiti.import(path.join(root, 'proxy.ts'))
const { NextRequest } = await jiti.import('next/server')

let passed = 0
async function check(method, pathname, expectRedirectTo) {
  const res = await proxy(new NextRequest(`http://localhost:3000${pathname}`, { method }))
  const location = res.headers.get('location')
  if (expectRedirectTo) {
    assert.ok(location && new URL(location).pathname === expectRedirectTo, `${method} ${pathname} should redirect to ${expectRedirectTo}, got ${res.status} ${location}`)
  } else {
    assert.equal(location, null, `${method} ${pathname} must not redirect (got ${location})`)
  }
  passed++
  console.log(`  ✓ ${method} ${pathname} → ${expectRedirectTo ? `redirect ${expectRedirectTo}` : 'passes through'}`)
}

console.log('PROXY ROUTING (anonymous caller)')
for (const p of ['/api/webhooks/meta', '/api/webhooks/google/abc', '/api/webhooks/portals/99acres/abc', '/api/webhooks/whatsapp/abc',
  '/api/webhooks/inbound/abc', '/api/forms/submit', '/api/public/onboarding-requests', '/api/jobs/run', '/api/v1/leads', '/api/leads']) {
  await check('POST', p, null)
}
await check('GET', '/api/webhooks/meta', null)
await check('GET', '/', null)
await check('GET', '/login', null)
await check('GET', '/pricing', null)
await check('GET', '/demo', null)
await check('GET', '/acme/leads', '/login')
await check('GET', '/select-org', '/login')
await check('GET', '/apiary', '/login') // only the /api prefix is exempt, not look-alike paths
await check('GET', '/register', '/login')

console.log(`\nALL ${passed} PROXY ROUTING TESTS PASSED`)
