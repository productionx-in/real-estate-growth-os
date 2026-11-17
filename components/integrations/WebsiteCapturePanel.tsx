'use client'
// components/integrations/WebsiteCapturePanel.tsx
// Set up the website capture script: list the site's domains, switch it on, copy one script tag.
// The server (app/api/integrations/website) validates and saves; this only collects input and shows status.
import { useEffect, useState } from 'react'
import { Check, Copy, Globe } from 'lucide-react'
import { Alert, Badge, Button, Field, Select, Textarea } from '@/components/ui'

export interface WebsiteStatus {
  connectionId: string | null
  enabled: boolean
  domains: string[]
  lastEnquiryAt: string | null
  enquiries30d: number
}

function when(iso: string | null) {
  if (!iso) return 'none yet'
  return new Date(iso).toLocaleString(undefined, { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' })
}

export function WebsiteCapturePanel({ orgId, projects, onSaved }: {
  orgId: string
  projects: { id: string; name: string }[]
  onSaved?: (status: WebsiteStatus) => void
}) {
  const [status, setStatus] = useState<WebsiteStatus | null>(null)
  const [domains, setDomains] = useState('')
  const [projectId, setProjectId] = useState('')
  const [onlyMarked, setOnlyMarked] = useState(false)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [copied, setCopied] = useState(false)
  // Rendered only inside the open wizard (never on the server), so the page's own address is known.
  const origin = typeof window !== 'undefined' ? window.location.origin : ''

  useEffect(() => {
    let live = true
    fetch(`/api/integrations/website?orgId=${orgId}`)
      .then((r) => r.json().then((b) => ({ ok: r.ok, b })))
      .then(({ ok, b }) => {
        if (!live) return
        if (!ok) { setError(b.error ?? 'Could not load the website settings.'); return }
        setStatus(b.website)
        setDomains((b.website.domains ?? []).join('\n'))
      })
      .catch(() => live && setError('Could not load the website settings.'))
    return () => { live = false }
  }, [orgId])

  async function save(enabled: boolean) {
    setBusy(true)
    setError(null)
    try {
      const res = await fetch('/api/integrations/website', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ orgId, enabled, domains: domains.split(/[\s,;]+/).filter(Boolean) }),
      })
      const body = await res.json().catch(() => ({}))
      if (!res.ok) { setError(body.error ?? 'Could not save.'); return }
      setStatus(body.website)
      setDomains(body.website.domains.join('\n'))
      onSaved?.(body.website)
    } catch {
      setError('Network error. Please try again.')
    } finally {
      setBusy(false)
    }
  }

  const tag = status?.connectionId
    ? `<script src="${origin}/capture.js" data-regrow-key="${status.connectionId}"${projectId ? ` data-regrow-project="${projectId}"` : ''}${onlyMarked ? ' data-regrow-forms="marked"' : ''} async></script>`
    : ''

  return (
    <div className="space-y-5">
      <div className="flex items-start gap-3">
        <Globe aria-hidden className="mt-0.5 size-5 shrink-0 text-brand" />
        <div className="text-[13px] text-muted">
          <p className="font-medium text-foreground">Capture enquiries from the forms already on your website</p>
          <p className="mt-0.5">
            Add one line to your site. Every enquiry form that asks for a phone number or email sends a lead here — with the
            ad, campaign and page the visitor came from. Your forms keep working exactly as before.
          </p>
        </div>
      </div>

      {status && (
        <div className="flex flex-wrap items-center gap-2 text-[12px] text-muted">
          <Badge tone={status.enabled ? 'success' : 'neutral'}>{status.enabled ? 'On' : 'Off'}</Badge>
          <span>Last enquiry: {when(status.lastEnquiryAt)}</span>
          <span aria-hidden>·</span>
          <span>{status.enquiries30d} in the last 30 days</span>
        </div>
      )}

      <Field
        label="Your website domains"
        hint="One per line, e.g. skylinetowers.in or *.skylinedevelopers.com. Enquiries from any other website are refused."
      >
        <Textarea rows={3} value={domains} onChange={(e) => setDomains(e.target.value)} placeholder="skylinetowers.in" />
      </Field>

      {error && <Alert tone="danger">{error}</Alert>}

      <div className="flex flex-wrap gap-2">
        <Button onClick={() => save(true)} loading={busy} disabled={!domains.trim()}>
          {status?.enabled ? 'Save domains' : 'Save and switch on'}
        </Button>
        {status?.enabled && (
          <Button variant="secondary" onClick={() => save(false)} disabled={busy}>Switch off</Button>
        )}
      </div>

      {status?.connectionId && (
        <div className="space-y-3 border-t border-default pt-5">
          <p className="text-[13px] font-medium text-foreground">Add this to every page of your website, just before &lt;/body&gt;</p>
          <div className="grid gap-3 sm:grid-cols-2">
            <Field label="Project (optional)">
              <Select value={projectId} onChange={(e) => setProjectId(e.target.value)}>
                <option value="">Let REGrow route it</option>
                {projects.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
              </Select>
            </Field>
            <label className="flex items-start gap-2 pt-6 text-[13px] text-foreground">
              <input type="checkbox" checked={onlyMarked} onChange={(e) => setOnlyMarked(e.target.checked)} className="mt-0.5 size-4 accent-[var(--brand)]" />
              <span>
                Only forms I mark
                <span className="block text-[12px] text-muted">Add data-regrow-form to the forms you want captured.</span>
              </span>
            </label>
          </div>
          <div className="relative">
            <pre className="overflow-x-auto rounded-lg border border-default bg-surface-sunken p-3 pr-24 text-[12px] leading-relaxed text-foreground">{tag}</pre>
            <Button
              size="sm"
              variant="secondary"
              className="absolute right-2 top-2"
              onClick={() => { navigator.clipboard.writeText(tag); setCopied(true); setTimeout(() => setCopied(false), 2000) }}
            >
              {copied ? <Check aria-hidden /> : <Copy aria-hidden />} {copied ? 'Copied' : 'Copy'}
            </Button>
          </div>
          {!status.enabled && <Alert tone="warning">Website enquiries are switched off — the script sends nothing until you switch them on.</Alert>}
          <ul className="list-disc space-y-1 pl-5 text-[12px] text-muted">
            <li>Forms with a password, card or OTP field are never read. Only name, phone, email, message, budget and unit type are sent.</li>
            <li>To skip a form, add <code>data-regrow-ignore</code> to it. For forms built in JavaScript, call <code>REGrow.capture(&#123; name, phone, email &#125;)</code>.</li>
            <li>To check it works: submit one of your forms, then look for the lead under Leads (source: Website).</li>
          </ul>
        </div>
      )}
    </div>
  )
}
