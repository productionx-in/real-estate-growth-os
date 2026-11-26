'use client'
// components/marketing/DemoRequestForm.tsx
// Demo / pilot request — RE by PX sells with RE by PX: the request is submitted as a website enquiry
// (POST /api/forms/submit) to a website-form connection in Production X's own RE by PX workspace, so it
// becomes a lead there and is routed and alerted to the sales team like any customer's lead.
// The connection id comes from REGROW_DEMO_FORM_CONNECTION_ID (server env, passed in as a prop).
import { useEffect, useRef, useState } from 'react'
import { CheckCircle2, Loader2 } from 'lucide-react'
import { PUBLIC_PLANS, type PublicPlan } from '@/lib/marketing/pricing'
import { INTERESTS, type InterestId } from '@/lib/marketing/interests'

const CURRENT_TOOLS = ['A real estate CRM', 'A general-purpose CRM', 'Excel / Google Sheets / WhatsApp', 'No CRM yet', 'Other']
const LEAD_VOLUMES = ['Under 300', '300–1,000', '1,000–3,000', 'Over 3,000']

const input = 'w-full px-3.5 py-2.5 text-[15px] rounded-xl border border-[var(--border-strong)] bg-white focus:outline-none focus:ring-2 focus:ring-blue-200 focus:border-[var(--brand)]'
const label = 'block text-[14px] font-medium mb-1.5'

