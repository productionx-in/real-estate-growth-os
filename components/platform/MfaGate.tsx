'use client'
// Two-step verification for REGrow staff. Every console screen needs an MFA-verified session (AAL2).
// First visit: scan a QR code into an authenticator app and confirm a code. Later visits: enter a code.
import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { ShieldCheck } from 'lucide-react'
import { createClient } from '@/lib/supabase/client'
import { Alert, Button, Card, CardContent, Field, Input, Spinner } from '@/components/ui'

type Step = { kind: 'loading' } | { kind: 'enrol'; factorId: string; qr: string; secret: string } | { kind: 'verify'; factorId: string }

export function MfaGate() {
  const router = useRouter()
  const [step, setStep] = useState<Step>({ kind: 'loading' })
  const [code, setCode] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)

  useEffect(() => {
    const supabase = createClient()
    ;(async () => {
      const { data, error: listError } = await supabase.auth.mfa.listFactors()
      if (listError) return setError('Could not check two-step verification. Refresh the page.')
      const verified = data.totp.find((f) => f.status === 'verified')
      if (verified) return setStep({ kind: 'verify', factorId: verified.id })
      // Remove abandoned, never-verified factors before starting again.
      for (const f of data.all.filter((f) => f.status !== 'verified')) await supabase.auth.mfa.unenroll({ factorId: f.id })
      const { data: enrolled, error: enrolError } = await supabase.auth.mfa.enroll({ factorType: 'totp', friendlyName: 'REGrow console' })
      if (enrolError || !enrolled) return setError('Could not start two-step verification setup.')
      setStep({ kind: 'enrol', factorId: enrolled.id, qr: enrolled.totp.qr_code, secret: enrolled.totp.secret })
    })()
  }, [])

  async function confirm(e: React.FormEvent) {
    e.preventDefault()
    if (step.kind === 'loading') return
    setBusy(true)
    setError(null)
    const supabase = createClient()
    const { error: verifyError } = await supabase.auth.mfa.challengeAndVerify({ factorId: step.factorId, code: code.trim() })
    setBusy(false)
    if (verifyError) return setError('That code didn’t match. Check the time on your phone and try the newest code.')
    router.refresh()
  }

  return (
    <main className="flex min-h-[70vh] items-center justify-center px-4 py-12">
      <Card className="w-full max-w-md">
        <CardContent className="space-y-4 p-6">
          <div className="flex items-center gap-2">
            <ShieldCheck aria-hidden className="size-5 text-brand" />
            <h1 className="text-[16px] font-semibold">Two-step verification</h1>
          </div>
          {step.kind === 'loading' && !error && <Spinner label="Preparing two-step verification" />}
          {step.kind === 'enrol' && (
            <div className="space-y-3 text-[13px] text-muted">
              <p>The REGrow console needs two-step verification. Scan this code with an authenticator app (Google Authenticator, Microsoft Authenticator, 1Password…), then enter the 6-digit code it shows.</p>
              {/* QR codes must sit on white in either theme or phones can't read them: fixed primitive, not a semantic token. */}
              {/* eslint-disable-next-line @next/next/no-img-element -- data URL from Supabase, not a remote image */}
              <img src={step.qr} alt="QR code for your authenticator app" className="mx-auto size-44 rounded-lg border border-default bg-[var(--gray-0)] p-2" />
              <p className="text-[12px]">Can’t scan? Enter this key: <code className="break-all font-mono text-foreground">{step.secret}</code></p>
            </div>
          )}
          {step.kind === 'verify' && <p className="text-[13px] text-muted">Enter the 6-digit code from your authenticator app.</p>}
          {step.kind !== 'loading' && (
            <form onSubmit={confirm} className="space-y-3">
              <Field label="Verification code" required>
                <Input value={code} onChange={(e) => setCode(e.target.value.replace(/\D/g, '').slice(0, 6))}
                  inputMode="numeric" autoComplete="one-time-code" autoFocus placeholder="123456" />
              </Field>
              <Button type="submit" className="w-full" loading={busy} disabled={code.length !== 6}>Verify</Button>
            </form>
          )}
          {error && <Alert tone="danger">{error}</Alert>}
        </CardContent>
      </Card>
    </main>
  )
}
