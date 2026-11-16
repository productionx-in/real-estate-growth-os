// components/marketing/LeadFlowPreview.tsx
// Illustrative product preview for the hero: one enquiry's journey from ad form to first call.
// Pure markup (no screenshots), so it stays sharp at any size and needs no image assets.
import { Bell, CheckCircle2, PhoneCall, Shuffle, Zap } from 'lucide-react'

const STEPS = [
  { t: '10:42:03', icon: Zap, tone: 'bg-blue-50 text-blue-700', title: 'New enquiry · Meta lead form', body: 'Rohan Iyer · 3 BHK · Skyline Towers' },
  { t: '10:42:04', icon: Shuffle, tone: 'bg-violet-50 text-violet-700', title: 'Routed to Asha (Towers Desk)', body: 'Rule “Skyline Towers — Meta” · her turn in the rotation' },
  { t: '10:42:05', icon: Bell, tone: 'bg-amber-50 text-amber-700', title: 'Asha is alerted instantly', body: 'Buyer’s number one tap away' },
  { t: '10:44:31', icon: PhoneCall, tone: 'bg-emerald-50 text-emerald-700', title: 'First call made', body: 'Site visit booked for Saturday 11:00' },
]

export function LeadFlowPreview() {
  return (
    <div className="relative">
      <div aria-hidden="true" className="absolute -inset-6 bg-gradient-to-tr from-blue-100 via-indigo-50 to-transparent rounded-[2rem] blur-2xl" />
      <figure className="relative bg-white rounded-2xl border border-[var(--border)] shadow-xl shadow-blue-900/5 p-5">
        <figcaption className="flex items-center justify-between mb-4">
          <span className="text-[13px] font-semibold">Lead timeline</span>
          <span className="inline-flex items-center gap-1.5 text-[12px] font-medium text-emerald-700 bg-emerald-50 border border-emerald-200 rounded-full px-2.5 py-0.5">
            <CheckCircle2 className="w-3.5 h-3.5" aria-hidden="true" /> Contacted in 2 min 28 s
          </span>
        </figcaption>
        <ol className="space-y-3">
          {STEPS.map((s, i) => (
            <li key={s.t} className="flex gap-3">
              <div className="flex flex-col items-center">
                <span className={`w-8 h-8 rounded-lg flex items-center justify-center ${s.tone}`}><s.icon className="w-4 h-4" aria-hidden="true" /></span>
                {i < STEPS.length - 1 && <span className="w-px flex-1 bg-[var(--border)] mt-1" aria-hidden="true" />}
              </div>
              <div className="pb-1 min-w-0">
                <p className="text-[13px] font-semibold leading-tight">{s.title}</p>
                <p className="text-[12px] text-[var(--foreground-muted)] mt-0.5">{s.body}</p>
                <p className="text-[11px] font-mono text-[var(--foreground-subtle)] mt-0.5">{s.t}</p>
              </div>
            </li>
          ))}
        </ol>
        <p className="mt-3 text-[11px] text-[var(--foreground-subtle)]">Illustration. Names are fictional.</p>
      </figure>
    </div>
  )
}
