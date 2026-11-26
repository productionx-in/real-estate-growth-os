'use client'
// components/settings/SecurityPanels.tsx — change your password (lib/auth/password-policy.ts) and sign out of every
// other device. Both act only on the signed-in person's own account, through Supabase Auth in the browser.
import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { Eye, EyeOff } from 'lucide-react'
import { createClient } from '@/lib/supabase/client'
import { PASSWORD_HINT, passwordProblem } from '@/lib/auth/password-policy'
import { Alert, Button, Field, Input } from '@/components/ui'

function changeError(err: { code?: string; message?: string }): string {
  const code = err.code ?? ''
  const msg = err.message ?? ''
  if (code === 'same_password' || /same/i.test(msg)) return 'Choose a password you haven’t used for this account.'
  if (code === 'weak_password' || /weak|characters/i.test(msg)) return msg || 'Choose a stronger password.'
  if (code === 'reauthentication_needed') return 'For security, sign out and use “Forgot password” on the sign-in page to set a new one.'
  if (code === 'insufficient_aal') return 'Your account uses two-step verification: sign in again with your authenticator code, then try again.'
  if (code === 'session_not_found' || /session|jwt/i.test(msg)) return 'Your session has ended. Sign in again, then change your password.'
  return 'Couldn’t change the password. Please try again.'
}

export function ChangePasswordForm({ email }: { email: string }) {
  const [pw, setPw] = useState('')
  const [confirm, setConfirm] = useState('')
  const [show, setShow] = useState(false)
  const [busy, setBusy] = useState(false)
  const [msg, setMsg] = useState<{ tone: 'success' | 'danger'; text: string } | null>(null)
  const problem = pw ? passwordProblem(pw, email) : null
  const mismatch = confirm.length > 0 && confirm !== pw

  async function save(e: React.FormEvent) {
    e.preventDefault(); setMsg(null)
    if (problem || pw !== confirm) return
    setBusy(true)
    const { error } = await createClient().auth.updateUser({ password: pw })
    setBusy(false)
    if (error) { setMsg({ tone: 'danger', text: changeError(error) }); return }
    setPw(''); setConfirm('')
    setMsg({ tone: 'success', text: 'Password changed. Use it next time you sign in.' })
  }

  return (
    <form onSubmit={save} className="space-y-3">
      <div className="grid gap-3 sm:grid-cols-2">
        <Field label="New password" hint={PASSWORD_HINT} error={problem ?? undefined}>
          <div className="relative">
            <Input type={show ? 'text' : 'password'} value={pw} autoComplete="new-password" onChange={(e) => setPw(e.target.value)} className="pr-10" />
            <button type="button" onClick={() => setShow((s) => !s)} aria-label={show ? 'Hide password' : 'Show password'}
              className="absolute right-1 top-1/2 grid size-8 -translate-y-1/2 place-items-center rounded text-subtle hover:text-foreground">
              {show ? <EyeOff aria-hidden className="size-4" /> : <Eye aria-hidden className="size-4" />}
            </button>
          </div>
        </Field>
        <Field label="Confirm new password" error={mismatch ? 'The passwords don’t match.' : undefined}>
          <Input type={show ? 'text' : 'password'} value={confirm} autoComplete="new-password" onChange={(e) => setConfirm(e.target.value)} />
        </Field>
      </div>
      {msg && <Alert tone={msg.tone}>{msg.text}</Alert>}
      <Button type="submit" loading={busy} disabled={!pw || !!problem || pw !== confirm}>Change password</Button>
    </form>
  )
}

export function SignOutOthers() {
  const [busy, setBusy] = useState(false)
  const [done, setDone] = useState<string | null>(null)
  async function run() {
    if (!window.confirm('Sign out of RE on every other phone and computer? This device stays signed in.')) return
    setBusy(true)
    const { error } = await createClient().auth.signOut({ scope: 'others' })
    setBusy(false)
    setDone(error ? 'Couldn’t sign out the other devices. Please try again.' : 'Done. Every other device has been signed out.')
  }
  return (
    <div className="space-y-3">
      <p className="text-[13px] text-muted">Lost a phone, or signed in on a shared computer? Sign out everywhere except here.</p>
      {done && <Alert tone={done.startsWith('Done') ? 'success' : 'danger'}>{done}</Alert>}
      <Button variant="secondary" onClick={run} loading={busy}>Sign out other devices</Button>
    </div>
  )
}

