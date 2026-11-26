'use client'
// components/settings/ProfilePhoto.tsx — choose, preview and save your profile photo (20260102). The photo is cropped to
// a square from its centre and made 512 px on this device before upload, so it is small and loads fast; the server
// checks it again. Remove puts your initials back.
import { useRef, useState } from 'react'
import { useRouter } from 'next/navigation'
import { Camera, Trash2 } from 'lucide-react'
import { Button } from '@/components/ui'
import { UserAvatar } from '@/components/ui/user-avatar'
import { toast } from '@/components/ui/toast'

async function squareWebp(file: File, side = 512): Promise<Blob> {
  const bitmap = await createImageBitmap(file)
  const s = Math.min(bitmap.width, bitmap.height)
  const canvas = document.createElement('canvas')
  canvas.width = side; canvas.height = side
  const ctx = canvas.getContext('2d')!
  ctx.imageSmoothingQuality = 'high'
  ctx.drawImage(bitmap, (bitmap.width - s) / 2, (bitmap.height - s) / 2, s, s, 0, 0, side, side)
  bitmap.close()
  const blob = await new Promise<Blob | null>((r) => canvas.toBlob(r, 'image/webp', 0.88))
  if (blob && blob.type === 'image/webp') return blob
  return await new Promise<Blob>((r, j) => canvas.toBlob((b) => (b ? r(b) : j(new Error('encode'))), 'image/jpeg', 0.9))
}

export function ProfilePhoto({ name, initialUrl }: { name: string; initialUrl: string | null }) {
  const router = useRouter()
  const input = useRef<HTMLInputElement>(null)
  const [url, setUrl] = useState(initialUrl)
  const [busy, setBusy] = useState<'save' | 'remove' | null>(null)

  async function pick(file: File | undefined) {
    if (!file) return
    if (!file.type.startsWith('image/')) { toast.error('Choose a photo (JPEG, PNG or WebP).'); return }
    setBusy('save')
    try {
      const blob = await squareWebp(file).catch(() => file)
      const form = new FormData()
      form.append('photo', blob, 'photo')
      const res = await fetch('/api/profile/photo', { method: 'POST', body: form })
      const out = await res.json().catch(() => ({}))
      if (!res.ok) { toast.error(out.error ?? 'The photo could not be saved.'); return }
      setUrl(out.url); toast.success('📸 Looking good! Your photo is saved.'); router.refresh()
    } catch { toast.error('Network error. Please try again.') } finally { setBusy(null); if (input.current) input.current.value = '' }
  }
  async function remove() {
    setBusy('remove')
    try {
      const res = await fetch('/api/profile/photo', { method: 'DELETE' })
      if (!res.ok) { toast.error('The photo could not be removed.'); return }
      setUrl(null); toast.success('Photo removed.'); router.refresh()
    } catch { toast.error('Network error. Please try again.') } finally { setBusy(null) }
  }

  return (
    <div className="flex flex-wrap items-center gap-5">
      <button type="button" onClick={() => input.current?.click()} className="group relative rounded-full focus-visible:outline-none" aria-label="Change your photo" disabled={!!busy}>
        <UserAvatar name={name} src={url} size={88} className="surface-raised" />
        <span className="absolute -bottom-1 -right-1 grid size-8 place-items-center rounded-full bg-brand text-brand-foreground ring-4 ring-[var(--surface)] transition-transform group-hover:scale-105"><Camera className="size-4" aria-hidden /></span>
      </button>
      <div className="space-y-2">
        <p className="text-[13px] text-muted">Your photo shows to your team — in the header, team list, leaderboard and activity. A square photo of your face works best.</p>
        <div className="flex flex-wrap gap-2">
          <Button size="sm" onClick={() => input.current?.click()} loading={busy === 'save'} disabled={!!busy}><Camera aria-hidden /> {url ? 'Change photo' : 'Upload photo'}</Button>
          {url && <Button size="sm" variant="ghost" onClick={remove} loading={busy === 'remove'} disabled={!!busy}><Trash2 aria-hidden /> Remove</Button>}
        </div>
        <p className="text-[11px] text-subtle">JPEG, PNG or WebP, up to 2 MB.</p>
      </div>
      <input ref={input} type="file" accept="image/jpeg,image/png,image/webp" className="sr-only" tabIndex={-1} onChange={(e) => void pick(e.target.files?.[0])} />
    </div>
  )
}
