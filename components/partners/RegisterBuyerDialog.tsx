'use client'
// components/partners/RegisterBuyerDialog.tsx — on an agency's lead: register this buyer with a partner
// developer for one of the projects it shares. The user must confirm the agency is authorised to share the
// buyer's details; the server records who confirmed, when, and the wording version. The buyer's name and
// phone come from the lead on the server — this form only sends ids, the note and the confirmation.
import * as React from 'react'
import { useRouter } from 'next/navigation'
import { Handshake } from 'lucide-react'
import { Alert, Button, Field, Select, Textarea } from '@/components/ui'
import { Dialog, DialogContent, DialogFooter, DialogTrigger } from '@/components/ui/dialog'
import { consentStatement } from '@/lib/partners/rules'
import { formatDate } from '@/lib/utils/format'

export interface RegistrationTarget { partnershipId: string; developerName: string; projects: { id: string; name: string }[] }

export function RegisterBuyerDialog({ orgId, orgName, leadId, leadName, targets }: {
  orgId: string; orgName: string; leadId: string; leadName: string; targets: RegistrationTarget[]
}) {
  const router = useRouter()
  const [open, setOpen] = React.useState(false)
  const [partnershipId, setPartnershipId] = React.useState(targets[0]?.partnershipId ?? '')
  const target = targets.find((t) => t.partnershipId === partnershipId)
  const [projectId, setProjectId] = React.useState(target?.projects[0]?.id ?? '')
  const project = target?.projects.find((p) => p.id === projectId)
  const [note, setNote] = React.useState('')
  const [consent, setConsent] = React.useState(false)
  const [busy, setBusy] = React.useState(false)
  const [error, setError] = React.useState<string | null>(null)
  const [result, setResult] = React.useState<{ tone: 'success' | 'warning'; text: string } | null>(null)

  function reset() { setNote(''); setConsent(false); setError(null); setResult(null) }

  async function submit() {
    if (!target || !project || !consent) return
    setBusy(true); setError(null)
    try {
      const res = await fetch('/api/partners/registrations', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ orgId, partnershipId, projectId, agencyLeadId: leadId, note: note.trim() || null, consent: true }),
      })
      const json = await res.json().catch(() => ({}))
      if (!res.ok) { setError(json.error || 'Could not register the buyer.'); return }
      const out = json.data as { outcome: string; protected_until: string | null }
      if (out.outcome === 'conflict') {
        setResult({ tone: 'warning', text: out.protected_until
          ? `This buyer is already registered with ${target.developerName} and protected until ${formatDate(out.protected_until)}.`
          : `This buyer is already registered with ${target.developerName} or is already one of their buyers. Your attempt has been recorded.` })
      } else if (out.outcome === 'already_submitted') {
        setResult({ tone: 'success', text: `You have already registered this buyer with ${target.developerName}.` })
      } else {
        setResult({ tone: 'success', text: `Sent to ${target.developerName} for review. Protection starts if they accept.` })
      }
      router.refresh()
    } finally { setBusy(false) }
  }

  return (
    <Dialog open={open} onOpenChange={(v) => { setOpen(v); if (!v) reset() }}>
      <DialogTrigger asChild>
        <Button variant="secondary" size="sm"><Handshake aria-hidden /> Register with developer</Button>
      </DialogTrigger>
      <DialogContent title={`Register ${leadName} with a developer`}
        description="The developer receives the buyer's name, phone number and your note. Your lead stays yours.">
        {result ? (
          <Alert tone={result.tone}>{result.text}</Alert>
        ) : (
          <div className="space-y-3">
            <Field label="Developer" required>
              <Select value={partnershipId} onChange={(e) => {
                setPartnershipId(e.target.value)
                setProjectId(targets.find((t) => t.partnershipId === e.target.value)?.projects[0]?.id ?? '')
              }}>
                {targets.map((t) => <option key={t.partnershipId} value={t.partnershipId}>{t.developerName}</option>)}
              </Select>
            </Field>
            <Field label="Project" required>
              <Select value={projectId} onChange={(e) => setProjectId(e.target.value)}>
                {(target?.projects ?? []).map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
              </Select>
            </Field>
            <Field label="Note for the developer" hint="Optional. Up to 1,000 characters. Do not include details the buyer has not agreed to share.">
              <Textarea value={note} onChange={(e) => setNote(e.target.value.slice(0, 1000))} rows={3} />
            </Field>
            <label className="flex items-start gap-2 rounded-lg border border-default p-3 text-[13px]">
              <input type="checkbox" className="mt-0.5 size-4" checked={consent} onChange={(e) => setConsent(e.target.checked)} />
              <span>{consentStatement(orgName, target?.developerName ?? 'the developer', project?.name ?? 'this project')}</span>
            </label>
            {error && <Alert tone="danger">{error}</Alert>}
          </div>
        )}
        <DialogFooter>
          <Button variant="secondary" onClick={() => setOpen(false)}>{result ? 'Close' : 'Cancel'}</Button>
          {!result && <Button onClick={submit} disabled={!consent || !project || busy}>{busy ? 'Sending…' : 'Register buyer'}</Button>}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
