'use client'
// components/integrations/WhatsAppEmbeddedSignup.tsx — "Connect WhatsApp" through RE by PX's central Meta app.
// The customer signs in to Meta in a popup and picks their own WhatsApp Business Account and number; the server
// (POST /api/integrations/whatsapp/embedded-signup) finishes the connection. Shows nothing secret: the app id and
// configuration id are public by design.
import { useEffect, useRef, useState } from 'react'
import { useRouter } from 'next/navigation'
import { MessageCircle } from 'lucide-react'
import { Alert, Button, Field, Input } from '@/components/ui'
import { Dialog, DialogClose, DialogContent, DialogFooter } from '@/components/ui/dialog'
import { isMetaOrigin } from '@/lib/integrations/whatsapp/embedded-signup'

interface Config { available: boolean; appId: string | null; configId: string | null; apiVersion: string }
interface FBLoginResponse { authResponse?: { code?: string } | null; status?: string }
interface FBSdk {
  init: (o: Record<string, unknown>) => void
  login: (cb: (r: FBLoginResponse) => void, o: Record<string, unknown>) => void
}
declare global { interface Window { FB?: FBSdk; fbAsyncInit?: () => void } }

function loadSdk(appId: string, version: string): Promise<FBSdk> {
  return new Promise((resolve, reject) => {
    if (window.FB) return resolve(window.FB)
    window.fbAsyncInit = () => {
      window.FB!.init({ appId, autoLogAppEvents: true, xfbml: false, version })
      resolve(window.FB!)
    }
    const s = document.createElement('script')
    s.src = 'https://connect.facebook.net/en_US/sdk.js'
    s.async = true; s.defer = true; s.crossOrigin = 'anonymous'
    s.onerror = () => reject(new Error('Could not load Meta’s sign-in. Check that pop-ups and third-party scripts are allowed.'))
    document.body.appendChild(s)
  })
}

export function WhatsAppEmbeddedSignup({ orgId, connected, canManage, full = false }: { orgId: string; connected: boolean; canManage: boolean; full?: boolean }) {
  const router = useRouter()
  const [config, setConfig] = useState<Config | null>(null)
  const [open, setOpen] = useState(false)
  const [pin, setPin] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [notice, setNotice] = useState<string | null>(null)
  const session = useRef<{ wabaId?: string; phoneNumberId?: string }>({})

  useEffect(() => {
    if (!canManage) return
    fetch(`/api/integrations/whatsapp/embedded-signup?orgId=${orgId}`).then((r) => r.json()).then(setConfig).catch(() => setConfig(null))
  }, [orgId, canManage])

  useEffect(() => {
    function onMessage(event: MessageEvent) {
      if (!isMetaOrigin(event.origin) || typeof event.data !== 'string') return
      try {
        const d = JSON.parse(event.data) as { type?: string; event?: string; data?: { waba_id?: string; phone_number_id?: string } }
        if (d.type !== 'WA_EMBEDDED_SIGNUP') return
        if (d.event?.startsWith('FINISH') && d.data) session.current = { wabaId: d.data.waba_id, phoneNumberId: d.data.phone_number_id }
        else if (d.event === 'CANCEL') session.current = {}
      } catch { /* not ours */ }
    }
    window.addEventListener('message', onMessage)
    return () => window.removeEventListener('message', onMessage)
  }, [])

  async function start() {
    if (!config?.appId || !config.configId) return
    if (!/^\d{6}$/.test(pin)) { setError('Enter a 6-digit PIN.'); return }
    setBusy(true); setError(null); setNotice(null); session.current = {}
    try {
      const FB = await loadSdk(config.appId, config.apiVersion)
      FB.login((response) => {
        const code = response.authResponse?.code
        // The session message can arrive just after the login callback.
        setTimeout(async () => {
          const { wabaId, phoneNumberId } = session.current
          if (!code || !wabaId || !phoneNumberId) {
            setBusy(false)
            setError('Sign-up was not finished in the Meta window. Please try again and complete every step.')
            return
          }
          try {
            const res = await fetch('/api/integrations/whatsapp/embedded-signup', {
              method: 'POST', headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({ orgId, code, wabaId, phoneNumberId, pin }),
            })
            const out = await res.json().catch(() => ({}))
            if (!res.ok) { setError(out.error ?? 'Could not connect WhatsApp.'); return }
            setNotice(out.warning ?? `Connected ${out.phone?.displayPhoneNumber ?? 'your WhatsApp number'}.`)
            if (!out.warning) setOpen(false)
            router.refresh()
          } catch { setError('Network error. Please try again.') } finally { setBusy(false) }
        }, 800)
      }, {
        config_id: config.configId,
        response_type: 'code',
        override_default_response_type: true,
        extras: { setup: {}, featureType: '', sessionInfoVersion: '3' },
      })
    } catch (e) {
      setBusy(false)
      setError(e instanceof Error ? e.message : 'Could not start the sign-up.')
    }
  }

  if (!canManage) return null
  if (!config?.available) {
    return <p className="text-[11px] text-subtle">🕒 Adding a number opens soon — RE by PX is finishing the WhatsApp setup.</p>
  }
  return (
    <>
      <Button size="sm" variant={connected ? 'secondary' : 'primary'} className="w-full" disabled={full} title={full ? 'Up to 5 numbers per workspace' : undefined} onClick={() => { setOpen(true); setError(null); setNotice(null) }}>
        <MessageCircle aria-hidden /> {connected ? 'Add or reconnect a number' : 'Connect WhatsApp number'}
      </Button>
      {notice && !open && <Alert tone="success" className="mt-2">{notice}</Alert>}
      <Dialog open={open} onOpenChange={(o) => { if (!busy) setOpen(o) }}>
        <DialogContent title="Connect your WhatsApp Business number" description="You’ll sign in to Meta and choose (or create) your own WhatsApp Business Account and number. RE by PX never sees your Facebook password.">
          <div className="space-y-4">
            <ol className="list-decimal space-y-1 pl-5 text-[13px] text-muted">
              <li>Use a number that is not active in the WhatsApp or WhatsApp Business app, or move it first.</li>
              <li>Keep the Meta window open until it says you’re done.</li>
            </ol>
            <Field label="Two-step verification PIN" hint="6 digits. If the number already has a PIN, enter that one; otherwise choose a new one and keep it safe.">
              <Input inputMode="numeric" autoComplete="off" maxLength={6} value={pin} onChange={(e) => setPin(e.target.value.replace(/\D/g, ''))} />
            </Field>
            {error && <Alert tone="danger">{error}</Alert>}
            {notice && <Alert tone="warning">{notice}</Alert>}
            <DialogFooter>
              <DialogClose asChild><Button variant="secondary" disabled={busy}>Cancel</Button></DialogClose>
              <Button onClick={start} loading={busy}>Continue with Facebook</Button>
            </DialogFooter>
          </div>
        </DialogContent>
      </Dialog>
    </>
  )
}
