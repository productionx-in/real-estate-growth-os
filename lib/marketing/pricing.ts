// lib/marketing/pricing.ts
// Public price list and ROI maths for the marketing site (/, /pricing, /demo).
// Prices are list prices in INR, excluding GST, as set in docs/product-strategy/BUSINESS_MODEL.md.
// This file drives what prospects see; what a workspace is actually entitled to lives in the
// subscription catalogue (subscription_plans / lib/subscriptions/config.ts) and is set at provisioning.

/**
 * Public prices are switched off until the founder approves final packages (pricing research in progress,
 * 19 Nov 2026). While off, the site shows the packages and what they include, never an amount, and every price
 * figure below is a draft that no visitor sees. Turn on by setting NEXT_PUBLIC_PRICES_PUBLISHED=true in the
 * deployment's environment — no code change — once the figures here match the approved, published catalogue.
 */
export const PRICES_PUBLISHED = process.env.NEXT_PUBLIC_PRICES_PUBLISHED === 'true'

/** Plan codes accepted by POST /api/public/onboarding-requests. */
export type RequestPlanCode = 'starter' | 'growth' | 'enterprise'

/** A plan feature. `soon` marks scheduled work that is not live yet — the site labels it, never implies it exists. */
export interface PlanFeature {
  text: string
  soon?: boolean
}

export interface PublicPlan {
  id: 'leads' | 'agencies' | 'enterprise'
  name: string
  audience: string
  monthlyInr: number | null
  annualInr: number | null
  includedUsers: number | null
  extraUserInr: number | null
  requestPlanCode: RequestPlanCode
  companyType: 'developer' | 'channel_partner'
  highlight: boolean
  features: PlanFeature[]
  cta: string
}

export const PUBLIC_PLANS: PublicPlan[] = [
  {
    id: 'agencies',
    name: 'RE for Agencies',
    audience: 'Channel-partner agencies and brokerages',
    monthlyInr: 4999,
    annualInr: 49990,
    includedUsers: 5,
    extraUserInr: 600,
    requestPlanCode: 'starter',
    companyType: 'channel_partner',
    highlight: false,
    features: [
      { text: 'Every lead source in one inbox' },
      { text: 'Instant assignment with in-app alerts' },
      { text: 'Follow-up reminders' },
      { text: 'Register buyers with partner developers' },
      { text: 'Your own independent workspace — your leads stay yours' },
    ],
    cta: 'Talk to us',
  },
  {
    id: 'leads',
    name: 'RE Leads',
    audience: 'Developers running Meta, Google and portal campaigns',
    monthlyInr: 12000,
    annualInr: 120000,
    includedUsers: 10,
    extraUserInr: 900,
    requestPlanCode: 'growth',
    companyType: 'developer',
    highlight: true,
    features: [
      { text: 'Website forms, walk-ins, CSV import and API; Meta, Google, WhatsApp and portals when connected' },
      { text: 'Rule-based routing by project, source and campaign' },
      { text: 'Fair rotation with lead share, daily limits and on-duty' },
      { text: 'Returning buyers go back to the same salesperson' },
      { text: 'Instant assignment alerts' },
      { text: 'Manager view: who got each lead, and why' },
      { text: 'CSV import and guided setup' },
      { text: 'Follow-up reminders and escalation when a lead is not contacted in time' },
      { text: 'Speed-to-lead report' },
      { text: 'Share projects with partner agencies and review their buyer registrations' },
    ],
    cta: 'Book a demo',
  },
  {
    id: 'enterprise',
    name: 'Enterprise',
    audience: '100+ salespeople, several cities',
    monthlyInr: null,
    annualInr: null,
    includedUsers: null,
    extraUserInr: null,
    requestPlanCode: 'enterprise',
    companyType: 'developer',
    highlight: false,
    features: [
      { text: 'Everything in RE Leads' },
      { text: 'Multiple business units and cities' },
      { text: 'API access and data export' },
      { text: 'Named success manager' },
    ],
    cta: 'Contact sales',
  },
]

export const ONBOARDING_FEE_INR = 25000

const inr = new Intl.NumberFormat('en-IN', { style: 'currency', currency: 'INR', maximumFractionDigits: 0 })
export const formatInr = (n: number) => inr.format(Math.round(n))

/** Monthly price for a plan with `users` seats (null for quote-only plans). */
export function monthlyPriceFor(plan: PublicPlan, users: number): number | null {
  if (plan.monthlyInr === null || plan.includedUsers === null || plan.extraUserInr === null) return null
  const extra = Math.max(0, Math.ceil(users) - plan.includedUsers)
  return plan.monthlyInr + extra * plan.extraUserInr
}

export interface RoiInput {
  /** Monthly ad + portal spend in INR. */
  monthlySpendInr: number
  /** Leads received per month. */
  monthlyLeads: number
  /** Share of leads never contacted or contacted too late to matter, 0–100. */
  leakagePct: number
  /** Share of those leads RE helps you reach in time, 0–100. */
  recoveryPct: number
  /** Salespeople who need a login. */
  users: number
}

export interface RoiResult {
  costPerLead: number
  leadsLost: number
  spendWasted: number
  leadsRecovered: number
  spendRecovered: number
  subscription: number
  /** Recovered ad value per rupee of subscription. */
  multiple: number
}

const clamp = (v: number, lo: number, hi: number) => (Number.isFinite(v) ? Math.min(hi, Math.max(lo, v)) : lo)

/**
 * Illustrative only: values recovered ad spend (cost per lead × leads rescued), not revenue.
 * Never claims closed sales — the site states this next to the calculator.
 */
export function estimateRoi(input: RoiInput, plan: PublicPlan = PUBLIC_PLANS.find((p) => p.id === 'leads')!): RoiResult {
  const spend = clamp(input.monthlySpendInr, 0, 1e9)
  const leads = clamp(input.monthlyLeads, 0, 1e7)
  const leak = clamp(input.leakagePct, 0, 100) / 100
  const recovery = clamp(input.recoveryPct, 0, 100) / 100
  const users = clamp(input.users, 1, 10000)
  const costPerLead = leads > 0 ? spend / leads : 0
  const leadsLost = leads * leak
  const leadsRecovered = leadsLost * recovery
  const subscription = monthlyPriceFor(plan, users) ?? 0
  const spendRecovered = leadsRecovered * costPerLead
  return {
    costPerLead,
    leadsLost,
    spendWasted: leadsLost * costPerLead,
    leadsRecovered,
    spendRecovered,
    subscription,
    multiple: subscription > 0 ? spendRecovered / subscription : 0,
  }
}
