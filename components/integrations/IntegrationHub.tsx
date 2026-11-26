'use client'
// components/integrations/IntegrationHub.tsx — the Integrations dashboard: every service on one screen with a plain
// status (✅ Connected, ⚪ Not connected, ⚠️ Action required, 🕒 Coming soon) and one button to connect it. Facebook and
// Google are a sign-in; WhatsApp is Meta's own sign-up window; a website or e-mail domain is a guided DNS step with
// copy buttons and a "Check now" that looks the records up from our server. No technical setup is shown here.
import { useMemo, useState } from 'react'
import { useRouter } from 'next/navigation'
import { Check, ChevronRight, Copy, Globe, Loader2, Mail, Plus, RefreshCw, Trash2 } from 'lucide-react'
import { Alert, Button, Field, Input } from '@/components/ui'
import { Sheet, SheetContent, SheetFooter } from '@/components/ui/sheet'
import { toast } from '@/components/ui/toast'
import { cn } from '@/lib/utils/cn'
import { STATUS_LABEL, hubCards, type HubCard, type HubInput, type HubKey, type HubStatus } from '@/lib/integrations/hub'
import { DNS_HELP } from '@/lib/integrations/dns-verify'
import type { DomainView } from '@/lib/dal/domains'
import { WhatsAppEmbeddedSignup } from '@/components/integrations/WhatsAppEmbeddedSignup'

const TONE: Record<HubStatus, string> = {
  connected: 'bg-success-bg text-success',
  not_connected: 'bg-surface-muted text-muted',
  action_required: 'bg-warning-bg text-warning',
  coming_soon: 'bg-surface-muted text-subtle',
}

