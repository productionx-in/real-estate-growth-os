'use client'
// components/leads/LeadWorkPanel.tsx
// The salesperson's cockpit on a lead: response-time countdown, one-tap Call / WhatsApp (logged as the first
// action), two-tap call outcome with a mandatory next follow-up, and the lead's open follow-ups.
import { useEffect, useMemo, useState } from 'react'
import { useRouter } from 'next/navigation'
import { CalendarClock, Check, Clock, MessageCircle, Phone, Plus, TimerReset } from 'lucide-react'
import { OUTCOMES, OUTCOME_RULES, type Outcome } from '@/lib/follow-ups/outcomes'

export interface WorkTask {
  id: string
  kind: string
  due_at: string
  note: string | null
  status: string
}

interface Props {
  leadId: string
  phone: string
  slaState: string | null
  slaDueAt: string | null
  assignedAt: string | null
  firstActionAt: string | null
  tasks: WorkTask[]
}

const TONE: Record<string, string> = {
  positive: 'border-success/30 bg-success-bg text-success hover:bg-success-bg',
  neutral: 'border-[var(--border)] bg-[var(--surface)] text-[var(--foreground)] hover:bg-[var(--surface-hover)]',
  negative: 'border-danger/30 bg-danger-bg text-danger hover:bg-danger-bg',
}

/** Quick follow-up choices, computed in India time (the product's market). */
function quickTimes(now: Date) {
  const ist = (d: Date) => new Date(d.toLocaleString('en-US', { timeZone: 'Asia/Kolkata' }))
  const offset = now.getTime() - ist(now).getTime()
  const atIst = (daysAhead: number, h: number) => {
    const d = ist(now)
    d.setDate(d.getDate() + daysAhead)
    d.setHours(h, 0, 0, 0)
    return new Date(d.getTime() + offset)
  }
  return [
    { label: 'In 1 hour', at: new Date(now.getTime() + 3600_000) },
    { label: 'In 2 hours', at: new Date(now.getTime() + 2 * 3600_000) },
    { label: 'This evening 6 PM', at: atIst(0, 18) },
    { label: 'Tomorrow 11 AM', at: atIst(1, 11) },
    { label: 'In 2 days', at: atIst(2, 11) },
    { label: 'Next week', at: atIst(7, 11) },
  ].filter((o) => o.at.getTime() > now.getTime() + 5 * 60_000)
}

