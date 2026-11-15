// lib/dal/subscriptions.ts
// Production X: Subscription & Seat Entitlement Engine
import { createServiceClient } from '@/lib/supabase/server'

export type PlanTier = 'free' | 'starter' | 'growth' | 'enterprise' | 'custom'

export interface PlanConfig {
  tier: PlanTier
  name: string
  defaultIncludedSeats: number
  description: string
  features: string[]
}

export const PLAN_CONFIGS: Record<PlanTier, PlanConfig> = {
  free: {
    tier: 'free',
    name: 'Free Starter',
    defaultIncludedSeats: 3,
    description: 'Basic workspace for pilot evaluation and initial project setup.',
    features: ['Up to 3 team members', 'Single project', 'Manual lead entry', 'Standard CRM'],
  },
  starter: {
    tier: 'starter',
    name: 'Growth Starter',
    defaultIncludedSeats: 5,
    description: 'Essential platform capabilities for boutique property developers and local agencies.',
    features: ['Up to 5 team members', '3 active projects', 'Website enquiries', 'Deals pipeline'],
  },
  growth: {
    tier: 'growth',
    name: 'Enterprise Growth',
    defaultIncludedSeats: 15,
    description: 'Complete sales acceleration suite with marketing integrations and automation.',
    features: ['Up to 15 team members', 'Unlimited projects', 'Meta & Google Ads integrations', 'WhatsApp Business'],
  },
  enterprise: {
    tier: 'enterprise',
    name: 'Full Scale Enterprise',
    defaultIncludedSeats: 50,
    description: 'Comprehensive multi-tower inventory, broker syndication, and custom developer APIs.',
    features: ['Up to 50 team members', 'Developer REST APIs', 'Custom webhooks', 'Dedicated onboarding'],
  },
  custom: {
    tier: 'custom',
    name: 'Custom Enterprise Agreement',
    defaultIncludedSeats: 100,
    description: 'Tailored institutional deployment with dedicated infrastructure and unlimited scale.',
    features: ['Custom seat allocation', 'Full ERP integration', 'Custom SLA', 'Dedicated account manager'],
  },
}

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