export function IntegrationHub({ orgId, canManage, connections, ready, initialDomains, whatsappFull, onOpen }: {
  orgId: string; canManage: boolean; connections: HubInput['connections']; ready: HubInput['ready']; initialDomains: DomainView[]; whatsappFull: boolean
  /** Opens the detailed flows the page already has (website wizard, portals, Meta account management). */
  onOpen: (key: 'website' | 'portals' | 'meta_manage') => void
}) {
  const [domains, setDomains] = useState(initialDomains)
  const [sheet, setSheet] = useState<'website' | 'email' | null>(null)
  const [busy, setBusy] = useState<HubKey | null>(null)
  const cards = useMemo(() => hubCards({ connections, ready, domains: domains.map((d) => ({ purpose: d.purpose, domain: d.domain, status: d.status })) }), [connections, ready, domains])
  const done = cards.filter((c) => c.status === 'connected').length

  async function signIn(key: 'meta' | 'google') {
    setBusy(key)
    try {
      const res = await fetch(key === 'meta' ? '/api/integrations/meta/oauth/start' : '/api/integrations/google/oauth/start', {
        method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ orgId, returnUrl: window.location.href }),
      })
      const out = await res.json().catch(() => ({}))
      const url = out.authorizationUrl ?? out.url
      if (!res.ok || !url) { toast.error(key === 'meta' ? 'Facebook sign-in is not available yet. RE by PX is finishing the setup — try again soon.' : 'Google sign-in is not available yet. RE by PX is finishing the setup — try again soon.'); return }
      window.location.assign(url)
    } catch { toast.error('Network error. Please try again.') } finally { setBusy(null) }
  }

  function act(c: HubCard) {
    if (!canManage) return
    if (c.key === 'meta') return c.status === 'connected' ? onOpen('meta_manage') : void signIn('meta')
    if (c.key === 'google') return void signIn('google')
    if (c.key === 'website') return c.status === 'not_connected' ? onOpen('website') : setSheet('website')
    if (c.key === 'email') return setSheet('email')
    if (c.key === 'portals') return onOpen('portals')
  }

  return (
    <section aria-labelledby="hub-title" className="space-y-4">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h2 id="hub-title" className="text-[18px] font-semibold text-foreground">🔌 Connect your lead sources</h2>
          <p className="text-[13px] text-muted">Sign in, pick what to connect, and new leads start arriving. {done ? `${done} of ${cards.length} connected.` : 'Nothing to install.'}</p>
        </div>
        <ul className="flex flex-wrap gap-3 text-[12px] text-muted" aria-label="What the statuses mean">
          {(Object.keys(STATUS_LABEL) as HubStatus[]).map((s) => <li key={s}>{STATUS_LABEL[s].emoji} {STATUS_LABEL[s].label}</li>)}
        </ul>
      </div>
      <div className="stagger grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
        {cards.map((c) => (
          <article key={c.key} className="surface-raised flex flex-col rounded-2xl border border-default bg-surface p-5">
            <div className="flex items-start justify-between gap-3">
              <span className="grid size-12 place-items-center rounded-2xl bg-surface-muted text-[24px]" aria-hidden>{c.emoji}</span>
              <span className={cn('inline-flex items-center gap-1 rounded-full px-2.5 py-1 text-[12px] font-medium', TONE[c.status])}>{STATUS_LABEL[c.status].emoji} {STATUS_LABEL[c.status].label}</span>
            </div>
            <h3 className="mt-3 text-[15px] font-semibold text-foreground">{c.title}</h3>
            <p className="mt-1 flex-1 text-[13px] leading-relaxed text-muted">{c.blurb}</p>
            <p className="mt-3 text-[12px] font-medium text-foreground">{c.detail}</p>
            <div className="mt-3">
              {!canManage ? <p className="text-[12px] text-subtle">Owners, admins and managers connect services.</p>
                : c.key === 'whatsapp' && c.status !== 'coming_soon'
                  ? <WhatsAppEmbeddedSignup orgId={orgId} connected={c.status === 'connected'} canManage={canManage} full={whatsappFull} />
                  : c.status === 'coming_soon'
                    ? <Button size="sm" variant="secondary" className="w-full" disabled>🕒 Available soon</Button>
                    : <Button size="sm" variant={c.status === 'connected' ? 'secondary' : 'primary'} className="w-full" onClick={() => act(c)} loading={busy === c.key}>{c.cta} <ChevronRight aria-hidden /></Button>}
            </div>
          </article>
        ))}
      </div>
      {sheet && <DomainSheet orgId={orgId} purpose={sheet} domains={domains.filter((d) => d.purpose === sheet)} onChange={(list) => setDomains([...domains.filter((d) => d.purpose !== sheet), ...list])}
        onClose={() => setSheet(null)} onWebsiteSetup={() => { setSheet(null); onOpen('website') }} />}
    </section>
  )
}

function CopyValue({ value, label }: { value: string; label: string }) {
  const [copied, setCopied] = useState(false)
  return (
    <button type="button" onClick={() => { void navigator.clipboard?.writeText(value); setCopied(true); setTimeout(() => setCopied(false), 1500) }}
      className="group flex w-full items-center justify-between gap-2 rounded-lg border border-default bg-surface px-3 py-2 text-left font-mono text-[12px] text-foreground hover:border-brand" aria-label={`Copy ${label}`}>
      <span className="min-w-0 break-all">{value}</span>
      {copied ? <Check className="size-4 shrink-0 text-success" aria-hidden /> : <Copy className="size-4 shrink-0 text-subtle group-hover:text-brand" aria-hidden />}
    </button>
  )
}

