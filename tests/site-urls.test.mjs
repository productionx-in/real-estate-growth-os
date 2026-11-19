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
    const urls = sitemap.map((e) => e.url)
    assert.equal(urls[0], 'https://www.example.test/')
    for (const p of ['/pricing', '/demo', '/leakage-audit', '/inventory-management', '/developers', '/agencies']) assert.ok(urls.includes(`https://www.example.test${p}`), p)
    assert.equal(new Set(urls).size, urls.length, 'no duplicate URLs')
    assert.ok(!sitemap.some((e) => /\/(login|api|p)\b/.test(e.url)))
  })
})

await test('every marketing page declares its canonical path; the root layout sets metadataBase from config', () => {
  for (const [f, p] of [['app/page.tsx', '/'], ['app/pricing/page.tsx', '/pricing'], ['app/demo/page.tsx', '/demo'], ['app/leakage-audit/page.tsx', '/leakage-audit'], ['app/privacy/page.tsx', '/privacy'], ['app/terms/page.tsx', '/terms']]) {
    assert.match(read(f), new RegExp(`alternates: \\{ canonical: '${p.replace('/', '\\/')}' \\}`), f)
  }
  assert.match(read('app/layout.tsx'), /metadataBase: new URL\(SITE\)/)
})

await test('every marketing page is public, light-only, indexable, in the sitemap and declares its canonical', async () => {
  await withEnv({ NEXT_PUBLIC_SITE_URL: 'https://www.example.test' }, async (u) => {
    const { themeRuntime } = await jiti.import(path.join(root, 'lib/theme/runtime.ts'))
    const T = themeRuntime()
    const sitemap = (await jiti.import(path.join(root, 'app/sitemap.ts'))).default().map((e) => e.url)
    assert.match(read('proxy.ts'), /PUBLIC_ROUTES = \[\.\.\.MARKETING_PATHS/)
    for (const p of u.MARKETING_PATHS) {
      assert.equal(T.lightOnly(p), true, `${p} light-only`)
      assert.equal(u.isIndexablePath(p), true, `${p} indexable`)
      assert.ok(sitemap.includes(`https://www.example.test${p === '/' ? '/' : p}`), `${p} in sitemap`)
      const file = p === '/' ? 'app/page.tsx' : `app${p}/page.tsx`
      const src = read(file), esc = p.replace(/\//g, '\\/')
      assert.ok(new RegExp(`canonical: '${esc}'`).test(src) || (new RegExp(`path: '${esc}'`).test(src) && /(product|article)Metadata\(/.test(src)), `${file} canonical`)
    }
  })
})

await test('OAuth callbacks and invitation links use the configured app URL, never the request host', async () => {
  await withEnv({ NEXT_PUBLIC_APP_URL: 'https://app.example.test' }, async () => {
    const g = await jiti.import(path.join(root, 'lib/integrations/google/config.ts'))
    const m = await jiti.import(path.join(root, 'lib/integrations/meta/config.ts'))
    const saved = process.env.GOOGLE_REDIRECT_URI; delete process.env.GOOGLE_REDIRECT_URI
    assert.equal(g.getGoogleOAuthRedirectUri('https://preview-123.vercel.app'), 'https://app.example.test/api/integrations/google/callback')
    assert.equal(m.getMetaOAuthRedirectUri('https://evil.example'), 'https://app.example.test/api/integrations/meta/callback')
    if (saved !== undefined) process.env.GOOGLE_REDIRECT_URI = saved
  })
  for (const f of ['app/api/admin/organisations/provision/route.ts', 'app/api/admin/invitations/retry/route.ts', 'app/api/team/invite/route.ts']) {
    assert.match(read(f), /const origin = appUrl\(request\.nextUrl\.origin\) \?\? request\.nextUrl\.origin/, f)
  }
})

await test('the public website names no competitor in navigation, headings, metadata or copy', () => {
  const walk = (d) => fs.readdirSync(path.join(root, d), { withFileTypes: true }).flatMap((e) => e.isDirectory() ? walk(path.join(d, e.name)) : [path.join(d, e.name)])
  const files = ['app/page.tsx', 'app/pricing/page.tsx', 'app/demo/page.tsx', 'app/leakage-audit/page.tsx', 'app/migration/page.tsx', ...walk('components/marketing'), 'components/audit/LeakageAudit.tsx', 'lib/marketing/pricing.ts']
    .filter((f) => fs.existsSync(path.join(root, f)))
  for (const f of files) assert.doesNotMatch(read(f), /sell\.?do|leadsquared|telecrm|salesforce|zoho|hubspot|kylas|privyr/i, f)
})

console.log(`\nSite URLs: ${passed} checks passed.`)
