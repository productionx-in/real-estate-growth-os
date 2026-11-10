'use client'
// components/auth/RegisterForm.tsx
// Two-step registration: account details → organisation details
// Slug is auto-generated from org name. Only Developer and Channel Partner types.
import { useState } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import { createClient } from '@/lib/supabase/client'
import { slugify } from '@/lib/utils/slugify'

type Step = 'account' | 'org'
type OrgType = 'developer' | 'channel_partner'

const ORG_TYPES: { value: OrgType; label: string; description: string }[] = [
  {
    value: 'developer',
    label: 'Property Developer / Builder',
    description: 'Build and sell residential or commercial projects',
  },
  {
    value: 'channel_partner',
    label: 'Channel Partner',
    description: 'Sell properties on behalf of developers',
  },
]

export function RegisterForm() {
  const router = useRouter()
  const supabase = createClient()

  const [step, setStep] = useState<Step>('account')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  // Account fields
  const [fullName, setFullName] = useState('')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')

  // Org fields
  const [orgName, setOrgName] = useState('')
  const [orgType, setOrgType] = useState<OrgType>('developer')

  function handleAccountNext(e: React.FormEvent) {
    e.preventDefault()
    if (!fullName.trim() || !email.trim() || password.length < 8) return
    setStep('org')
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setError(null)
    setLoading(true)

    try {
      // 1. Create auth user
      const { data: authData, error: signUpError } = await supabase.auth.signUp({
        email,
        password,
        options: {
          data: { full_name: fullName },
          emailRedirectTo: `${window.location.origin}/auth/callback`,
        },
      })

      if (signUpError) throw signUpError
      if (!authData.user) throw new Error('User creation failed')

      // 2. Create org via API (service role, bypasses RLS on first insert)
      const response = await fetch('/api/orgs', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: orgName.trim(),
          slug: slugify(orgName.trim()),
          type: orgType,
        }),
      })

      if (!response.ok) {
        const data = await response.json()
        throw new Error(data.error ?? 'Failed to create organisation')
      }

      router.push('/login?message=Check+your+email+to+confirm+your+account')
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Something went wrong')
    } finally {
      setLoading(false)
    }
  }

  // Step indicator
  const steps: { key: Step; label: string }[] = [
    { key: 'account', label: 'Your details' },
    { key: 'org', label: 'Organisation' },
  ]

  return (
    <div>
      {/* Step indicator */}
      <div className="flex items-center gap-3 mb-7">
        {steps.map((s, i) => {
          const isActive = step === s.key
          const isDone = step === 'org' && s.key === 'account'
          return (
            <div key={s.key} className="flex items-center gap-2">
              <div
                className={`w-6 h-6 rounded-full flex items-center justify-center text-[11px] font-bold transition-colors ${
                  isActive
                    ? 'bg-[var(--brand)] text-white'
                    : isDone
                    ? 'bg-[var(--brand)] text-white'
                    : 'bg-[var(--surface-hover)] text-[var(--foreground-muted)]'
                }`}
              >
                {isDone ? '✓' : i + 1}
              </div>
              <span
                className={`text-[12px] font-medium ${
                  isActive ? 'text-[var(--foreground)]' : 'text-[var(--foreground-muted)]'
                }`}
              >
                {s.label}
              </span>
              {i === 0 && (
                <span className="text-[var(--border-strong)] text-[12px] ml-1">›</span>
              )}
            </div>
          )
        })}
      </div>

      {error && (
        <div className="mb-5 p-3 rounded-md bg-[var(--danger-bg)] border border-red-100 text-[13px] text-[var(--danger)]">
          {error}
        </div>
      )}

      {/* ── Step 1: Account ── */}
      {step === 'account' && (
        <form onSubmit={handleAccountNext} className="space-y-4">
          <div className="space-y-1.5">
            <label htmlFor="fullName" className="block text-[13px] font-medium text-[var(--foreground)]">
              Full name
            </label>
            <input
              id="fullName"
              type="text"
              required
              autoFocus
              value={fullName}
              onChange={(e) => setFullName(e.target.value)}
              className="w-full px-3 py-2.5 text-[13px] bg-[var(--surface)] border border-[var(--border)] rounded-md outline-none focus:border-[var(--brand)] focus:ring-2 focus:ring-blue-100 transition-colors"
              placeholder="Rahul Sharma"
            />
          </div>

          <div className="space-y-1.5">
            <label htmlFor="regEmail" className="block text-[13px] font-medium text-[var(--foreground)]">
              Work email
            </label>
            <input
              id="regEmail"
              type="email"
              required
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              className="w-full px-3 py-2.5 text-[13px] bg-[var(--surface)] border border-[var(--border)] rounded-md outline-none focus:border-[var(--brand)] focus:ring-2 focus:ring-blue-100 transition-colors"
              placeholder="rahul@company.com"
            />
          </div>

          <div className="space-y-1.5">
            <label htmlFor="regPassword" className="block text-[13px] font-medium text-[var(--foreground)]">
              Password
            </label>
            <input
              id="regPassword"
              type="password"
              required
              minLength={8}
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              className="w-full px-3 py-2.5 text-[13px] bg-[var(--surface)] border border-[var(--border)] rounded-md outline-none focus:border-[var(--brand)] focus:ring-2 focus:ring-blue-100 transition-colors"
              placeholder="At least 8 characters"
            />
          </div>

          <button
            type="submit"
            className="w-full py-2.5 px-4 text-[13px] font-medium text-white bg-[var(--brand)] rounded-md hover:bg-[var(--brand-hover)] transition-colors mt-2"
          >
            Continue →
          </button>

          <p className="text-center text-[12px] text-[var(--foreground-muted)]">
            Already have an account?{' '}
            <Link href="/login" className="text-[var(--brand)] hover:underline font-medium">
              Sign in
            </Link>
          </p>
        </form>
      )}

      {/* ── Step 2: Organisation ── */}
      {step === 'org' && (
        <form onSubmit={handleSubmit} className="space-y-5">
          <div className="space-y-1.5">
            <label htmlFor="orgName" className="block text-[13px] font-medium text-[var(--foreground)]">
              Organisation name
            </label>
            <input
              id="orgName"
              type="text"
              required
              autoFocus
              value={orgName}
              onChange={(e) => setOrgName(e.target.value)}
              className="w-full px-3 py-2.5 text-[13px] bg-[var(--surface)] border border-[var(--border)] rounded-md outline-none focus:border-[var(--brand)] focus:ring-2 focus:ring-blue-100 transition-colors"
              placeholder="Prestige Group"
            />
            {orgName && (
              <p className="text-[11px] text-[var(--foreground-subtle)] mt-1">
                Workspace:{' '}
                <span className="font-mono text-[var(--foreground-muted)]">
                  /{slugify(orgName)}
                </span>
              </p>
            )}
          </div>

          <div className="space-y-2">
            <label className="block text-[13px] font-medium text-[var(--foreground)]">
              Organisation type
            </label>
            <div className="space-y-2">
              {ORG_TYPES.map((type) => (
                <label
                  key={type.value}
                  className={`flex items-start gap-3 p-3 rounded-lg border cursor-pointer transition-colors ${
                    orgType === type.value
                      ? 'border-[var(--brand)] bg-[var(--brand-light)]'
                      : 'border-[var(--border)] hover:border-[var(--border-strong)] hover:bg-[var(--surface-hover)]'
                  }`}
                >
                  <input
                    type="radio"
                    name="orgType"
                    value={type.value}
                    checked={orgType === type.value}
                    onChange={() => setOrgType(type.value)}
                    className="mt-0.5 accent-[var(--brand)]"
                  />
                  <div>
                    <div className="text-[13px] font-medium text-[var(--foreground)]">
                      {type.label}
                    </div>
                    <div className="text-[12px] text-[var(--foreground-muted)] mt-0.5">
                      {type.description}
                    </div>
                  </div>
                </label>
              ))}
            </div>
          </div>

          <div className="flex gap-2 pt-1">
            <button
              type="button"
              onClick={() => setStep('account')}
              className="flex-1 py-2.5 px-4 text-[13px] font-medium text-[var(--foreground)] bg-[var(--surface)] border border-[var(--border)] rounded-md hover:bg-[var(--surface-hover)] transition-colors"
            >
              ← Back
            </button>
            <button
              type="submit"
              disabled={loading || !orgName.trim()}
              className="flex-1 py-2.5 px-4 text-[13px] font-medium text-white bg-[var(--brand)] rounded-md hover:bg-[var(--brand-hover)] disabled:opacity-60 disabled:cursor-not-allowed transition-colors"
            >
              {loading ? 'Creating workspace…' : 'Create workspace'}
            </button>
          </div>
        </form>
      )}
    </div>
  )
}
