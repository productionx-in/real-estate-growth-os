// app/api/profile/photo/route.ts — set (POST, multipart "photo") or remove (DELETE) the signed-in person's own profile
// photo (20260102). Anyone signed in, for themselves only. The file is checked from its bytes (JPEG, PNG or WebP, at
// most 2 MB) before it is stored.
import { NextResponse, type NextRequest } from 'next/server'
import { createClient, createServiceClient } from '@/lib/supabase/server'
import { MAX_PHOTO_BYTES, photoProblem } from '@/lib/profile/photo'
import { removeProfilePhoto, setProfilePhoto } from '@/lib/dal/profile-photo'

async function me(): Promise<string | null> {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return null
  const { data } = await createServiceClient().from('profiles').select('id').eq('auth_user_id', user.id).maybeSingle()
  return data?.id ?? null
}

export async function POST(request: NextRequest) {
  const profileId = await me()
  if (!profileId) return NextResponse.json({ error: 'Unauthorised' }, { status: 401 })
  if (Number(request.headers.get('content-length') ?? 0) > MAX_PHOTO_BYTES + 64 * 1024) return NextResponse.json({ error: 'That photo is larger than 2 MB. Choose a smaller one.' }, { status: 413 })
  const form = await request.formData().catch(() => null)
  const file = form?.get('photo')
  if (!(file instanceof Blob)) return NextResponse.json({ error: 'Choose a photo.' }, { status: 400 })
  const bytes = new Uint8Array(await file.arrayBuffer())
  const problem = photoProblem(bytes)
  if (problem) return NextResponse.json({ error: problem }, { status: 400 })
  const r = await setProfilePhoto(profileId, bytes)
  if (!r.ok) return NextResponse.json({ error: r.error }, { status: 500 })
  return NextResponse.json({ ok: true, url: r.url })
}

export async function DELETE() {
  const profileId = await me()
  if (!profileId) return NextResponse.json({ error: 'Unauthorised' }, { status: 401 })
  if (!(await removeProfilePhoto(profileId))) return NextResponse.json({ error: 'The photo could not be removed.' }, { status: 500 })
  return NextResponse.json({ ok: true })
}
