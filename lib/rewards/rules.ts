// lib/rewards/rules.ts — rewards and incentives (20260100): labels, the form's checks, and who may take which step on a
// claim. Pure, shared by the API, the Rewards page and the tests. The database checks the programme again (constraints,
// guard_reward_program) and the order of a claim's steps (set_reward_claim_status); winners are found by the database
// from the performance ledger, never entered here.
import type { MemberRole } from '@/types/database'

export const REWARD_TYPES = {
  gadget: { label: 'Gadget', hint: 'iPhone, iPad, MacBook…' },
  travel: { label: 'Travel', hint: 'Holiday, hotel stay, team trip…' },
  gift_card: { label: 'Gift card or voucher', hint: 'Amazon, Taj, Myntra…' },
  cash: { label: 'Cash bonus', hint: 'Paid with salary' },
  custom: { label: 'Something else', hint: 'Anything your workspace offers' },
} as const
export type RewardType = keyof typeof REWARD_TYPES

export const REWARD_METRICS = {
  closed: { label: 'Deal credit', unit: 'deals' },
  deals: { label: 'Deals closed', unit: 'deals' },
  revenue: { label: 'Revenue', unit: '₹' },
  meetings: { label: 'Site visits', unit: 'visits' },
  contacted: { label: 'Leads contacted', unit: 'leads' },
  follow_ups: { label: 'Follow-ups done', unit: 'follow-ups' },
  xp: { label: 'Points', unit: 'XP' },
} as const
export type RewardMetric = keyof typeof REWARD_METRICS

export const CLAIM_STATUS = {
  pending: { label: 'Waiting for approval', tone: 'warning' },
  approved: { label: 'Approved', tone: 'info' },
  rejected: { label: 'Not approved', tone: 'danger' },
  fulfilled: { label: 'Given', tone: 'success' },
  redeemed: { label: 'Received', tone: 'success' },
} as const
export type ClaimStatus = keyof typeof CLAIM_STATUS

/** Owners, admins and managers set up programmes and decide claims. */
export const REWARD_MANAGERS = ['owner', 'admin', 'manager'] as const satisfies readonly MemberRole[]
export const canManageRewards = (role: MemberRole) => (REWARD_MANAGERS as readonly string[]).includes(role)
const SELLER_ROLES = ['owner', 'admin', 'manager', 'team_lead', 'sales_exec'] as const

/**
 * The steps this person may take on a claim now. Managers approve or reject a waiting claim, mark an approved one as
 * given (or reject it), and may confirm it was received; the winner may confirm receipt of a reward that was given.
 */
export function claimSteps(status: ClaimStatus, opts: { manager: boolean; winner: boolean }): ('approved' | 'rejected' | 'fulfilled' | 'redeemed')[] {
  if (status === 'pending') return opts.manager ? ['approved', 'rejected'] : []
  if (status === 'approved') return opts.manager ? ['fulfilled', 'rejected'] : []
  if (status === 'fulfilled') return opts.manager || opts.winner ? ['redeemed'] : []
  return []
}
export const STEP_LABEL = { approved: 'Approve', rejected: 'Reject', fulfilled: 'Mark as given', redeemed: 'Mark as received' } as const

export interface ProgramInput {
  title: string; description: string | null; rewardType: RewardType; rewardDetail: string; unitValue: number; budget: number | null
  scope: 'person' | 'team'; eligibleRoles: string[]; eligibleTeamIds: string[]
  goalKind: 'reach' | 'top'; metric: RewardMetric; goalAmount: number | null; topN: number | null; maxWinners: number | null
  startsOn: string; endsOn: string
}

const DAY = /^\d{4}-\d{2}-\d{2}$/
const num = (v: unknown) => (typeof v === 'number' ? v : typeof v === 'string' && v.trim() !== '' ? Number(v) : Number.NaN)

