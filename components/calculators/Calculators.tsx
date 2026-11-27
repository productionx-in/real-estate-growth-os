'use client'
// components/calculators/Calculators.tsx — the salesperson's calculators: home loan EMI, full cost sheet, buyer
// affordability and area units. Every number starts from the workspace's defaults (Settings → Calculators) and can
// be changed for the buyer in front of you; results update as you type or slide, and can be sent on WhatsApp.
import { useMemo, useState } from 'react'
import { Copy, MessageCircle, Plus, X } from 'lucide-react'
import { Button, Field, Input, Select } from '@/components/ui'
import { cn } from '@/lib/utils/cn'
import { SQFT_PER, convertArea, costSheet, inWords, inr, loanSummary, maxLoan, type AreaUnitKey, type Charge } from '@/lib/calculators/finance'
import type { CalculatorSettings } from '@/lib/calculators/settings'

type Tab = 'emi' | 'cost' | 'afford' | 'area'
const TABS: { key: Tab; label: string }[] = [
  { key: 'cost', label: 'Cost sheet' },
  { key: 'emi', label: 'Loan EMI' },
  { key: 'afford', label: 'Affordability' },
  { key: 'area', label: 'Area units' },
]

function Slider({ label, value, onChange, min, max, step, format }: { label: string; value: number; onChange: (v: number) => void; min: number; max: number; step: number; format: (v: number) => string }) {
  return (
    <div className="space-y-1.5">
      <div className="flex items-baseline justify-between gap-3">
        <label className="text-[13px] font-medium">{label}</label>
        <Input type="number" inputMode="decimal" value={Number.isFinite(value) ? value : ''} min={min} step={step} aria-label={label}
          onChange={(e) => onChange(Number(e.target.value))} className="h-9 w-36 text-right tabular-nums" />
      </div>
      <input type="range" min={min} max={max} step={step} value={Math.min(max, Math.max(min, value || 0))} onChange={(e) => onChange(Number(e.target.value))}
        aria-label={`${label} slider`} className="w-full accent-[var(--brand)]" />
      <p className="text-[11px] text-muted">{format(value || 0)}</p>
    </div>
  )
}

function Result({ label, value, sub, big }: { label: string; value: string; sub?: string; big?: boolean }) {
  return (
    <div className={cn('surface-raised rounded-xl border border-default bg-surface p-4', big && 'border-brand/30 bg-[var(--brand-light)]')}>
      <p className="text-[12px] text-muted">{label}</p>
      <p className={cn('mt-1 font-bold tabular-nums', big ? 'text-[26px] text-[var(--brand)]' : 'text-[18px]')}>{value}</p>
      {sub && <p className="text-[12px] text-muted">{sub}</p>}
    </div>
  )
}

function ShareBar({ text }: { text: string }) {
  const [copied, setCopied] = useState(false)
  return (
    <div className="flex flex-wrap gap-2">
      <a href={`https://wa.me/?text=${encodeURIComponent(text)}`} target="_blank" rel="noreferrer"
        className="inline-flex min-h-10 items-center gap-2 rounded-full bg-success px-4 text-[13px] font-semibold text-[#fff]">
        <MessageCircle className="size-4" aria-hidden="true" /> Send on WhatsApp
      </a>
      <Button variant="secondary" size="sm" onClick={() => { navigator.clipboard.writeText(text).then(() => { setCopied(true); setTimeout(() => setCopied(false), 1800) }).catch(() => undefined) }}>
        <Copy className="size-4" aria-hidden="true" /> {copied ? 'Copied' : 'Copy'}
      </Button>
    </div>
  )
}

/** Principal vs interest as one bar, plus the balance falling year by year. */
function LoanChart({ principal, interest, years }: { principal: number; interest: number; years: { year: number; balance: number }[] }) {
  const total = principal + interest || 1
  const max = years[0] ? principal : 1
  return (
    <div className="space-y-3">
      <div className="flex h-3 overflow-hidden rounded-full" role="img" aria-label={`Principal ${Math.round((principal / total) * 100)}%, interest ${Math.round((interest / total) * 100)}%`}>
        <span className="bg-[var(--brand)]" style={{ width: `${(principal / total) * 100}%` }} />
        <span className="bg-warning" style={{ width: `${(interest / total) * 100}%` }} />
      </div>
      <div className="flex gap-4 text-[12px] text-muted">
        <span className="inline-flex items-center gap-1.5"><span className="size-2.5 rounded-full bg-[var(--brand)]" /> Principal</span>
        <span className="inline-flex items-center gap-1.5"><span className="size-2.5 rounded-full bg-warning" /> Interest</span>
      </div>
      <div className="flex h-24 items-end gap-[2px]" role="img" aria-label="Loan balance by year">
        {years.map((y) => (
          <span key={y.year} title={`Year ${y.year}: ${inr(y.balance)} left`} className="flex-1 rounded-t bg-[var(--brand)]/70 motion-safe:transition-all"
            style={{ height: `${Math.max(2, (y.balance / max) * 100)}%` }} />
        ))}
      </div>
      <p className="text-[11px] text-muted">Balance left at the end of each year</p>
    </div>
  )
}

