// lib/profile/photo.ts — profile photos (20260102): what an upload may be, recognised from its first bytes (never from
// its name or the browser's word), and initials for people without a photo. Pure; shared by the API and the tests.
export const AVATAR_BUCKET = 'avatars'
export const MAX_PHOTO_BYTES = 2 * 1024 * 1024
export type PhotoType = 'jpg' | 'png' | 'webp'
export const CONTENT_TYPE: Record<PhotoType, string> = { jpg: 'image/jpeg', png: 'image/png', webp: 'image/webp' }

/** The image type from the file's first bytes, or null if it is not a JPEG, PNG or WebP. */
export function sniffPhoto(b: Uint8Array): PhotoType | null {
  if (b.length >= 3 && b[0] === 0xff && b[1] === 0xd8 && b[2] === 0xff) return 'jpg'
  if (b.length >= 8 && b[0] === 0x89 && b[1] === 0x50 && b[2] === 0x4e && b[3] === 0x47 && b[4] === 0x0d && b[5] === 0x0a && b[6] === 0x1a && b[7] === 0x0a) return 'png'
  if (b.length >= 12 && String.fromCharCode(...b.slice(0, 4)) === 'RIFF' && String.fromCharCode(...b.slice(8, 12)) === 'WEBP') return 'webp'
  return null
}

/** Why this file cannot be a profile photo, or null. */
export function photoProblem(b: Uint8Array): string | null {
  if (b.length === 0) return 'Choose a photo.'
  if (b.length > MAX_PHOTO_BYTES) return 'That photo is larger than 2 MB. Choose a smaller one.'
  if (!sniffPhoto(b)) return 'Use a JPEG, PNG or WebP photo.'
  return null
}

/** "Asha Menon" → "AM". */
export function initials(name: string | null | undefined): string {
  return (name || '?').trim().split(/\s+/).filter(Boolean).map((p) => p[0]).slice(0, 2).join('').toUpperCase() || '?'
}