/** Checks a programme from the form. Every message says what to fix. */
export function normaliseProgram(raw: unknown): { value: ProgramInput | null; error: string | null } {
  const o = (raw ?? {}) as Record<string, unknown>
  const fail = (error: string) => ({ value: null, error })
  const title = typeof o.title === 'string' ? o.title.trim() : ''
  if (!title || title.length > 120) return fail('Give the programme a name (up to 120 characters).')
  const rewardType = o.rewardType as RewardType
  if (!(rewardType in REWARD_TYPES)) return fail('Choose what kind of reward it is.')
  const rewardDetail = typeof o.rewardDetail === 'string' ? o.rewardDetail.trim() : ''
  if (!rewardDetail || rewardDetail.length > 200) return fail('Say what the reward is, e.g. “iPhone 16, 128 GB” (up to 200 characters).')
  const unitValue = o.unitValue === undefined || o.unitValue === '' || o.unitValue === null ? 0 : num(o.unitValue)
  if (!Number.isFinite(unitValue) || unitValue < 0) return fail('The value of one reward must be zero or more.')
  const budget = o.budget === undefined || o.budget === '' || o.budget === null ? null : num(o.budget)
  if (budget !== null && (!Number.isFinite(budget) || budget < 0)) return fail('The budget must be zero or more, or left empty.')
  if (budget !== null && unitValue > 0 && budget < unitValue) return fail('The budget does not cover even one reward.')
  const scope = o.scope === 'team' ? 'team' : 'person'
  const eligibleRoles = Array.isArray(o.eligibleRoles) ? [...new Set(o.eligibleRoles.filter((r): r is string => typeof r === 'string'))] : ['sales_exec', 'team_lead']
  if (scope === 'person' && (!eligibleRoles.length || eligibleRoles.some((r) => !(SELLER_ROLES as readonly string[]).includes(r)))) return fail('Choose who can win: the roles that sell.')
  const eligibleTeamIds = Array.isArray(o.eligibleTeamIds) ? [...new Set(o.eligibleTeamIds.filter((r): r is string => typeof r === 'string' && /^[0-9a-f-]{36}$/i.test(r)))] : []
  const goalKind = o.goalKind === 'top' ? 'top' : o.goalKind === 'reach' ? 'reach' : null
  if (!goalKind) return fail('Choose how people win: by reaching an amount, or by finishing in the top places.')
  const metric = o.metric as RewardMetric
  if (!(metric in REWARD_METRICS)) return fail('Choose what is counted.')
  let goalAmount: number | null = null, topN: number | null = null
  if (goalKind === 'reach') {
    goalAmount = num(o.goalAmount)
    if (!Number.isFinite(goalAmount) || goalAmount <= 0) return fail('Set the amount to reach (more than zero).')
  } else {
    topN = num(o.topN)
    if (!Number.isInteger(topN) || topN < 1 || topN > 50) return fail('Reward the top 1 to 50.')
  }
  const maxWinners = o.maxWinners === undefined || o.maxWinners === '' || o.maxWinners === null ? null : num(o.maxWinners)
  if (maxWinners !== null && (!Number.isInteger(maxWinners) || maxWinners < 1 || maxWinners > 1000)) return fail('The most winners must be a whole number from 1 to 1000, or left empty.')
  const startsOn = typeof o.startsOn === 'string' && DAY.test(o.startsOn) ? o.startsOn : ''
  const endsOn = typeof o.endsOn === 'string' && DAY.test(o.endsOn) ? o.endsOn : ''
  if (!startsOn || !endsOn) return fail('Choose a start date and a deadline.')
  if (endsOn < startsOn) return fail('The deadline must be on or after the start date.')
  if ((Date.parse(endsOn) - Date.parse(startsOn)) / 864e5 > 400) return fail('A programme can run for up to 400 days.')
  const description = typeof o.description === 'string' && o.description.trim() ? o.description.trim().slice(0, 1000) : null
  return { value: { title, description, rewardType, rewardDetail, unitValue, budget, scope, eligibleRoles: scope === 'person' ? eligibleRoles : ['sales_exec', 'team_lead'], eligibleTeamIds, goalKind, metric, goalAmount, topN, maxWinners, startsOn, endsOn }, error: null }
}

/** How many rewards the budget pays for (null = no limit from the budget). */
export function budgetSeats(p: Pick<ProgramInput, 'budget' | 'unitValue'>): number | null {
  if (p.budget === null || p.unitValue <= 0) return null
  return Math.floor(p.budget / p.unitValue)
}

/** "Reach 5 deals closed between 1 Dec and 31 Dec" / "Top 3 by revenue…". */
export function goalText(p: Pick<ProgramInput, 'goalKind' | 'metric' | 'goalAmount' | 'topN'>): string {
  const m = REWARD_METRICS[p.metric]
  if (p.goalKind === 'top') return `Top ${p.topN} by ${m.label.toLowerCase()}`
  return p.metric === 'revenue' ? `Reach ₹${(p.goalAmount ?? 0).toLocaleString('en-IN')} of revenue` : `Reach ${(p.goalAmount ?? 0).toLocaleString('en-IN')} ${m.unit === 'XP' ? 'XP' : m.label.toLowerCase()}`
}
