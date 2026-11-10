// lib/utils/slugify.ts
export function slugify(input: string): string {
  return input
    .toLowerCase()
    .trim()
    .replace(/[^\w\s-]/g, '')
    .replace(/[\s_]+/g, '-')
    .replace(/^-+|-+$/g, '')
}

export function generateUniqueSlug(base: string, suffix?: string): string {
  const baseSlug = slugify(base)
  if (suffix) return `${baseSlug}-${suffix}`
  return baseSlug
}