// connectionId is accepted for compatibility but no longer needed: requests go to /api/website/demo-request.
export function DemoRequestForm({ initialPlan, initialInterest = 'demo' }: { initialPlan: PublicPlan['id']; connectionId?: string | null; initialInterest?: InterestId }) {
  const loadedAt = useRef(0)
  useEffect(() => { loadedAt.current = Date.now() }, [])
  const [planId, setPlanId] = useState<PublicPlan['id']>(initialPlan)
  const [status, setStatus] = useState<'idle' | 'sending' | 'done'>('idle')
  const [error, setError] = useState<string | null>(null)

  async function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault()
    const f = new FormData(e.currentTarget)
    const plan = PUBLIC_PLANS.find((p) => p.id === planId) ?? PUBLIC_PLANS[1]
    const companyType = f.get('companyType') === 'channel_partner' ? 'Channel-partner agency' : 'Developer / builder'
    const text = (k: string) => String(f.get(k) ?? '').trim()
    const interest = INTERESTS.find((i) => i.id === f.get('interest')) ?? INTERESTS[0]
    const notes = [
      `Request: ${interest.label}`,
      `Company: ${text('companyName')} (${companyType})`,
      `Interested in: ${plan.name}`,
      `Sales team size: ${text('teamSize') || 'not given'}`,
      `Current tool: ${text('currentTool') || 'not given'}`,
      `Leads per month: ${text('leadVolume') || 'not given'}`,
      text('message') && `Message: ${text('message')}`,
    ].filter(Boolean).join('\n').slice(0, 1000)

    setStatus('sending')
    setError(null)
    try {
      const res = await fetch('/api/website/demo-request', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: text('contactName'),
          phone: text('contactPhone'),
          email: text('contactEmail'),
          companyName: text('companyName'),
          companyType: f.get('companyType') === 'channel_partner' ? 'channel_partner' : 'developer',
          teamSize: text('teamSize') || undefined,
          interest: `${interest.label} · ${plan.name}`,
          notes,
          website_url_hp: text('website_url_hp'),
          formLoadTime: loadedAt.current,
          submissionTime: Date.now(),
        }),
      })
      const json = await res.json().catch(() => ({}))
      if (res.ok && json.success !== false) {
        setStatus('done')
        return
      }
      setError(json.error || 'Something went wrong. Please try again.')
    } catch {
      setError('Could not reach us. Check your connection and try again.')
    }
    setStatus('idle')
  }

  if (status === 'done') {
    return (
      <div role="status" className="rounded-2xl border border-emerald-200 bg-emerald-50 p-8 text-center">
        <CheckCircle2 className="w-10 h-10 text-emerald-600 mx-auto" aria-hidden="true" />
        <h2 className="mt-3 text-[20px] font-bold">Thanks — we have your request</h2>
        <p className="mt-2 text-[15px] text-[var(--foreground-muted)]">We will call you within one working day to find a time that suits you.</p>
      </div>
    )
  }

  return (
    <form onSubmit={onSubmit} className="relative space-y-4">
      <div>
        <label htmlFor="interest" className={label}>I would like</label>
        <select id="interest" name="interest" className={input} defaultValue={initialInterest}>
          {INTERESTS.map((i) => <option key={i.id} value={i.id}>{i.label}</option>)}
        </select>
      </div>

      <fieldset>
        <legend className={label}>I am interested in</legend>
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
          {PUBLIC_PLANS.map((p) => (
            <label key={p.id} className={`cursor-pointer rounded-xl border px-3 py-2.5 text-[14px] font-medium text-center transition-colors ${planId === p.id ? 'border-[var(--brand)] bg-[var(--brand-light)] text-[var(--brand)]' : 'border-[var(--border-strong)] hover:bg-[var(--surface-hover)]'}`}>
              <input type="radio" name="plan" value={p.id} checked={planId === p.id} onChange={() => setPlanId(p.id)} className="sr-only" />
              {p.name.replace('RE by PX ', '')}
            </label>
          ))}
        </div>
      </fieldset>

      <div className="grid gap-4 sm:grid-cols-2">
        <div><label htmlFor="contactName" className={label}>Your name</label><input id="contactName" name="contactName" required minLength={2} maxLength={100} autoComplete="name" className={input} /></div>
        <div><label htmlFor="companyName" className={label}>Company</label><input id="companyName" name="companyName" required minLength={2} maxLength={100} autoComplete="organization" className={input} /></div>
        <div><label htmlFor="contactEmail" className={label}>Work email</label><input id="contactEmail" name="contactEmail" type="email" required maxLength={255} autoComplete="email" className={input} /></div>
        <div><label htmlFor="contactPhone" className={label}>Mobile</label><input id="contactPhone" name="contactPhone" type="tel" required minLength={10} maxLength={20} autoComplete="tel" placeholder="+91" className={input} /></div>
        <div>
          <label htmlFor="companyType" className={label}>We are a</label>
          <select id="companyType" name="companyType" className={input} defaultValue={planId === 'agencies' ? 'channel_partner' : 'developer'} key={planId}>
            <option value="developer">Developer / builder</option>
            <option value="channel_partner">Channel-partner agency</option>
          </select>
        </div>
        <div><label htmlFor="teamSize" className={label}>Sales team size</label><input id="teamSize" name="teamSize" type="number" min={1} max={500} defaultValue={10} required className={input} /></div>
        <div>
          <label htmlFor="currentTool" className={label}>What do you use today?</label>
          <select id="currentTool" name="currentTool" className={input} defaultValue="">
            <option value="" disabled>Choose one</option>
            {CURRENT_TOOLS.map((t) => <option key={t}>{t}</option>)}
          </select>
        </div>
        <div>
          <label htmlFor="leadVolume" className={label}>Leads per month</label>
          <select id="leadVolume" name="leadVolume" className={input} defaultValue="">
            <option value="" disabled>Choose one</option>
            {LEAD_VOLUMES.map((t) => <option key={t}>{t}</option>)}
          </select>
        </div>
      </div>
      <div>
        <label htmlFor="message" className={label}>Anything we should know? <span className="font-normal text-[var(--foreground-subtle)]">(optional)</span></label>
        <textarea id="message" name="message" rows={3} maxLength={600} className={input} placeholder="e.g. Launching a new project in January, leads come from Meta and 99acres" />
      </div>

      {/* Honeypot: hidden from people, filled by bots; the server discards submissions that fill it. */}
      <div aria-hidden="true" className="absolute -left-[9999px] w-px h-px overflow-hidden">
        <label htmlFor="website_url_hp">Leave this empty</label>
        <input id="website_url_hp" name="website_url_hp" type="text" tabIndex={-1} autoComplete="off" />
      </div>

      {error && <p role="alert" className="text-[14px] text-red-700 bg-red-50 border border-red-200 rounded-xl px-3.5 py-2.5">{error}</p>}

      <button type="submit" disabled={status === 'sending'}
        className="w-full inline-flex items-center justify-center gap-2 px-5 py-3 text-[15px] font-semibold text-white bg-[var(--brand)] hover:bg-[var(--brand-hover)] disabled:opacity-60 rounded-xl transition-colors">
        {status === 'sending' && <Loader2 className="w-4 h-4 animate-spin" aria-hidden="true" />}
        Send my request
      </button>
      <p className="text-[12px] text-[var(--foreground-subtle)] text-center">We use these details only to contact you about RE by PX.</p>
    </form>
  )
}
