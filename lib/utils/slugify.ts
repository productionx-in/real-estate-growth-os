// lib/utils/slugify.ts
export function slugify(input: string): string {
  return input
    .toLowerCase()
    .trim()
    .replace(/[^\w\s-]/g, '')
    .replace(/[\s_]+/g, '-')
    .replace(/^-+|-+$/g, '')
}

export const RESERVED_SLUGS = new Set([
  'api',
  'auth',
  'login',
  'register',
  'select-org',
  'create-org',
  'my',
  'settings',
  'favicon.ico',
  'robots.txt',
  'sitemap.xml',
  '_next',
])

export function isReservedSlug(slug: string): boolean {
  return RESERVED_SLUGS.has(slug.toLowerCase().trim())
}

export function generateUniqueSlug(base: string, suffix?: string): string {
  let baseSlug = slugify(base)
  if (isReservedSlug(baseSlug)) {
    baseSlug = `${baseSlug}-ws`
  }
  if (suffix) return `${baseSlug}-${suffix}`
  return baseSlug
}
