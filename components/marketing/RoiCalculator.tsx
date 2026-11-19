'use client'
// components/marketing/RoiCalculator.tsx
// "What are slow responses costing you?" — values recovered ad spend only, never claims sales.
import { useId, useState } from 'react'
import Link from 'next/link'
import { PRICES_PUBLISHED, estimateRoi, formatInr } from '@/lib/marketing/pricing'

interface FieldProps {
  label: string
  hint?: string
  value: number
  min: number
  max: number
  step: number
  format: (v: number) => string
  onChange: (v: number) => void
}

function Field({ label, hint, value, min, max, step, format, onChange }: FieldProps) {
  const id = useId()
  return (
    <div>
      <div className="flex items-baseline justify-between gap-3">
        <label htmlFor={id} className="text-[14px] font-medium">{label}</label>
        <output htmlFor={id} className="text-[15px] font-bold tabular-nums">{format(value)}</output>
      </div>
      {hint && <p className="text-[12px] text-[var(--foreground-subtle)]">{hint}</p>}
      <input id={id} type="range" min={min} max={max} step={step} value={value}
        onChange={(e) => onChange(Number(e.target.value))}
        className="mt-2 w-full accent-[var(--brand)]" />
    </div>
  )
}

export function RoiCalculator() {
  const [spend, setSpend] = useState(500000)
  const [leads, setLeads] = useState(1000)
  const [leak, setLeak] = useState(30)
  const [recovery, setRecovery] = useState(50)
  const [users, setUsers] = useState(10)
  const r = estimateRoi({ monthlySpendInr: spend, monthlyLeads: leads, leakagePct: leak, recoveryPct: recovery, users })
  const n = (v: number) => Math.round(v).toLocaleString('en-IN')

  return (
    <div className="grid gap-8 lg:grid-cols-[1.2fr_1fr] rounded-3xl border border-[var(--border)] bg-white p-6 sm:p-8">
      <div className="space-y-6">
        <Field label="Monthly spend on ads and portals" value={spend} min={50000} max={5000000} step={50000} format={formatInr} onChange={setSpend} />
        <Field label="Leads per month" value={leads} min={100} max={10000} step={100} format={n} onChange={setLeads} />
        <Field label="Leads not reached in time today" hint="Never called, or called after the buyer moved on" value={leak} min={0} max={80} step={5} format={(v) => `${v}%`} onChange={setLeak} />
        <Field label="Of those, how many faster response would save" value={recovery} min={0} max={100} step={10} format={(v) => `${v}%`} onChange={setRecovery} />
        {PRICES_PUBLISHED && <Field label="Salespeople" value={users} min={1} max={100} step={1} format={n} onChange={setUsers} />}
      </div>

      <div className="rounded-2xl bg-[#0b1220] text-white p-6 flex flex-col">
        <p className="text-[13px] text-slate-400">Your cost per lead</p>
        <p className="text-[22px] font-bold tabular-nums">{formatInr(r.costPerLead)}</p>

        <p className="mt-5 text-[13px] text-slate-400">Ad spend on leads not reached in time</p>
        <p className="text-[22px] font-bold tabular-nums text-red-300">{formatInr(r.spendWasted)} <span className="text-[13px] font-normal text-slate-400">/ month</span></p>

        <p className="mt-5 text-[13px] text-slate-400">Ad value recovered with faster response</p>
        <p className="text-[30px] font-extrabold tabular-nums text-emerald-300">{formatInr(r.spendRecovered)} <span className="text-[13px] font-normal text-slate-400">/ month</span></p>
        <p className="text-[13px] text-slate-300">{n(r.leadsRecovered)} more leads reached each month</p>

        {PRICES_PUBLISHED && (
        <div className="mt-5 pt-5 border-t border-white/10">
          <p className="text-[13px] text-slate-400">REGrow Leads for {users} user{users === 1 ? '' : 's'}</p>
          <p className="text-[18px] font-semibold tabular-nums">{formatInr(r.subscription)} / month</p>
          <p className="mt-2 text-[14px] text-slate-200" aria-live="polite">
            {r.multiple >= 1
              ? <>Recovers about <span className="font-bold text-white">{r.multiple.toFixed(1)}×</span> its cost in ad value alone.</>
              : 'At these numbers the subscription costs more than the ad value recovered.'}
          </p>
        </div>
        )}
        <Link href="/leakage-audit" className="mt-6 text-center px-4 py-3 text-[15px] font-semibold text-[#0b1220] bg-white hover:bg-blue-50 rounded-xl transition-colors">
          Get a free lead-leakage audit
        </Link>
        <p className="mt-3 text-[11px] text-slate-500 leading-relaxed">
          Estimate only. It values leads you would reach in time at what you paid for them; it does not predict bookings or revenue.
        </p>
      </div>
    </div>
  )
}
