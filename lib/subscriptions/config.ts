// lib/subscriptions/config.ts
// RE by PX: Subscription Plans & Seat Entitlement Configurations
// Safe for both client and server imports (zero DB/server dependencies)

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
