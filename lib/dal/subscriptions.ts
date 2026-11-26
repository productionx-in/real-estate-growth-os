// lib/dal/subscriptions.ts
// RE: Subscription & Seat Entitlement Engine
import { createServiceClient } from '@/lib/supabase/server'
import { PLAN_CONFIGS, type PlanTier, type PlanConfig } from '@/lib/subscriptions/config'

export { PLAN_CONFIGS, type PlanTier, type PlanConfig }

export interface SeatUsage {
  planTier: PlanTier
  planName: string
  includedSeats: number
  additionalSeats: number
  totalSeats: number
  occupiedSeats: number
  reservedSeats: number
  availableSeats: number
  isLimitReached: boolean
  subscriptionStatus: 'trial' | 'active' | 'past_due' | 'canceled' | 'expired'
  billingCycle: 'monthly' | 'annual'
  currentPeriodEnd: string
}

export async function getSubscriptionAndSeatUsage(orgId: string): Promise<SeatUsage> {
  const service = createServiceClient()

  // 1. Fetch organization details
  const { data: org } = await service
    .from('organisations')
    .select('id, plan')
    .eq('id', orgId)
    .single()

  const orgPlanTier = (org?.plan as PlanTier) || 'growth'
  const planConfig = PLAN_CONFIGS[orgPlanTier] || PLAN_CONFIGS.growth

  // 2. Fetch subscription record if exists
  const { data: subscription } = await service
    .from('org_subscriptions')
    .select('*')
    .eq('org_id', orgId)
    .maybeSingle()

  const includedSeats = subscription?.included_seats ?? planConfig.defaultIncludedSeats
  const additionalSeats = subscription?.additional_seats ?? 0
  const totalSeats = includedSeats + additionalSeats
  const subscriptionStatus = (subscription?.status as SeatUsage['subscriptionStatus']) ?? 'active'
  const billingCycle = (subscription?.billing_cycle as SeatUsage['billingCycle']) ?? 'monthly'
  const currentPeriodEnd = subscription?.current_period_end ?? new Date(Date.now() + 30 * 86400000).toISOString()

  // 3. Count occupied seats (active members)
  const { count: occupiedCount } = await service
    .from('org_members')
    .select('*', { count: 'exact', head: true })
    .eq('org_id', orgId)
    .eq('status', 'active')

  // 4. Count reserved seats (pending invitations that haven't expired)
  const { count: reservedCount } = await service
    .from('org_invitations')
    .select('*', { count: 'exact', head: true })
    .eq('org_id', orgId)
    .eq('status', 'pending')
    .gt('expires_at', new Date().toISOString())

  const occupiedSeats = occupiedCount ?? 0
  const reservedSeats = reservedCount ?? 0
  const availableSeats = Math.max(0, totalSeats - (occupiedSeats + reservedSeats))
  const isLimitReached = availableSeats <= 0

  return {
    planTier: orgPlanTier,
    planName: planConfig.name,
    includedSeats,
    additionalSeats,
    totalSeats,
    occupiedSeats,
    reservedSeats,
    availableSeats,
    isLimitReached,
    subscriptionStatus,
    billingCycle,
    currentPeriodEnd,
  }
}
