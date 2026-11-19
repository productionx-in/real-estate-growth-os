// tests/site-urls.test.mjs — every absolute URL comes from configuration (lib/site/urls.ts): no domain is written
// into the code, the sources are used in the documented order, and robots/sitemap/indexing follow one list.
import assert from 'node:assert/strict'
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { createJiti } from 'jiti'

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const jiti = createJiti(import.meta.url, { alias: { '@': root }, moduleCache: false })
const read = (f) => fs.readFileSync(path.join(root, f), 'utf8')
const walk = (d) => fs.readdirSync(d, { withFileTypes: true }).flatMap((e) => (e.isDirectory() ? walk(path.join(d, e.name)) : /\.(ts|tsx)$/.test(e.name) ? [path.join(d, e.name)] : []))
let passed = 0
async function test(name, fn) { await fn(); passed++; console.log(`  ✓ ${name}`) }
const ENV = ['NEXT_PUBLIC_SITE_URL', 'NEXT_PUBLIC_APP_URL', 'VERCEL_PROJECT_PRODUCTION_URL']
const withEnv = async (vars, fn) => {
  const saved = Object.fromEntries(ENV.map((k) => [k, process.env[k]]))
  for (const k of ENV) delete process.env[k]
  Object.assign(process.env, vars)
  try { return await fn(await jiti.import(path.join(root, 'lib/site/urls.ts'))) } finally { for (const k of ENV) { if (saved[k] === undefined) delete process.env[k]; else process.env[k] = saved[k] } }
}

console.log('SITE URLS')

await test('no production domain is written into app/, components/ or lib/', () => {
  const offenders = []
  for (const f of ['app', 'components', 'lib'].flatMap((d) => walk(path.join(root, d)))) {
    const src = fs.readFileSync(f, 'utf8')
    if (/https?:\/\/(?:[a-z0-9-]+\.)*(?:productionx\.(?:com|in)|regrow[a-z]*\.(?:com|in|app)\b|[a-z0-9-]+\.vercel\.app)/i.test(src)) offenders.push(path.relative(root, f))
  }
  assert.deepEqual(offenders, [])
})

await test('sources in order: app URL, Vercel production domain, request origin; site URL falls back to the app', async () => {
  await withEnv({ NEXT_PUBLIC_APP_URL: 'https://app.example.test/', VERCEL_PROJECT_PRODUCTION_URL: 'prod.example.test' }, (u) => {
    assert.equal(u.appUrl('https://req.example.test'), 'https://app.example.test')
    assert.equal(u.siteUrl(), 'https://app.example.test')
  })
  await withEnv({ VERCEL_PROJECT_PRODUCTION_URL: 'prod.example.test' }, (u) => assert.equal(u.appUrl('https://req.example.test'), 'https://prod.example.test'))
  await withEnv({}, (u) => {
    assert.equal(u.appUrl('https://req.example.test/x'), 'https://req.example.test')
    assert.equal(u.appUrl(), null, 'nothing known: no guessed domain')
    assert.equal(u.absolute('/pricing', null), '/pricing', 'relative link still works')
  })
  await withEnv({ NEXT_PUBLIC_SITE_URL: 'https://www.example.test', NEXT_PUBLIC_APP_URL: 'https://app.example.test' }, (u) => {
    assert.equal(u.siteUrl(), 'https://www.example.test'); assert.equal(u.appUrl(), 'https://app.example.test')
  })
})

await test('indexing: marketing pages and published showrooms only', async () => {
  await withEnv({}, (u) => {
    for (const p of ['/', '/pricing', '/demo', '/leakage-audit', '/privacy', '/terms', '/p/skyline-towers']) assert.equal(u.isIndexablePath(p), true, p)
    for (const p of ['/login', '/select-org', '/acme/leads', '/api/x', '/d/abc', '/invite/t', '/platform', '/p/a/b']) assert.equal(u.isIndexablePath(p), false, p)
  })
  const proxy = read('proxy.ts')
  assert.match(proxy, /X-Robots-Tag', 'noindex, nofollow'/)
  assert.match(proxy, /'\/robots\.txt', '\/sitemap\.xml'/, 'robots and sitemap are reachable without signing in')
})

await test('robots and sitemap come from the same configuration', async () => {
  await withEnv({ NEXT_PUBLIC_SITE_URL: 'https://www.example.test' }, async () => {
    const robots = (await jiti.import(path.join(root, 'app/robots.ts'))).default()
    assert.equal(robots.sitemap, 'https://www.example.test/sitemap.xml')
    for (const p of ['/api/', '/invite/', '/d/', '/platform']) assert.ok(robots.rules[0].disallow.includes(p), p)
    const sitemap = (await jiti.import(path.join(root, 'app/sitemap.ts'))).default()
    assert.deepEqual(sitemap.map((e) => e.url).slice(0, 4), ['https://www.example.test/', 'https://www.example.test/pricing', 'https://www.example.test/demo', 'https://www.example.test/leakage-audit'])
    assert.ok(!sitemap.some((e) => /\/(login|api|p)\b/.test(e.url)))
  })
})

await test('every marketing page declares its canonical path; the root layout sets metadataBase from config', () => {
  for (const [f, p] of [['app/page.tsx', '/'], ['app/pricing/page.tsx', '/pricing'], ['app/demo/page.tsx', '/demo'], ['app/leakage-audit/page.tsx', '/leakage-audit'], ['app/privacy/page.tsx', '/privacy'], ['app/terms/page.tsx', '/terms']]) {
    assert.match(read(f), new RegExp(`alternates: \\{ canonical: '${p.replace('/', '\\/')}' \\}`), f)
  }
  assert.match(read('app/layout.tsx'), /metadataBase: new URL\(SITE\)/)
})

console.log(`\nSite URLs: ${passed} checks passed.`)
