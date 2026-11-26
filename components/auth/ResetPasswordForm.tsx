'use client'
// components/auth/ResetPasswordForm.tsx
// Last step of password recovery. The reset email's link goes through /auth/callback, which exchanges the
// one-time code for a short recovery session and lands here; without that session there is nothing to reset.
import { useEffect, useState } from 'react'
import { Input } from '@/components/ui'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { CheckCircle2, Eye, EyeOff, Loader2 } from 'lucide-react'
import { createClient } from '@/lib/supabase/client'
import { PASSWORD_HINT, PASSWORD_MIN_LENGTH, passwordProblem } from '@/lib/auth/password-policy'

export function ResetPasswordForm() {
  const router = useRouter()
  const supabase = createClient()
  const [email, setEmail] = useState<string | null>(null)
  const [ready, setReady] = useState<'checking' | 'ok' | 'no-session'>('checking')
  const [password, setPassword] = useState('')
  const [confirm, setConfirm] = useState('')
  const [show, setShow] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  const [done, setDone] = useState(false)
  // Accounts with two-step verification (all RE staff) must enter their authenticator code before Supabase
  // lets the password change: the recovery link alone is only the first step (AAL1).
  const [mfaFactor, setMfaFactor] = useState<string | null>(null)
  const [code, setCode] = useState('')

  useEffect(() => {
    let alive = true
    supabase.auth.getUser().then(async ({ data }) => {
      if (!alive) return
      setEmail(data.user?.email ?? null)
      if (data.user) {
        const { data: aal } = await supabase.auth.mfa.getAuthenticatorAssuranceLevel()
        if (aal?.nextLevel === 'aal2' && aal.currentLevel !== 'aal2') {
          const { data: f } = await supabase.auth.mfa.listFactors()
          const totp = f?.totp?.find((x) => x.status === 'verified')
          if (alive && totp) setMfaFactor(totp.id)
        }
      }
      if (alive) setReady(data.user ? 'ok' : 'no-session')
    })
    return () => { alive = false }
  }, [supabase])

  async function submit(e: React.FormEvent) {
    e.preventDefault()
    setError(null)
    const problem = passwordProblem(password, email)
    if (problem) { setError(problem); return }
    if (password !== confirm) { setError('The two passwords don’t match.'); return }
    if (mfaFactor && !/^\d{6}$/.test(code.trim())) { setError('Enter the 6-digit code from your authenticator app.'); return }
    setBusy(true)
    if (mfaFactor) {
      const { error: mfaError } = await supabase.auth.mfa.challengeAndVerify({ factorId: mfaFactor, code: code.trim() })
      if (mfaError) { setBusy(false); setError('That code didn’t work. Check your authenticator app and try the newest code.'); return }
    }
    const { error: updateError } = await supabase.auth.updateUser({ password })
    if (updateError) {
      setBusy(false)
      setError(resetErrorMessage(updateError))
      return
    }
    // Anyone else signed in with the old password is signed out; this browser stays signed in.
    await supabase.auth.signOut({ scope: 'others' }).catch(() => undefined)
    setDone(true)
    setBusy(false)
    setTimeout(() => { router.push('/select-org'); router.refresh() }, 1500)
  }

  if (ready === 'checking') {
    return <p className="text-sm text-[var(--foreground-muted)] flex items-center gap-2"><Loader2 className="w-4 h-4 animate-spin" />Checking your reset link…</p>
  }
  if (ready === 'no-session') {
    return (
      <div className="space-y-3 text-sm">
        <p className="text-[var(--foreground)]">This reset link has expired, was already used, or was opened in a different browser from the one you requested it in.</p>
        <Link href="/login?mode=forgot" className="inline-block font-semibold text-[var(--brand)] hover:underline">Request a new link</Link>
      </div>
    )
  }
  if (done) {
    return (
      <p role="status" className="p-4 rounded-xl bg-success-bg border border-success/30 text-success text-sm flex items-center gap-2">
        <CheckCircle2 className="w-4 h-4" />Password updated. Taking you to your workspace…
      </p>
    )
  }
  return (
    <form onSubmit={submit} className="space-y-4" noValidate>
      {email && <p className="text-sm text-[var(--foreground-muted)]">For <strong className="text-[var(--foreground)]">{email}</strong></p>}
      <div className="space-y-1">
        <label htmlFor="new-password" className="block text-sm font-medium">New password</label>
        <div className="relative">
          <Input id="new-password" type={show ? 'text' : 'password'} autoComplete="new-password" required minLength={PASSWORD_MIN_LENGTH}
            value={password} onChange={(e) => setPassword(e.target.value)} aria-describedby="password-help"
            className="pr-10 focus:ring-brand-light" />
          <button type="button" onClick={() => setShow((v) => !v)} aria-label={show ? 'Hide password' : 'Show password'}
            className="absolute inset-y-0 right-0 px-3 text-[var(--foreground-muted)] hover:text-[var(--foreground)]">
            {show ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
          </button>
        </div>
        <p id="password-help" className="text-xs text-[var(--foreground-muted)]">{PASSWORD_HINT}</p>
      </div>
      <div className="space-y-1">
        <label htmlFor="confirm-password" className="block text-sm font-medium">Confirm new password</label>
        <Input id="confirm-password" type={show ? 'text' : 'password'} autoComplete="new-password" required
          value={confirm} onChange={(e) => setConfirm(e.target.value)}
          className="focus:ring-brand-light" />
      </div>
      {mfaFactor && (
        <div className="space-y-1">
          <label htmlFor="mfa-code" className="block text-sm font-medium">Authenticator code</label>
          <Input id="mfa-code" inputMode="numeric" autoComplete="one-time-code" pattern="[0-9]*" maxLength={6} required
            value={code} onChange={(e) => setCode(e.target.value.replace(/\D/g, ''))}
            className="tracking-[0.3em] focus:ring-brand-light" />
          <p className="text-xs text-[var(--foreground-muted)]">Your account uses two-step verification: enter the 6-digit code from your authenticator app.</p>
        </div>
      )}
      {error && <p role="alert" className="p-3 rounded-md bg-[var(--danger-bg)] border border-danger/30 text-sm text-[var(--danger)]">{error}</p>}
      <button type="submit" disabled={busy}
        className="btn-primary w-full py-2.5 px-4 text-sm font-semibold text-brand-foreground bg-[var(--brand)] rounded-md hover:bg-[var(--brand-hover)] disabled:opacity-60 flex items-center justify-center gap-2">
        {busy && <Loader2 className="w-4 h-4 animate-spin" />}Save new password
      </button>
    </form>
  )
}

/** What to tell the person when Supabase refuses the new password. Only a missing or expired session says
 *  "expired"; everything else says what is actually wrong. */
export function resetErrorMessage(err: { code?: string; message?: string }): string {
  const code = err.code ?? ''
  const msg = err.message ?? ''
  if (code === 'same_password' || /same/i.test(msg)) return 'Choose a password you haven’t used for this account.'
  if (code === 'weak_password' || /password should|weak|characters/i.test(msg)) return msg || 'Choose a stronger password.'
  if (code === 'insufficient_aal' || /aal2|AAL2/.test(msg)) return 'Your account uses two-step verification. Reload this page and enter your authenticator code too.'
  if (code === 'reauthentication_needed') return 'For security, request a new reset link and use it straight away.'
  if (code === 'session_not_found' || code === 'session_expired' || /session|jwt|expired/i.test(msg)) return 'Your reset link has expired. Request a new one from the sign-in page.'
  return msg ? `Couldn’t save the new password: ${msg}` : 'Couldn’t save the new password. Please try again.'
}
