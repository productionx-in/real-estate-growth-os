// scripts/check-website.cjs — crawl the public website from "/" and check every page a visitor can reach:
// HTTP 200, exactly one <h1>, a title and meta description, a canonical URL, valid JSON-LD without ratings or reviews,
// no horizontal scrolling on a phone, no console errors, and no broken internal links.
// Usage: node scripts/check-website.cjs http://localhost:3000   (any running build; no production access needed)
const { chromium, devices } = require('playwright')

const base = (process.argv[2] || 'http://localhost:3000').replace(/\/$/, '')
const SKIP = /^\/(login|api\/|auth\/|select-org|invite\/|d\/|p\/|platform|dev(\/|$))/

;(async () => {
  const browser = await chromium.launch()
  const ctx = await browser.newContext(devices['iPhone 13'])
  const page = await ctx.newPage()
  const errors = []
  page.on('console', (m) => { if (m.type() === 'error') errors.push(m.text()) })
  const queue = ['/'], seen = new Set(), problems = [], rows = []
  while (queue.length) {
    const path = queue.shift()
    if (seen.has(path)) continue
    seen.add(path)
    errors.length = 0
    const res = await page.goto(base + path, { waitUntil: 'networkidle' })
    const status = res ? res.status() : 0
    const info = await page.evaluate(() => {
      const ld = [...document.querySelectorAll('script[type="application/ld+json"]')].map((s) => s.textContent)
      return {
        h1: document.querySelectorAll('h1').length,
        title: document.title,
        desc: document.querySelector('meta[name="description"]')?.content ?? '',
        canonical: document.querySelector('link[rel="canonical"]')?.href ?? '',
        robots: document.querySelector('meta[name="robots"]')?.content ?? '',
        overflow: document.documentElement.scrollWidth > window.innerWidth + 1,
        ld,
        links: [...document.querySelectorAll('a[href]')].map((a) => a.getAttribute('href')),
        imgsWithoutAlt: [...document.querySelectorAll('img')].filter((i) => !i.hasAttribute('alt')).length,
      }
    })
    const types = []
    for (const raw of info.ld) {
      try {
        const j = JSON.parse(raw)
        for (const n of j['@graph'] ?? [j]) types.push(n['@type'])
        if (/aggregateRating|"review"/i.test(raw)) problems.push(`${path}: JSON-LD contains ratings or reviews`)
      } catch { problems.push(`${path}: JSON-LD does not parse`) }
    }
    const legal = /^\/(privacy|terms)$/.test(path)
    if (status !== 200) problems.push(`${path}: HTTP ${status}`)
    if (info.h1 !== 1) problems.push(`${path}: ${info.h1} h1 elements`)
    if (!info.title) problems.push(`${path}: no title`)
    if (info.desc.length < 50) problems.push(`${path}: description missing or short`)
    if (!info.canonical && !legal) problems.push(`${path}: no canonical`)
    if (info.overflow) problems.push(`${path}: horizontal scrolling on a phone`)
    if (info.imgsWithoutAlt) problems.push(`${path}: ${info.imgsWithoutAlt} images without alt`)
    if (errors.length) problems.push(`${path}: console errors: ${errors.join(' | ').slice(0, 200)}`)
    rows.push(`${status} ${path.padEnd(52)} h1=${info.h1} title=${info.title.length}c desc=${info.desc.length}c ld=[${types.join(',')}]${info.robots ? ` robots=${info.robots}` : ''}`)
    for (const href of info.links) {
      if (!href || !href.startsWith('/') || href.startsWith('//')) continue
      const p = href.split('#')[0].split('?')[0] || '/'
      if (SKIP.test(p) || seen.has(p)) continue
      queue.push(p)
    }
  }
  // Links into the app must at least respond (sign-in page), never 404.
  for (const p of ['/login']) { const r = await page.goto(base + p); if (r.status() !== 200) problems.push(`${p}: HTTP ${r.status()}`) }
  for (const p of ['/robots.txt', '/sitemap.xml', '/llms.txt']) { const r = await page.request.get(base + p); if (r.status() !== 200) problems.push(`${p}: HTTP ${r.status()}`) }
  console.log(rows.join('\n'))
  console.log(`\n${seen.size} pages crawled; ${problems.length} problem(s)`)
  for (const p of problems) console.log(`  ✗ ${p}`)
  await browser.close()
  process.exit(problems.length ? 1 : 0)
})()
