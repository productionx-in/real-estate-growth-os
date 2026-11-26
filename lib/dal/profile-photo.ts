// lib/dal/profile-photo.ts — store and remove a person's profile photo (20260102). Only ever for the signed-in person's
// own profile: the API passes the profile id it verified. Files go to <profile id>/<random>.<ext> in the avatars bucket;
// earlier files of that person are removed so only the current photo remains.
import { randomUUID } from 'node:crypto'
import { createServiceClient } from '@/lib/supabase/server'
import { AVATAR_BUCKET, CONTENT_TYPE, sniffPhoto } from '@/lib/profile/photo'

const storage = () => createServiceClient().storage.from(AVATAR_BUCKET)

async function clearOthers(profileId: string, keep: string | null) {
  const { data } = await storage().list(profileId, { limit: 100 })
  const old = (data ?? []).map((f) => `${profileId}/${f.name}`).filter((p) => p !== keep)
  if (old.length) await storage().remove(old)
}

export async function setProfilePhoto(profileId: string, bytes: Uint8Array): Promise<{ ok: true; url: string } | { ok: false; error: string }> {
  const type = sniffPhoto(bytes)
  if (!type) return { ok: false, error: 'Use a JPEG, PNG or WebP photo.' }
  const path = `${profileId}/${randomUUID()}.${type}`
  const { error } = await storage().upload(path, bytes, { contentType: CONTENT_TYPE[type], upsert: false, cacheControl: '31536000' })
  if (error) return { ok: false, error: 'The photo could not be saved. Please try again.' }
  const url = storage().getPublicUrl(path).data.publicUrl
  const { error: upd } = await createServiceClient().from('profiles').update({ avatar_url: url }).eq('id', profileId)
  if (upd) { await storage().remove([path]); return { ok: false, error: 'The photo could not be saved. Please try again.' } }
  await clearOthers(profileId, path)
  return { ok: true, url }
}

export async function removeProfilePhoto(profileId: string): Promise<boolean> {
  const { error } = await createServiceClient().from('profiles').update({ avatar_url: null }).eq('id', profileId)
  if (error) return false
  await clearOthers(profileId, null)
  return true
}
