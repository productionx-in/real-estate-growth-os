'use client'
// components/settings/ProfileForm.tsx — your own name and phone (app/api/account/profile).
import { UserAvatar } from '@/components/ui/user-avatar'
import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { Alert, Button, Field, Input } from '@/components/ui'

export function ProfileForm({ initial, email, roleLabel, avatarUrl = null }: { initial: { fullName: string; phone: string }; email: string; roleLabel: string; avatarUrl?: string | null }) {
  const router = useRouter()
  const [v, setV] = useState(initial)
  const [busy, setBusy] = useState(false)
  const [msg, setMsg] = useState<{ tone: 'success' | 'danger'; text: string } | null>(null)
  const dirty = v.fullName !== initial.fullName || v.phone !== initial.phone

  async function save(e: React.FormEvent) {
    e.preventDefault(); setBusy(true); setMsg(null)
    try {
      const res = await fetch('/api/account/profile', { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(v) })
      const out = await res.json().catch(() => ({}))
      if (!res.ok) { setMsg({ tone: 'danger', text: out.error ?? 'Could not save.' }); return }
      setMsg({ tone: 'success', text: 'Saved.' }); router.refresh()
    } catch { setMsg({ tone: 'danger', text: 'Network error. Please try again.' }) } finally { setBusy(false) }
  }

  return (
    <form onSubmit={save} className="space-y-4">
      <div className="flex items-center gap-3">
        <UserAvatar name={v.fullName || email} src={avatarUrl} size={48} />
        <div>
          <p className="text-[14px] font-semibold text-foreground">{v.fullName || 'Your name'}</p>
          <p className="text-[12px] text-muted">{email} · {roleLabel}</p>
        </div>
      </div>
      <div className="grid gap-3 sm:grid-cols-2">
        <Field label="Full name" required><Input value={v.fullName} autoComplete="name" maxLength={80} onChange={(e) => setV({ ...v, fullName: e.target.value })} /></Field>
        <Field label="Phone" hint="Shown to buyers on documents you share."><Input value={v.phone} type="tel" autoComplete="tel" inputMode="tel" onChange={(e) => setV({ ...v, phone: e.target.value })} /></Field>
        <Field label="E-mail" hint="Your sign-in address. Ask REGrow support to change it."><Input value={email} readOnly /></Field>
        <Field label="Role" hint="Set by your workspace owner or admin."><Input value={roleLabel} readOnly /></Field>
      </div>
      {msg && <Alert tone={msg.tone}>{msg.text}</Alert>}
      <Button type="submit" loading={busy} disabled={!dirty}>Save profile</Button>
    </form>
  )
}