export function Calculators({ defaults, areaUnit = 'sqft' }: { defaults: CalculatorSettings; areaUnit?: string }) {
  const [tab, setTab] = useState<Tab>('cost')
  const unitLabel = areaUnit === 'sqyd' ? 'sq yd' : 'sq ft'

  // Shared between tabs: the cost sheet's total flows into the loan.
  const [area, setArea] = useState(1200)
  const [rate, setRate] = useState(6500)
  const [charges, setCharges] = useState<Charge[]>(defaults.charges)
  const [gst, setGst] = useState(defaults.gstPct)
  const [stamp, setStamp] = useState(defaults.stampDutyPct)
  const [reg, setReg] = useState(defaults.registrationPct)
  const sheet = useMemo(() => costSheet({ area, rate, charges, gstPct: gst, stampDutyPct: stamp, registrationPct: reg }), [area, rate, charges, gst, stamp, reg])

  const [price, setPrice] = useState<number | null>(null)
  const propertyPrice = price ?? Math.round(sheet.agreementValue + sheet.gst)
  const [downPct, setDownPct] = useState(defaults.downPaymentPct)
  const [loanRate, setLoanRate] = useState(defaults.loanRatePct)
  const [years, setYears] = useState(defaults.tenureYears)
  const loanAmount = Math.max(0, propertyPrice * (1 - downPct / 100))
  const loan = useMemo(() => loanSummary(loanAmount, loanRate, years), [loanAmount, loanRate, years])

  const [income, setIncome] = useState(150000)
  const [existing, setExisting] = useState(0)
  const [foir, setFoir] = useState(defaults.foirPct)
  const eligible = maxLoan(income, existing, foir, loanRate, years)
  const budget = eligible / (1 - downPct / 100 || 1)

  const [areaValue, setAreaValue] = useState(1)
  const [fromUnit, setFromUnit] = useState<AreaUnitKey>('acre')

  const setCharge = (i: number, patch: Partial<Charge>) => setCharges((cs) => cs.map((c, k) => (k === i ? { ...c, ...patch } : c)))

  return (
    <div className="space-y-5">
      <div role="tablist" aria-label="Calculators" className="-mx-4 flex gap-2 overflow-x-auto px-4 sm:mx-0 sm:px-0">
        {TABS.map((t) => (
          <button key={t.key} role="tab" aria-selected={tab === t.key} type="button" onClick={() => setTab(t.key)}
            className={cn('min-h-10 shrink-0 rounded-full border px-4 text-[14px] font-medium transition-colors',
              tab === t.key ? 'border-brand/40 bg-[var(--brand-light)] text-[var(--brand)]' : 'border-default bg-surface text-muted hover:text-[var(--foreground)]')}>
            {t.label}
          </button>
        ))}
      </div>

      {tab === 'cost' && (
        <div className="grid gap-5 lg:grid-cols-[1fr_22rem]">
          <div className="space-y-5 surface-raised rounded-2xl border border-default bg-surface p-5">
            <Slider label={`Area (${unitLabel})`} value={area} onChange={setArea} min={100} max={10000} step={10} format={(v) => `${v.toLocaleString('en-IN')} ${unitLabel}`} />
            <Slider label={`Rate (₹ per ${unitLabel})`} value={rate} onChange={setRate} min={500} max={50000} step={50} format={(v) => `${inr(v)} / ${unitLabel}`} />
            <fieldset className="space-y-2">
              <legend className="text-[13px] font-medium">Other charges</legend>
              {charges.map((c, i) => (
                <div key={i} className="grid grid-cols-[1fr_7rem_8rem_auto] items-center gap-2">
                  <Input value={c.label} aria-label="Charge name" onChange={(e) => setCharge(i, { label: e.target.value })} />
                  <Select aria-label="How it is charged" value={c.kind} onChange={(e) => setCharge(i, { kind: e.target.value as Charge['kind'] })}>
                    <option value="fixed">Fixed ₹</option><option value="per_area">₹ / {unitLabel}</option>
                  </Select>
                  <Input type="number" inputMode="decimal" min={0} aria-label={`${c.label} amount`} value={c.amount || ''} placeholder="0"
                    onChange={(e) => setCharge(i, { amount: Number(e.target.value) || 0 })} className="text-right" />
                  <button type="button" aria-label={`Remove ${c.label}`} onClick={() => setCharges((cs) => cs.filter((_, k) => k !== i))} className="grid size-9 place-items-center rounded-full text-muted hover:text-danger"><X className="size-4" /></button>
                </div>
              ))}
              <Button variant="secondary" size="sm" onClick={() => setCharges((cs) => [...cs, { label: 'Other', kind: 'fixed', amount: 0 }])}><Plus className="size-4" aria-hidden="true" /> Add a charge</Button>
            </fieldset>
            <div className="grid gap-3 sm:grid-cols-3">
              <Field label="GST %"><Input type="number" inputMode="decimal" min={0} value={gst} onChange={(e) => setGst(Number(e.target.value) || 0)} /></Field>
              <Field label="Stamp duty %"><Input type="number" inputMode="decimal" min={0} value={stamp} onChange={(e) => setStamp(Number(e.target.value) || 0)} /></Field>
              <Field label="Registration %"><Input type="number" inputMode="decimal" min={0} value={reg} onChange={(e) => setReg(Number(e.target.value) || 0)} /></Field>
            </div>
          </div>
          <div className="space-y-3">
            <Result big label="Total cost to the buyer" value={inr(sheet.total)} sub={`${inWords(sheet.total)} · all-in ${inr(sheet.allInPerArea)} / ${unitLabel}`} />
            <div className="surface-raised rounded-xl border border-default bg-surface p-4 text-[13px]">
              <dl className="space-y-1.5">
                <div className="flex justify-between"><dt>Basic price</dt><dd className="tabular-nums">{inr(sheet.base)}</dd></div>
                {sheet.lines.map((l, i) => <div key={i} className="flex justify-between text-muted"><dt>{l.label}</dt><dd className="tabular-nums">{inr(l.amount)}</dd></div>)}
                <div className="flex justify-between border-t border-default pt-1.5 font-semibold"><dt>Agreement value</dt><dd className="tabular-nums">{inr(sheet.agreementValue)}</dd></div>
                <div className="flex justify-between text-muted"><dt>GST {gst}%</dt><dd className="tabular-nums">{inr(sheet.gst)}</dd></div>
                <div className="flex justify-between text-muted"><dt>Stamp duty {stamp}%</dt><dd className="tabular-nums">{inr(sheet.stampDuty)}</dd></div>
                <div className="flex justify-between text-muted"><dt>Registration {reg}%</dt><dd className="tabular-nums">{inr(sheet.registration)}</dd></div>
              </dl>
            </div>
            <Button variant="secondary" size="sm" onClick={() => { setPrice(null); setTab('emi') }}>Work out the loan for this →</Button>
            <ShareBar text={`Cost sheet — ${area} ${unitLabel} at ${inr(rate)}/${unitLabel}\nBasic price: ${inr(sheet.base)}\n${sheet.lines.map((l) => `${l.label}: ${inr(l.amount)}`).join('\n')}${sheet.lines.length ? '\n' : ''}Agreement value: ${inr(sheet.agreementValue)}\nGST ${gst}%: ${inr(sheet.gst)}\nStamp duty ${stamp}%: ${inr(sheet.stampDuty)}\nRegistration ${reg}%: ${inr(sheet.registration)}\nTotal: ${inr(sheet.total)} (${inWords(sheet.total)})\n\nIndicative; final figures as per the agreement.`} />
          </div>
        </div>
      )}

      {tab === 'emi' && (
        <div className="grid gap-5 lg:grid-cols-[1fr_22rem]">
          <div className="space-y-5 surface-raised rounded-2xl border border-default bg-surface p-5">
            <Slider label="Property price (₹)" value={propertyPrice} onChange={(v) => setPrice(v)} min={500000} max={100000000} step={50000} format={(v) => `${inr(v)} · ${inWords(v)}`} />
            <Slider label="Down payment (%)" value={downPct} onChange={setDownPct} min={0} max={90} step={1} format={(v) => `${inr(propertyPrice * v / 100)} paid upfront`} />
            <Slider label="Interest rate (% a year)" value={loanRate} onChange={setLoanRate} min={5} max={16} step={0.05} format={(v) => `${v}% a year`} />
            <Slider label="Tenure (years)" value={years} onChange={setYears} min={1} max={30} step={1} format={(v) => `${v} years · ${v * 12} EMIs`} />
          </div>
          <div className="space-y-3">
            <Result big label="Monthly EMI" value={inr(loan.emi)} sub={`on a loan of ${inr(loanAmount)} (${inWords(loanAmount)})`} />
            <div className="grid grid-cols-2 gap-3">
              <Result label="Total interest" value={inWords(loan.totalInterest)} />
              <Result label="Total paid" value={inWords(loan.totalPaid + propertyPrice * downPct / 100)} sub="incl. down payment" />
            </div>
            <div className="surface-raised rounded-xl border border-default bg-surface p-4"><LoanChart principal={loanAmount} interest={loan.totalInterest} years={loan.years} /></div>
            <ShareBar text={`Home loan estimate\nProperty price: ${inr(propertyPrice)}\nDown payment ${downPct}%: ${inr(propertyPrice * downPct / 100)}\nLoan: ${inr(loanAmount)} at ${loanRate}% for ${years} years\nMonthly EMI: ${inr(loan.emi)}\nTotal interest: ${inr(loan.totalInterest)}\n\nIndicative; the bank's sanction decides the final EMI.`} />
          </div>
        </div>
      )}

      {tab === 'afford' && (
        <div className="grid gap-5 lg:grid-cols-[1fr_22rem]">
          <div className="space-y-5 surface-raised rounded-2xl border border-default bg-surface p-5">
            <Slider label="Monthly take-home income (₹)" value={income} onChange={setIncome} min={20000} max={2000000} step={5000} format={(v) => `${inr(v)} a month`} />
            <Slider label="Existing EMIs (₹ a month)" value={existing} onChange={setExisting} min={0} max={500000} step={1000} format={(v) => (v ? `${inr(v)} a month` : 'None')} />
            <Slider label="Share of income banks allow for EMIs (%)" value={foir} onChange={setFoir} min={20} max={70} step={1} format={(v) => `${v}% of income`} />
            <Slider label="Interest rate (% a year)" value={loanRate} onChange={setLoanRate} min={5} max={16} step={0.05} format={(v) => `${v}% a year`} />
            <Slider label="Tenure (years)" value={years} onChange={setYears} min={1} max={30} step={1} format={(v) => `${v} years`} />
          </div>
          <div className="space-y-3">
            <Result big label="Home they can afford" value={inWords(budget)} sub={`with ${downPct}% down payment · ${inr(budget)}`} />
            <Result label="Loan they may get" value={inWords(eligible)} sub={`EMI up to ${inr(Math.max(0, income * foir / 100 - existing))} a month`} />
            <ShareBar text={`What you can afford (estimate)\nIncome: ${inr(income)} a month${existing ? `, existing EMIs ${inr(existing)}` : ''}\nLoan you may get: ${inr(eligible)} at ${loanRate}% for ${years} years\nHome budget with ${downPct}% down: ${inr(budget)} (${inWords(budget)})\n\nIndicative; the bank decides final eligibility.`} />
          </div>
        </div>
      )}

      {tab === 'area' && (
        <div className="space-y-4 surface-raised rounded-2xl border border-default bg-surface p-5">
          <div className="grid gap-3 sm:grid-cols-[12rem_12rem]">
            <Field label="Area"><Input type="number" inputMode="decimal" min={0} value={areaValue} onChange={(e) => setAreaValue(Number(e.target.value) || 0)} /></Field>
            <Field label="Unit"><Select value={fromUnit} onChange={(e) => setFromUnit(e.target.value as AreaUnitKey)}>
              {(Object.keys(SQFT_PER) as AreaUnitKey[]).map((u) => <option key={u} value={u}>{UNIT_NAMES[u]}</option>)}
            </Select></Field>
          </div>
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
            {(Object.keys(SQFT_PER) as AreaUnitKey[]).filter((u) => u !== fromUnit).map((u) => (
              <Result key={u} label={UNIT_NAMES[u]} value={convertArea(areaValue, fromUnit, u).toLocaleString('en-IN', { maximumFractionDigits: 3 })} />
            ))}
          </div>
          <p className="text-[12px] text-muted">Gunta and cent are standard; bigha and kanal vary by state, so they are not converted here.</p>
        </div>
      )}
    </div>
  )
}

const UNIT_NAMES: Record<AreaUnitKey, string> = { sqft: 'Square feet', sqyd: 'Square yards (gaj)', sqm: 'Square metres', acre: 'Acres', gunta: 'Guntas', cent: 'Cents', hectare: 'Hectares' }
