// lib/calculators/finance.ts — the maths behind the sales calculators (EMI, cost sheet, affordability, area units).
// Pure and dependency-free, so the screens and the tests share one definition. Rupees throughout; rates in % a year.

/** Monthly instalment for a loan (reducing balance). 0% interest = principal spread evenly. */
export function emi(principal: number, ratePct: number, years: number): number {
  const n = Math.round(years * 12)
  if (principal <= 0 || n <= 0) return 0
  const r = ratePct / 1200
  if (r === 0) return principal / n
  const f = Math.pow(1 + r, n)
  return (principal * r * f) / (f - 1)
}

export interface LoanSummary { emi: number; totalInterest: number; totalPaid: number; months: number; years: { year: number; principal: number; interest: number; balance: number }[] }

/** EMI with the year-by-year split of principal and interest (for the chart). */
export function loanSummary(principal: number, ratePct: number, years: number): LoanSummary {
  const months = Math.round(years * 12)
  const m = emi(principal, ratePct, years)
  const r = ratePct / 1200
  let balance = principal
  const out: LoanSummary['years'] = []
  for (let y = 1; y <= Math.ceil(months / 12); y++) {
    let p = 0, i = 0
    for (let k = 0; k < 12 && (y - 1) * 12 + k < months; k++) {
      const interest = balance * r
      const princ = Math.min(balance, m - interest)
      balance -= princ; p += princ; i += interest
    }
    out.push({ year: y, principal: p, interest: i, balance: Math.max(0, balance) })
  }
  const totalPaid = m * months
  return { emi: m, totalInterest: Math.max(0, totalPaid - principal), totalPaid, months, years: out }
}

export interface Charge { label: string; kind: 'fixed' | 'per_area'; amount: number }
export interface CostSheetInput { area: number; rate: number; charges: Charge[]; gstPct: number; stampDutyPct: number; registrationPct: number }
export interface CostSheet { base: number; lines: { label: string; amount: number }[]; agreementValue: number; gst: number; stampDuty: number; registration: number; total: number; allInPerArea: number }

/** Basic price + charges = agreement value; GST on it; stamp duty and registration on the agreement value. */
export function costSheet({ area, rate, charges, gstPct, stampDutyPct, registrationPct }: CostSheetInput): CostSheet {
  const base = Math.max(0, area) * Math.max(0, rate)
  const lines = charges.filter((c) => c.amount > 0).map((c) => ({ label: c.label, amount: c.kind === 'per_area' ? c.amount * Math.max(0, area) : c.amount }))
  const agreementValue = base + lines.reduce((s, l) => s + l.amount, 0)
  const gst = (agreementValue * gstPct) / 100
  const stampDuty = (agreementValue * stampDutyPct) / 100
  const registration = (agreementValue * registrationPct) / 100
  const total = agreementValue + gst + stampDuty + registration
  return { base, lines, agreementValue, gst, stampDuty, registration, total, allInPerArea: area > 0 ? total / area : 0 }
}

/** The largest loan a buyer can service: (income × share allowed for EMIs − existing EMIs), as a loan amount. */
export function maxLoan(monthlyIncome: number, existingEmis: number, foirPct: number, ratePct: number, years: number): number {
  const room = (monthlyIncome * foirPct) / 100 - existingEmis
  if (room <= 0) return 0
  const unit = emi(100000, ratePct, years) // EMI per lakh
  return unit > 0 ? (room / unit) * 100000 : 0
}

/** Square feet in one of each unit (Indian land units: gunta and cent are fixed; bigha varies by state, so it is left out). */
export const SQFT_PER = { sqft: 1, sqyd: 9, sqm: 10.7639, acre: 43560, gunta: 1089, cent: 435.6, hectare: 107639.104 } as const
export type AreaUnitKey = keyof typeof SQFT_PER
export const convertArea = (value: number, from: AreaUnitKey, to: AreaUnitKey) => (value * SQFT_PER[from]) / SQFT_PER[to]

/** ₹ in Indian grouping, with lakh / crore words for big amounts. */
export function inr(n: number): string {
  return '₹' + Math.round(n).toLocaleString('en-IN')
}
export function inWords(n: number): string {
  if (n >= 1e7) return `${(n / 1e7).toFixed(2).replace(/\.00$/, '')} Cr`
  if (n >= 1e5) return `${(n / 1e5).toFixed(2).replace(/\.00$/, '')} L`
  return Math.round(n).toLocaleString('en-IN')
}
