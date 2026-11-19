'use client'
// components/help/HelpClient.tsx — the customer's support cases: list, open a new one, read and reply.
import { useState } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { Alert, Badge, Button, Card, CardContent, CardHeader, CardTitle, Field, Input, Select, Textarea } from '@/components/ui'

type CaseRow = { id: string; subject: string; category: string; priority: string; status: string; updated_at: string }
type OpenCase = { id: string; subject: string; status: string; messages: { id: string; author_kind: string; author_label: string | null; body: string; created_at: string }[] } | null
const STATUS: Record<string, { label: string; tone: 'brand' | 'warning' | 'success' | 'neutral' }> = {
  open: { label: 'Open', tone: 'brand' }, in_progress: { label: 'In progress', tone: 'brand' }, waiting_on_customer: { label: 'Waiting for you', tone: 'warning' },
  resolved: { label: 'Resolved', tone: 'success' }, closed: { label: 'Closed', tone: 'neutral' },
}
const when = (iso: string) => new Intl.DateTimeFormat('en-IN', { dateStyle: 'medium', timeStyle: 'short' }).format(new Date(iso))

async function post(body: unknown) {
  const res = await fetch('/api/help', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) })
  const json = await res.json().catch(() => ({}))
  if (!res.ok) throw new Error(json.error ?? 'Something went wrong.')
  return json
}

export function HelpClient({ orgId, orgSlug, cases, open }: { orgId: string; orgSlug: string; cases: CaseRow[]; open: OpenCase }) {
  const router = useRouter()
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [f, setF] = useState({ subject: '', category: 'question', priority: 'normal', body: '' })
  const [reply, setReply] = useState('')

  async function submit(body: unknown, after: (r: { id: string }) => void) {
    setBusy(true); setError(null)
    try { after(await post(body)); router.refresh() } catch (e) { setError((e as Error).message) } finally { setBusy(false) }
  }

  return (
    <div className="grid max-w-5xl gap-5 lg:grid-cols-[1fr_1.3fr]">
      <Card>
        <CardHeader><CardTitle>Your cases</CardTitle></CardHeader>
        <CardContent>
          {cases.length === 0 ? <p className="text-[14px] text-muted">No cases yet.</p> : (
            <ul className="divide-y divide-[var(--border)]">
              {cases.map((c) => (
                <li key={c.id} className="py-2.5">
                  <Link href={`/${orgSlug}/help?case=${c.id}`} className={`text-[14px] font-medium hover:underline ${open?.id === c.id ? 'text-brand' : ''}`}>{c.subject}</Link>
                  <div className="mt-0.5 flex items-center gap-2 text-[12px] text-subtle"><Badge tone={STATUS[c.status]?.tone ?? 'neutral'}>{STATUS[c.status]?.label ?? c.status}</Badge>{when(c.updated_at)}</div>
                </li>
              ))}
            </ul>
          )}
        </CardContent>
      </Card>

      {open ? (
        <Card>
          <CardHeader><CardTitle>{open.subject}</CardTitle></CardHeader>
          <CardContent className="space-y-3">
            {open.messages.map((m) => (
              <div key={m.id} className={`rounded-xl border border-default p-3 text-[14px] ${m.author_kind === 'staff' ? 'bg-surface-muted' : ''}`}>
                <p className="text-[12px] font-medium text-muted">{m.author_label ?? (m.author_kind === 'staff' ? 'REGrow support' : 'You')} · {when(m.created_at)}</p>
                <p className="mt-1 whitespace-pre-wrap">{m.body}</p>
              </div>
            ))}
            {open.status !== 'closed' && (
              <form className="space-y-2" onSubmit={(e) => { e.preventDefault(); submit({ orgId, caseId: open.id, body: reply }, () => setReply('')) }}>
                <Textarea aria-label="Your reply" required rows={3} value={reply} onChange={(e) => setReply(e.target.value)} />
                <Button type="submit" size="sm" disabled={busy}>Send</Button>
              </form>
            )}
            {error && <Alert tone="danger">{error}</Alert>}
            <Link href={`/${orgSlug}/help`} className="text-[13px] text-brand hover:underline">Open a new case</Link>
          </CardContent>
        </Card>
      ) : (
        <Card>
          <CardHeader><CardTitle>Open a case</CardTitle></CardHeader>
          <CardContent>
            <form className="space-y-3" onSubmit={(e) => { e.preventDefault(); submit({ orgId, ...f, priority: f.priority === 'normal' ? undefined : f.priority }, (r) => { setF({ subject: '', category: 'question', priority: 'normal', body: '' }); router.push(`/${orgSlug}/help?case=${r.id}`) }) }}>
              <Field label="Subject" required><Input required minLength={3} maxLength={200} value={f.subject} onChange={(e) => setF({ ...f, subject: e.target.value })} /></Field>
              <div className="grid gap-3 sm:grid-cols-2">
                <Field label="Type"><Select value={f.category} onChange={(e) => setF({ ...f, category: e.target.value })}>
                  <option value="question">Question</option><option value="problem">Something is not working</option><option value="billing">Billing</option><option value="data_request">Data or export request</option><option value="feature_request">Feature request</option>
                </Select></Field>
                <Field label="How urgent?"><Select value={f.priority} onChange={(e) => setF({ ...f, priority: e.target.value })}><option value="normal">Normal</option><option value="high">High — it is slowing us down</option><option value="urgent">Urgent — we cannot work</option></Select></Field>
              </div>
              <Field label="Describe it" required hint="Please do not include passwords. If we need to look at your records, we will ask for your permission under Support access."><Textarea required minLength={5} rows={6} value={f.body} onChange={(e) => setF({ ...f, body: e.target.value })} /></Field>
              {error && <Alert tone="danger">{error}</Alert>}
              <Button type="submit" disabled={busy}>Send to REGrow support</Button>
            </form>
          </CardContent>
        </Card>
      )}
    </div>
  )
}
