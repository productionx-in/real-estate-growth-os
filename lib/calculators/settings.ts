// lib/calculators/settings.ts — the workspace's calculator defaults (Settings → Calculators, org_settings.calculators,
// 20260111). Owners and admins set the bank rate, tax rates and the extra charges their projects add; salespeople
// start every calculation from these and can still change any number for a buyer. Pure; shared by form, API and tests.
import type { Charge } from '@/lib/calculators/finance'

export interface CalculatorSettings {
  loanRatePct: number
  tenureYears: number
  downPaymentPct: number
  /** Share of monthly income banks allow for all EMIs (FOIR). */
  foirPct: number
  gstPct: number
  stampDutyPct: number
  registrationPct: number
  /** Extra charges on the cost sheet: a fixed amount, or an amount per sq ft. */
  charges: Charge[]
}

export const DEFAULT_CALCULATORS: CalculatorSettings = {
  loanRatePct: 8.5, tenureYears: 20, downPaymentPct: 20, foirPct: 50,
  gstPct: 5, stampDutyPct: 6, registrationPct: 1,
  charges: [
    { label: 'Car parking', kind: 'fixed', amount: 0 },
    { label: 'Club membership', kind: 'fixed', amount: 0 },
    { label: 'Floor rise / PLC', kind: 'per_area', amount: 0 },
  ],
}

export const CALC_LIMITS = { charges: 12, label: 40 } as const

type Errors = Record<string, string>
const num = (v: unknown) => (typeof v === 'number' ? v : typeof v === 'string' && v.trim() !== '' ? Number(v) : NaN)

export function normaliseCalculators(o: Record<string, unknown>): { value: CalculatorSettings; errors: Errors } {
  const errors: Errors = {}
  const pick = (key: keyof CalculatorSettings, min: number, max: number, label: string) => {
    const n = num(o[key])
    if (!Number.isFinite(n) || n < min || n > max) { errors[key] = `${label} must be between ${min} and ${max}.`; return DEFAULT_CALCULATORS[key] as number }
    return Math.round(n * 100) / 100
  }
  const value: CalculatorSettings = {
    loanRatePct: pick('loanRatePct', 0, 30, 'Loan interest rate'),
    tenureYears: pick('tenureYears', 1, 35, 'Loan tenure'),
    downPaymentPct: pick('downPaymentPct', 0, 100, 'Down payment'),
    foirPct: pick('foirPct', 10, 80, 'Share of income for EMIs'),
    gstPct: pick('gstPct', 0, 28, 'GST'),
    stampDutyPct: pick('stampDutyPct', 0, 15, 'Stamp duty'),
    registrationPct: pick('registrationPct', 0, 10, 'Registration'),
    charges: [],
  }
  const list = Array.isArray(o.charges) ? o.charges : []
  if (list.length > CALC_LIMITS.charges) errors.charges = `Up to ${CALC_LIMITS.charges} charges.`
  for (const c of list.slice(0, CALC_LIMITS.charges)) {
    if (!c || typeof c !== 'object') continue
    const r = c as Record<string, unknown>
    const label = typeof r.label === 'string' ? r.label.replace(/\s+/g, ' ').trim().slice(0, CALC_LIMITS.label) : ''
    const amount = num(r.amount)
    if (!label) continue
    if (!Number.isFinite(amount) || amount < 0 || amount > 1e10) { errors.charges = `Enter a valid amount for “${label}”.`; continue }
    value.charges.push({ label, kind: r.kind === 'per_area' ? 'per_area' : 'fixed', amount })
  }
  return { value, errors }
}

/** Stored settings, with defaults for anything missing or invalid (older rows read as the defaults). */
export function calculatorsFromStored(v: unknown): CalculatorSettings {
  if (!v || typeof v !== 'object' || Array.isArray(v) || !Object.keys(v).length) return DEFAULT_CALCULATORS
  const { value } = normaliseCalculators({ ...DEFAULT_CALCULATORS, ...(v as object) })
  return value
}
