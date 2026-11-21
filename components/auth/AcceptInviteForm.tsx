'use client'
// components/auth/AcceptInviteForm.tsx
import { useState, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { ShieldCheck, UserCheck, ArrowRight, Loader2, AlertCircle } from 'lucide-react'
import { createClient } from '@/lib/supabase/client'
import { passwordProblem, PASSWORD_HINT, PASSWORD_MIN_LENGTH } from '@/lib/auth/password-policy'
import type { ValidatedInvitation } from '@/lib/dal/invitations'
import { ROLE_LABELS } from '@/lib/auth/permissions'
import { PasswordInput } from '@/components/auth/PasswordInput'
import Link from 'next/link'

interface AcceptInviteFormProps {
  invitation: ValidatedInvitation
  token: string
}


export function AcceptInviteForm({ invitation, token }: AcceptInviteFormProps) {
  const router = useRouter()
  const supabase = createClient()

  const [currentUser, setCurrentUser] = useState<{ id: string; email?: string } | null>(null)
  const [checkingAuth, setCheckingAuth] = useState(true)
  const [fullName, setFullName] = useState('')
  const [password, setPassword] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  // 'create' = new to REGrow; 'signin' = already has an account with this e-mail.
  const [mode, setMode] = useState<'create' | 'signin'>('create')

  useEffect(() => {
    async function checkSession() {
      try {
        const { data: { user } } = await supabase.auth.getUser()
        if (user) {
          setCurrentUser({ id: user.id, email: user.email })
        }
      } catch {
        // Not logged in
      } finally {
        setCheckingAuth(false)
      }
    }
    checkSession()
  }, [supabase])

  // Accept as currently authenticated user
  async function handleAcceptLoggedIn() {
    setLoading(true)
    setError(null)

    try {
      const res = await fetch('/api/invitations/accept', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ token }),
      })

      const data = await res.json()
      if (!res.ok) {
        setError(data.error || 'Failed to accept invitation')
        setLoading(false)
        return
      }

      router.push(`/${data.orgSlug}`)
      router.refresh()
    } catch {
      setError('Network error. Failed to accept invitation.')
      setLoading(false)
    }
  }

  // Create new account & accept invitation
  async function handleCreateAndAccept(e: React.FormEvent) {
    e.preventDefault()
    if (!fullName.trim() || passwordProblem(password, invitation.email) !== null) return

    setLoading(true)
    setError(null)

    try {
      // 1. Sign up user via Supabase
      const { data: authData, error: signUpError } = await supabase.auth.signUp({
        email: invitation.email,
        password,
        options: {
          data: { full_name: fullName.trim() },
          // If the project requires email verification, the link brings the person straight back to this invitation.
          emailRedirectTo: `${window.location.origin}/auth/callback?next=${encodeURIComponent(`/invite/${token}`)}`,
        },
      })

      if (signUpError) {
        // If user already exists, suggest logging in
        if (signUpError.message.toLowerCase().includes('already registered')) {
          setMode('signin'); setPassword('')
          setError(null)
          setLoading(false)
          return
        }
        throw signUpError
      }

      if (!authData.user) {
        throw new Error('User creation failed.')
      }
      // With e-mail confirmation on, an existing address comes back as a user with no identities.
      if (authData.user.identities && authData.user.identities.length === 0) {
        setMode('signin'); setPassword('')
        setLoading(false)
        return
      }
      if (!authData.session) {
        setError(`We sent a verification link to ${invitation.email}. Open it to confirm your email; you will come back here to join.`)
        setLoading(false)
        return
      }

      // 2. Accept invitation
      const res = await fetch('/api/invitations/accept', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ token }),
      })

      const data = await res.json()
      if (!res.ok) {
        throw new Error(data.error || 'Failed to join organisation')
      }

      router.push(`/${data.orgSlug}`)
      router.refresh()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Something went wrong')
    } finally {
      setLoading(false)
    }
  }

  // Already has an account: sign in with this invitation's e-mail, then accept.
  async function handleSignInAndAccept(e: React.FormEvent) {
    e.preventDefault()
    if (!password) return
    setLoading(true)
    setError(null)
    const { error: signInError } = await supabase.auth.signInWithPassword({ email: invitation.email, password })
    if (signInError) {
      setError('That password doesn’t match this account. Try again, or reset it with “Forgot password?”.')
      setLoading(false)
      return
    }
    await handleAcceptLoggedIn()
  }

  if (checkingAuth) {
    return (
      <div className="p-8 text-center text-[var(--foreground-muted)] text-[13px] flex items-center justify-center gap-2">
        <Loader2 className="w-4 h-4 animate-spin text-[var(--brand)]" />
        <span>Verifying invitation credentials…</span>
      </div>
    )
  }

  return (
    <div className="space-y-5">
      {/* Invitation Context Banner */}
      <div className="p-4 rounded-xl bg-brand-light/70 border border-brand/30 text-[13px] space-y-2">
        <div className="flex items-center gap-2 font-semibold text-brand">
          <ShieldCheck className="w-4 h-4 text-[var(--brand)]" />
          <span>Verified Organisation Invitation</span>
        </div>
        <div className="text-[12px] text-brand space-y-1">
          <p>
            <strong>{invitation.inviterName}</strong> has invited you to join <strong>{invitation.orgName}</strong> as a <strong>{ROLE_LABELS[invitation.role as keyof typeof ROLE_LABELS] ?? String(invitation.role).replace(/_/g, ' ')}</strong>.
          </p>
          <p className="text-[11px] text-brand">
            Work email: <span className="font-mono font-medium">{invitation.email}</span>
          </p>
        </div>
      </div>

      {error && (
        <div className="p-3 rounded-lg bg-[var(--danger-bg)] border border-danger/30 text-[12px] text-[var(--danger)] flex items-start gap-2">
          <AlertCircle className="w-4 h-4 flex-shrink-0 mt-0.5" />
          <span>{error}</span>
        </div>
      )}

      {currentUser ? (
        <div className="space-y-4 pt-2">
          <div className="p-3 rounded-lg bg-surface-muted border border-[var(--border)] text-[12px] text-[var(--foreground-muted)]">
            Signed in as <strong className="text-[var(--foreground)]">{currentUser.email}</strong>
          </div>

          <button
            type="button"
            onClick={handleAcceptLoggedIn}
            disabled={loading}
            className="w-full py-2.5 px-4 text-[13px] font-semibold text-brand-foreground bg-[var(--brand)] rounded-md hover:bg-[var(--brand-hover)] transition-colors flex items-center justify-center gap-2 disabled:opacity-60 shadow-2xs"
          >
            {loading ? <Loader2 className="w-4 h-4 animate-spin" /> : <UserCheck className="w-4 h-4" />}
            <span>Accept Invitation &amp; Enter Workspace</span>
          </button>
        </div>
      ) : mode === 'signin' ? (
        <form onSubmit={handleSignInAndAccept} className="space-y-4 pt-1">
          <div className="p-3 rounded-lg bg-surface-muted border border-[var(--border)] text-[12px] text-[var(--foreground-muted)]">
            You already have a REGrow account with <strong className="text-[var(--foreground)]">{invitation.email}</strong>. Sign in to join {invitation.orgName}.
          </div>
          <div>
            <div className="flex items-center justify-between mb-1">
              <label htmlFor="invite-password" className="block text-[12px] font-medium text-[var(--foreground)]">Password</label>
              <Link href="/login" className="text-[12px] text-[var(--brand)] hover:underline">Forgot password?</Link>
            </div>
            <PasswordInput id="invite-password" autoComplete="current-password" required autoFocus value={password} disabled={loading} onChange={(e) => setPassword(e.target.value)} placeholder="Your REGrow password" />
          </div>
          <button type="submit" disabled={loading || !password}
            className="w-full py-2.5 px-4 text-[13px] font-semibold text-brand-foreground bg-[var(--brand)] rounded-md hover:bg-[var(--brand-hover)] transition-colors flex items-center justify-center gap-2 disabled:opacity-60 shadow-2xs">
            {loading ? <Loader2 className="w-4 h-4 animate-spin" /> : <UserCheck className="w-4 h-4" />}
            <span>Sign in &amp; join {invitation.orgName}</span>
          </button>
          <p className="text-center text-[12px] text-[var(--foreground-muted)]">
            New to REGrow?{' '}
            <button type="button" onClick={() => { setMode('create'); setError(null); setPassword('') }} className="font-medium text-[var(--brand)] hover:underline">Create your account instead</button>
          </p>
        </form>
      ) : (
        <form onSubmit={handleCreateAndAccept} className="space-y-4 pt-1">
          <div>
            <label className="block text-[12px] font-medium text-[var(--foreground)] mb-1">
              Your Full Name <span className="text-[var(--danger)]">*</span>
            </label>
            <input
              type="text"
              required
              value={fullName}
              disabled={loading}
              onChange={(e) => setFullName(e.target.value)}
              placeholder="Aditya Sharma"
              className="w-full px-3 py-2 text-[13px] bg-[var(--surface)] border border-[var(--border)] rounded-md outline-none focus:border-[var(--brand)] focus:ring-2 focus:ring-brand-light transition-colors"
            />
          </div>

          <div>
            <label className="block text-[12px] font-medium text-[var(--foreground)] mb-1">
              Work Email
            </label>
            <input
              type="email"
              readOnly
              value={invitation.email}
              className="w-full px-3 py-2 text-[13px] bg-surface-muted border border-[var(--border)] rounded-md text-[var(--foreground-muted)] font-mono cursor-not-allowed"
            />
            <p className="text-[11px] text-[var(--foreground-subtle)] mt-1">
              This invitation is locked to this email address.
            </p>
          </div>

          <div>
            <label className="block text-[12px] font-medium text-[var(--foreground)] mb-1">
              Set Password <span className="text-[var(--danger)]">*</span>
            </label>
            <PasswordInput
              autoComplete="new-password"
              required
              minLength={PASSWORD_MIN_LENGTH}
              value={password}
              disabled={loading}
              onChange={(e) => setPassword(e.target.value)}
              placeholder={PASSWORD_HINT}
            />
          </div>

          <button
            type="submit"
            disabled={loading || !fullName.trim() || passwordProblem(password, invitation.email) !== null}
            className="w-full py-2.5 px-4 text-[13px] font-semibold text-brand-foreground bg-[var(--brand)] rounded-md hover:bg-[var(--brand-hover)] transition-colors flex items-center justify-center gap-2 disabled:opacity-60 shadow-2xs mt-2"
          >
            {loading ? <Loader2 className="w-4 h-4 animate-spin" /> : <ArrowRight className="w-4 h-4" />}
            <span>Set Password &amp; Join {invitation.orgName}</span>
          </button>
          <p className="text-center text-[12px] text-[var(--foreground-muted)]">
            Already have a REGrow account?{' '}
            <button type="button" onClick={() => { setMode('signin'); setError(null); setPassword('') }} className="font-medium text-[var(--brand)] hover:underline">Sign in to accept</button>
          </p>
        </form>
      )}
    </div>
  )
}