/** Turning two-step verification off: the current code is asked again, so an unattended device can't do it. */
export function TwoStepOff({ lockedByWorkspace }: { lockedByWorkspace: boolean }) {
  const router = useRouter()
  const [open, setOpen] = useState(false)
  const [code, setCode] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  if (lockedByWorkspace) return <p className="text-[12px] text-muted">Your workspace requires it, so it can’t be turned off.</p>
  if (!open) return <Button variant="secondary" onClick={() => setOpen(true)}>Turn off</Button>
  async function run(e: React.FormEvent) {
    e.preventDefault()
    setBusy(true); setError(null)
    const supabase = createClient()
    const { data } = await supabase.auth.mfa.listFactors()
    const factor = data?.totp.find((f) => f.status === 'verified')
    if (!factor) { setBusy(false); router.refresh(); return }
    const { error: codeError } = await supabase.auth.mfa.challengeAndVerify({ factorId: factor.id, code: code.trim() })
    if (codeError) { setBusy(false); setError('That code didn’t match. Try the newest code from your authenticator app.'); return }
    const { error: offError } = await supabase.auth.mfa.unenroll({ factorId: factor.id })
    setBusy(false)
    if (offError) { setError('Couldn’t turn it off. Please try again.'); return }
    router.refresh()
  }
  return (
    <form onSubmit={run} className="w-full space-y-3">
      <Field label="Code from your authenticator app" hint="To confirm it’s you.">
        <Input value={code} onChange={(e) => setCode(e.target.value.replace(/\D/g, '').slice(0, 6))} inputMode="numeric" autoComplete="one-time-code" autoFocus placeholder="123456" />
      </Field>
      {error && <Alert tone="danger">{error}</Alert>}
      <div className="flex gap-2">
        <Button type="submit" variant="danger" loading={busy} disabled={code.length !== 6}>Turn off two-step verification</Button>
        <Button type="button" variant="ghost" onClick={() => { setOpen(false); setCode(''); setError(null) }}>Cancel</Button>
      </div>
    </form>
  )
}

/** Owners and admins: require two-step verification for every member of the workspace. */
export function RequireTwoStep({ orgId, initial, selfHasIt }: { orgId: string; initial: boolean; selfHasIt: boolean }) {
  const router = useRouter()
  const [on, setOn] = useState(initial)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  async function change(next: boolean) {
    if (next && !window.confirm('Everyone in this workspace will have to set up an authenticator app the next time they open it. Continue?')) return
    setBusy(true); setError(null)
    const res = await fetch('/api/settings/workspace', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ orgId, section: 'security', value: { requireTwoStep: next } }) })
    const out = await res.json().catch(() => ({}))
    setBusy(false)
    if (!res.ok) { setError(out.error ?? 'Couldn’t save. Please try again.'); return }
    setOn(next); router.refresh()
  }
  return (
    <div className="space-y-3">
      <label className="flex items-start justify-between gap-4">
        <span className="text-[13px] text-foreground">Require two-step verification for everyone
          <span className="block text-[12px] text-muted">Members without it are asked to set it up before they can use the workspace.</span>
        </span>
        <input type="checkbox" role="switch" className="mt-1 size-5 accent-[var(--brand)]" checked={on} disabled={busy || (!on && !selfHasIt)} onChange={(e) => change(e.target.checked)} aria-label="Require two-step verification for everyone" />
      </label>
      {!on && !selfHasIt && <p className="text-[12px] text-muted">Turn it on for your own account first.</p>}
      {error && <Alert tone="danger">{error}</Alert>}
    </div>
  )
}