const toLocalInput = (d: Date) => {
  const p = (n: number) => String(n).padStart(2, '0')
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}T${p(d.getHours())}:${p(d.getMinutes())}`
}
/** Event-handler helper (not used during render). */
const minutesFromNow = (m: number) => new Date(Date.now() + m * 60_000)
const tomorrowFrom = (iso: string) => new Date(Math.max(Date.now(), new Date(iso).getTime()) + 86_400_000).toISOString()
const fmt = (iso: string) => new Date(iso).toLocaleString('en-IN', { weekday: 'short', day: 'numeric', month: 'short', hour: 'numeric', minute: '2-digit' })

function useNow(intervalMs: number) {
  const [now, setNow] = useState<number | null>(null)
  useEffect(() => {
    const tick = () => setNow(Date.now())
    const first = setTimeout(tick, 0)
    const t = setInterval(tick, intervalMs)
    return () => { clearTimeout(first); clearInterval(t) }
  }, [intervalMs])
  return now
}

function ResponseClock({ slaState, slaDueAt, assignedAt, firstActionAt }: Pick<Props, 'slaState' | 'slaDueAt' | 'assignedAt' | 'firstActionAt'>) {
  const now = useNow(1000)
  if (slaState === 'met' && firstActionAt && assignedAt) {
    const mins = Math.max(0, Math.round((new Date(firstActionAt).getTime() - new Date(assignedAt).getTime()) / 60_000))
    return <p className="text-[12px] text-success flex items-center gap-1.5"><Check className="w-3.5 h-3.5" />First contact {mins < 1 ? 'within a minute' : `after ${mins} min`}</p>
  }
  if (slaState === 'breached') {
    return <p className="text-[12px] font-semibold text-danger flex items-center gap-1.5"><Clock className="w-3.5 h-3.5" />Response time missed — call now</p>
  }
  if ((slaState === 'pending' || slaState === 'nudged') && slaDueAt && now !== null) {
    const left = Math.round((new Date(slaDueAt).getTime() - now) / 1000)
    if (left <= 0) return <p className="text-[12px] font-semibold text-danger flex items-center gap-1.5"><Clock className="w-3.5 h-3.5" />Response time missed — call now</p>
    const mm = Math.floor(left / 60), ss = String(left % 60).padStart(2, '0')
    const urgent = left < 120
    return (
      <p className={`text-[13px] font-semibold flex items-center gap-1.5 ${urgent ? 'text-danger' : 'text-warning'}`} aria-live="polite">
        <Clock className={`w-4 h-4 ${urgent ? 'animate-pulse' : ''}`} />
        {left > 3600 ? `Call by ${fmt(slaDueAt)}` : `Call within ${mm}:${ss}`}
      </p>
    )
  }
  return null
}

export function LeadWorkPanel({ leadId, phone, slaState, slaDueAt, assignedAt, firstActionAt, tasks }: Props) {
  const router = useRouter()
  const [outcome, setOutcome] = useState<Outcome | null>(null)
  const [followUp, setFollowUp] = useState<string>('')
  const [note, setNote] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [adding, setAdding] = useState(false)
  const now = useNow(60_000)
  const quick = useMemo(() => (now ? quickTimes(new Date(now)) : []), [now])
  const digits = phone.replace(/\D/g, '')
  const waNumber = digits.length === 10 ? `91${digits}` : digits

  function contact(channel: 'call' | 'whatsapp') {
    // Fire-and-forget: the dialer / WhatsApp opens immediately; keepalive lets the log finish in the background.
    fetch(`/api/leads/${leadId}/contact`, {
      method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ channel }), keepalive: true,
    }).then(() => router.refresh()).catch(() => undefined)
    if (channel === 'call') window.location.assign(`tel:${phone}`)
    else window.open(`https://wa.me/${waNumber}`, '_blank', 'noopener')
  }

  function choose(o: Outcome) {
    setOutcome(o)
    setError(null)
    const mins = OUTCOME_RULES[o].defaultFollowUpMinutes
    setFollowUp(mins ? toLocalInput(minutesFromNow(mins)) : '')
  }

  async function send(url: string, method: string, body: unknown) {
    setBusy(true); setError(null)
    try {
      const res = await fetch(url, { method, headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) })
      if (!res.ok) {
        const j = await res.json().catch(() => ({}))
        const field = j?.details?.fieldErrors ? Object.values(j.details.fieldErrors as Record<string, string[]>).flat()[0] : null
        setError(field || j.error || 'Something went wrong')
        return false
      }
      router.refresh()
      return true
    } catch {
      setError('Network error — please try again')
      return false
    } finally {
      setBusy(false)
    }
  }

  async function saveOutcome() {
    if (!outcome) return
    const rule = OUTCOME_RULES[outcome]
    const ok = await send(`/api/leads/${leadId}/outcome`, 'POST', {
      outcome, note: note.trim() || null, followUpAt: rule.requiresFollowUp && followUp ? new Date(followUp).toISOString() : null,
    })
    if (ok) { setOutcome(null); setNote('') }
  }

  const open = tasks.filter((t) => t.status === 'open')

  return (
    <section aria-labelledby="work-heading" className="bg-[var(--surface)] border border-[var(--border)] rounded-lg p-4 space-y-4">
      <div className="space-y-1">
        <h2 id="work-heading" className="text-[13px] font-semibold">Work this lead</h2>
        <ResponseClock slaState={slaState} slaDueAt={slaDueAt} assignedAt={assignedAt} firstActionAt={firstActionAt} />
      </div>

      <div className="grid grid-cols-2 gap-2">
        <button type="button" onClick={() => contact('call')}
          className="inline-flex items-center justify-center gap-2 py-2.5 text-[14px] font-semibold text-white bg-[var(--brand)] hover:bg-[var(--brand-hover)] rounded-lg">
          <Phone className="w-4 h-4" /> Call
        </button>
        <button type="button" onClick={() => contact('whatsapp')}
          className="inline-flex items-center justify-center gap-2 py-2.5 text-[14px] font-semibold text-success-foreground bg-success hover:bg-success rounded-lg">
          <MessageCircle className="w-4 h-4" /> WhatsApp
        </button>
      </div>

      <div>
        <p className="text-[12px] font-medium text-[var(--foreground-muted)] mb-2">How did it go?</p>
        <div className="grid grid-cols-2 gap-1.5" role="radiogroup" aria-label="Call outcome">
          {OUTCOMES.map((o) => (
            <button key={o} type="button" role="radio" aria-checked={outcome === o} onClick={() => choose(o)}
              className={`px-2 py-2 text-[12px] font-medium rounded-lg border transition-colors text-left ${TONE[OUTCOME_RULES[o].tone]} ${outcome === o ? 'ring-2 ring-[var(--brand)] ring-offset-1' : ''}`}>
              {OUTCOME_RULES[o].label}
            </button>
          ))}
        </div>
      </div>

      {outcome && (
        <div className="space-y-2.5 p-3 rounded-lg bg-[var(--background)] border border-[var(--border)]">
          {OUTCOME_RULES[outcome].requiresFollowUp && (
            <div>
              <p className="text-[12px] font-medium mb-1.5">Next follow-up</p>
              <div className="flex flex-wrap gap-1.5 mb-2">
                {quick.map((q) => (
                  <button key={q.label} type="button" onClick={() => setFollowUp(toLocalInput(q.at))}
                    className={`px-2 py-1 text-[11px] rounded-full border ${followUp === toLocalInput(q.at) ? 'border-[var(--brand)] bg-[var(--brand-light)] text-[var(--brand)]' : 'border-[var(--border)] bg-[var(--surface)]'}`}>
                    {q.label}
                  </button>
                ))}
              </div>
              <input type="datetime-local" value={followUp} onChange={(e) => setFollowUp(e.target.value)} aria-label="Next follow-up time"
                className="w-full px-2.5 py-1.5 text-[12px] rounded-lg border border-[var(--border)] bg-[var(--surface)]" />
            </div>
          )}
          <textarea value={note} onChange={(e) => setNote(e.target.value)} rows={2} maxLength={1000} placeholder="Note (optional)" aria-label="Note"
            className="w-full px-2.5 py-1.5 text-[12px] rounded-lg border border-[var(--border)] bg-[var(--surface)]" />
          <div className="flex gap-2">
            <button type="button" onClick={saveOutcome} disabled={busy || (OUTCOME_RULES[outcome].requiresFollowUp && !followUp)}
              className="flex-1 py-2 text-[13px] font-semibold text-white bg-[var(--brand)] hover:bg-[var(--brand-hover)] rounded-lg disabled:opacity-50">
              Save
            </button>
            <button type="button" onClick={() => setOutcome(null)} className="px-3 py-2 text-[13px] rounded-lg border border-[var(--border)]">Cancel</button>
          </div>
        </div>
      )}

      {error && <p role="alert" className="text-[12px] text-danger bg-danger-bg border border-danger/30 rounded-lg px-2.5 py-1.5">{error}</p>}

      <div>
        <div className="flex items-center justify-between mb-1.5">
          <p className="text-[12px] font-medium text-[var(--foreground-muted)] flex items-center gap-1.5"><CalendarClock className="w-3.5 h-3.5" />Follow-ups</p>
          <button type="button" onClick={() => { setAdding((v) => !v); setFollowUp(quick[3] ? toLocalInput(quick[3].at) : '') }}
            className="text-[12px] text-[var(--brand)] inline-flex items-center gap-1"><Plus className="w-3 h-3" />Add</button>
        </div>
        {adding && (
          <div className="flex gap-1.5 mb-2">
            <input type="datetime-local" value={followUp} onChange={(e) => setFollowUp(e.target.value)} aria-label="Follow-up time"
              className="flex-1 min-w-0 px-2 py-1.5 text-[12px] rounded-lg border border-[var(--border)]" />
            <button type="button" disabled={busy || !followUp}
              onClick={async () => { if (await send(`/api/leads/${leadId}/tasks`, 'POST', { kind: 'call', dueAt: new Date(followUp).toISOString() })) setAdding(false) }}
              className="px-3 text-[12px] font-semibold text-white bg-[var(--brand)] rounded-lg disabled:opacity-50">Save</button>
          </div>
        )}
        {open.length === 0 ? (
          <p className="text-[12px] text-[var(--foreground-subtle)]">No follow-up scheduled.</p>
        ) : (
          <ul className="space-y-1.5">
            {open.map((t) => {
              const overdue = now !== null && new Date(t.due_at).getTime() < now
              return (
                <li key={t.id} className={`flex items-center gap-2 text-[12px] px-2.5 py-2 rounded-lg border ${overdue ? 'border-danger/30 bg-danger-bg' : 'border-[var(--border)]'}`}>
                  <span className="flex-1 min-w-0">
                    <span className="font-medium capitalize">{t.kind.replace('_', ' ')}</span>{' · '}
                    <span className={overdue ? 'text-danger font-medium' : 'text-[var(--foreground-muted)]'}>{overdue ? 'Overdue · ' : ''}{fmt(t.due_at)}</span>
                    {t.note && <span className="block text-[11px] text-[var(--foreground-muted)] truncate">{t.note}</span>}
                  </span>
                  <button type="button" title="Move to tomorrow" aria-label="Move to tomorrow" disabled={busy}
                    onClick={() => send(`/api/leads/${leadId}/tasks/${t.id}`, 'PATCH', { dueAt: tomorrowFrom(t.due_at) })}
                    className="p-1 rounded hover:bg-[var(--surface-hover)]"><TimerReset className="w-3.5 h-3.5" /></button>
                  <button type="button" title="Mark done" aria-label="Mark done" disabled={busy}
                    onClick={() => send(`/api/leads/${leadId}/tasks/${t.id}`, 'PATCH', { status: 'done' })}
                    className="p-1 rounded hover:bg-success-bg text-success"><Check className="w-3.5 h-3.5" /></button>
                </li>
              )
            })}
          </ul>
        )}
      </div>
    </section>
  )
}
