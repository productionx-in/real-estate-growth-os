'use client'
// components/auth/ResetPasswordForm.tsx
// Last step of password recovery. The reset email's link goes through /auth/callback, which exchanges the
// one-time code for a short recovery session and lands here; without that session there is nothing to reset.
import { useEffect, useState } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { CheckCircle2, Eye, EyeOff, Loader2 } from 'lucide-react'
import { createClient } from '@/lib/supabase/client'
import { PASSWORD_MIN_LENGTH, passwordProblem } from '@/lib/auth/password-policy'

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

  useEffect(() => {
    let alive = true
    supabase.auth.getUser().then(({ data }) => {
      if (!alive) return
      setEmail(data.user?.email ?? null)
      setReady(data.user ? 'ok' : 'no-session')
    })
    return () => { alive = false }
  }, [supabase])

  async function submit(e: React.FormEvent) {
    e.preventDefault()
    setError(null)
    const problem = passwordProblem(password, email)
    if (problem) { setError(problem); return }
    if (password !== confirm) { setError('The two passwords don’t match.'); return }
    setBusy(true)
    const { error: updateError } = await supabase.auth.updateUser({ password })
    if (updateError) {
      setBusy(false)
      setError(/same/i.test(updateError.message) ? 'Choose a password you haven’t used for this account.' : 'Your reset link has expired. Request a new one from the sign-in page.')
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
        <p className="text-[var(--foreground)]">This reset link has expired or was already used.</p>
        <Link href="/login" className="inline-block font-semibold text-[var(--brand)] hover:underline">Request a new link</Link>
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
          <input id="new-password" type={show ? 'text' : 'password'} autoComplete="new-password" required minLength={PASSWORD_MIN_LENGTH}
            value={password} onChange={(e) => setPassword(e.target.value)} aria-describedby="password-help"
            className="w-full px-3 py-2.5 pr-10 text-base sm:text-sm bg-[var(--surface)] border border-[var(--border)] rounded-md outline-none focus:border-[var(--brand)] focus:ring-2 focus:ring-blue-100" />
          <button type="button" onClick={() => setShow((v) => !v)} aria-label={show ? 'Hide password' : 'Show password'}
            className="absolute inset-y-0 right-0 px-3 text-[var(--foreground-muted)] hover:text-[var(--foreground)]">
            {show ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
          </button>
        </div>
        <p id="password-help" className="text-xs text-[var(--foreground-muted)]">At least {PASSWORD_MIN_LENGTH} characters, with a letter and a number.</p>
      </div>
      <div className="space-y-1">
        <label htmlFor="confirm-password" className="block text-sm font-medium">Confirm new password</label>
        <input id="confirm-password" type={show ? 'text' : 'password'} autoComplete="new-password" required
          value={confirm} onChange={(e) => setConfirm(e.target.value)}
          className="w-full px-3 py-2.5 text-base sm:text-sm bg-[var(--surface)] border border-[var(--border)] rounded-md outline-none focus:border-[var(--brand)] focus:ring-2 focus:ring-blue-100" />
      </div>
      {error && <p role="alert" className="p-3 rounded-md bg-[var(--danger-bg)] border border-danger/30 text-sm text-[var(--danger)]">{error}</p>}
      <button type="submit" disabled={busy}
        className="w-full py-2.5 px-4 text-sm font-semibold text-white bg-[var(--brand)] rounded-md hover:bg-[var(--brand-hover)] disabled:opacity-60 flex items-center justify-center gap-2">
        {busy && <Loader2 className="w-4 h-4 animate-spin" />}Save new password
      </button>
    </form>
  )
}