function DomainSheet({ orgId, purpose, domains, onChange, onClose, onWebsiteSetup }: { orgId: string; purpose: 'website' | 'email'; domains: DomainView[]; onChange: (d: DomainView[]) => void; onClose: () => void; onWebsiteSetup: () => void }) {
  const router = useRouter()
  const [domain, setDomain] = useState('')
  const [sendAs, setSendAs] = useState('hello')
  const [busy, setBusy] = useState<string | null>(null)
  const [problems, setProblems] = useState<Record<string, string[]>>({})
  const email = purpose === 'email'

  async function add() {
    setBusy('add')
    try {
      const res = await fetch('/api/integrations/domains', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ orgId, purpose, domain, ...(email ? { sendAs } : {}) }) })
      const out = await res.json().catch(() => ({}))
      if (!res.ok) { toast.error(out.error ?? 'The domain could not be added.'); return }
      onChange([...domains, out.domain]); setDomain(''); toast.success('Added. Now add the record below at your domain provider.')
    } catch { toast.error('Network error. Please try again.') } finally { setBusy(null) }
  }
  async function check(d: DomainView) {
    setBusy(d.id)
    try {
      const res = await fetch(`/api/integrations/domains/${d.id}?orgId=${orgId}`, { method: 'POST' })
      const out = await res.json().catch(() => ({}))
      if (!res.ok) { toast.error(out.error ?? 'Could not check right now.'); return }
      onChange(domains.map((x) => (x.id === d.id ? out.domain : x))); setProblems({ ...problems, [d.id]: out.problems ?? [] })
      if (out.domain.status === 'verified' && (!email || out.domain.sending)) toast.success(`🎉 ${d.domain} is verified.`)
      else if (out.domain.status === 'verified') toast.success(`✅ You own ${d.domain}. Waiting for the sending records.`)
      else toast.info('Not visible yet — DNS can take a few minutes.')
      router.refresh()
    } catch { toast.error('Network error. Please try again.') } finally { setBusy(null) }
  }
  async function remove(d: DomainView) {
    if (!confirm(`Remove ${d.domain}?`)) return
    setBusy(d.id)
    try {
      const res = await fetch(`/api/integrations/domains/${d.id}?orgId=${orgId}`, { method: 'DELETE' })
      if (!res.ok) { toast.error('Could not remove it.'); return }
      onChange(domains.filter((x) => x.id !== d.id))
    } catch { toast.error('Network error. Please try again.') } finally { setBusy(null) }
  }

  return (
    <Sheet open onOpenChange={(o) => { if (!o && !busy) onClose() }}>
      <SheetContent title={email ? '📧 Send e-mail from your domain' : '🌐 Verify your website'} description={email ? 'Buyers see your company’s address, and replies reach you. Add a few records at your domain provider — we’ll check them for you.' : 'Prove the website is yours so enquiries from it are trusted. One record at your domain provider.'}>
        <div className="space-y-6">
          {!email && <Alert tone="info">Haven’t added the enquiry form yet? <button type="button" onClick={onWebsiteSetup} className="font-medium underline">Set up your website form</button> first — no coding needed.</Alert>}
          {domains.map((d) => {
            const ok = d.status === 'verified' && (!email || d.sending)
            return (
              <div key={d.id} className="space-y-3 rounded-2xl border border-default p-4">
                <div className="flex items-center justify-between gap-2">
                  <p className="flex items-center gap-2 text-[14px] font-semibold text-foreground">{email ? <Mail className="size-4" aria-hidden /> : <Globe className="size-4" aria-hidden />}{email && d.sendAs ? `${d.sendAs}@${d.domain}` : d.domain}</p>
                  <span className={cn('rounded-full px-2.5 py-1 text-[12px] font-medium', ok ? TONE.connected : TONE.action_required)}>{ok ? '✅ Verified' : '⚠️ Action required'}</span>
                </div>
                {!ok && (
                  <>
                    <ol className="space-y-4">
                      <li className="text-[13px] text-foreground"><span className="font-semibold">1. Open your domain provider</span> — where you bought {d.domain}.
                        <details className="mt-1 text-[12px] text-muted"><summary className="cursor-pointer text-brand">Where is that? (GoDaddy, Hostinger, Cloudflare…)</summary>
                          <ul className="mt-1 space-y-0.5">{DNS_HELP.map((h) => <li key={h.name}><span className="font-medium text-foreground">{h.name}:</span> {h.where}</li>)}</ul>
                        </details>
                      </li>
                      <li className="text-[13px] text-foreground"><span className="font-semibold">2. Add {d.records.length === 1 ? 'this record' : `these ${d.records.length} records`}</span> — copy each value exactly.
                        <div className="mt-2 space-y-3">
                          {d.records.map((r, i) => (
                            <div key={i} className="well space-y-1.5 rounded-xl p-3">
                              <p className="text-[12px] text-muted"><span className="rounded bg-surface px-1.5 py-0.5 font-mono font-semibold text-foreground">{r.type}</span>{r.priority !== undefined ? ` · priority ${r.priority}` : ''}{!r.required ? ' · recommended' : ''} — {r.why}</p>
                              <p className="text-[11px] font-medium uppercase tracking-wide text-subtle">Name / Host</p>
                              <CopyValue value={r.host} label="the host name" />
                              <p className="text-[11px] font-medium uppercase tracking-wide text-subtle">Value</p>
                              <CopyValue value={r.value} label="the value" />
                            </div>
                          ))}
                          {email && d.records.length <= 2 && <p className="text-[12px] text-muted">The sending records appear here once RE by PX’s mail service is switched on for your workspace — your domain is still verified as yours meanwhile.</p>}
                        </div>
                      </li>
                      <li className="text-[13px] text-foreground"><span className="font-semibold">3. Check</span> — usually ready within minutes.</li>
                    </ol>
                    {(problems[d.id] ?? []).length > 0 && <Alert tone="warning"><ul className="list-disc space-y-0.5 pl-4">{problems[d.id].map((p) => <li key={p}>{p}</li>)}</ul></Alert>}
                  </>
                )}
                <div className="flex flex-wrap gap-2">
                  {!ok && <Button size="sm" onClick={() => void check(d)} disabled={!!busy}>{busy === d.id ? <Loader2 className="animate-spin" aria-hidden /> : <RefreshCw aria-hidden />} Check now</Button>}
                  <Button size="sm" variant="ghost" onClick={() => void remove(d)} disabled={!!busy}><Trash2 aria-hidden /> Remove</Button>
                  {d.lastCheckedAt && <span className="self-center text-[11px] text-subtle">Last checked {new Intl.DateTimeFormat('en-IN', { hour: 'numeric', minute: '2-digit', day: 'numeric', month: 'short' }).format(new Date(d.lastCheckedAt))}</span>}
                </div>
              </div>
            )
          })}
          {domains.length < 5 && (
            <div className="space-y-3">
              <p className="text-[13px] font-semibold text-foreground">{domains.length ? 'Add another domain' : email ? 'Your domain' : 'Your website'}</p>
              <Field label={email ? 'Domain' : 'Website address'} hint={email ? 'Like “seaviewdevelopers.in”.' : 'Like “seaviewdevelopers.in” — no need for https://'}>
                <Input value={domain} onChange={(e) => setDomain(e.target.value)} placeholder="yourcompany.com" autoCapitalize="none" spellCheck={false} />
              </Field>
              {email && (
                <Field label="Send as" hint={`Buyers will see e-mail from ${sendAs || 'hello'}@${domain.trim() || 'yourcompany.com'}.`}>
                  <Input value={sendAs} onChange={(e) => setSendAs(e.target.value.toLowerCase().replace(/[^a-z0-9._-]/g, ''))} maxLength={64} />
                </Field>
              )}
              <SheetFooter>
                <Button variant="ghost" onClick={onClose}>Close</Button>
                <Button onClick={() => void add()} loading={busy === 'add'} disabled={!domain.trim() || !!busy}><Plus aria-hidden /> Add domain</Button>
              </SheetFooter>
            </div>
          )}
        </div>
      </SheetContent>
    </Sheet>
  )
}
