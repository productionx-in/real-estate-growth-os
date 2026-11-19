// lib/payments/registry.ts — which provider adapters exist in this deployment, and which one takes new checkouts.
//
// Credentials come only from server environment variables (never the database, never the browser):
//   Razorpay: RAZORPAY_KEY_ID, RAZORPAY_KEY_SECRET, RAZORPAY_WEBHOOK_SECRET   (environment from the key prefix)
//   Cashfree: CASHFREE_APP_ID, CASHFREE_SECRET_KEY, CASHFREE_ENVIRONMENT=sandbox|production
// The deployment's payment environment is PAYMENTS_ENVIRONMENT (test|live). An adapter whose keys belong to the other
// environment is refused, so test keys can never take live payments and live keys never run in a test deployment.
// The primary provider is chosen by the Platform Owner in the database (payment_gateway_configs); there is no
// automatic failover: if the primary is unavailable, online payment is unavailable.
import type { SupabaseClient } from '@supabase/supabase-js'
import { razorpayConfig } from '@/lib/billing/razorpay'
import { cashfreeAdapter, cashfreeConfig } from './cashfree/adapter'
import { razorpayAdapter } from './razorpay/adapter'
import type { PaymentEnvironment, ProviderAdapter, ProviderCode } from './types'

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export type Db = SupabaseClient<any, 'public', any>

export function deploymentEnvironment(env: Record<string, string | undefined> = process.env): PaymentEnvironment {
  const v = env.PAYMENTS_ENVIRONMENT?.trim()
  if (v === 'live' || v === 'test') return v
  // Not set: infer from the Razorpay key (the integration that already exists), else test.
  return env.RAZORPAY_KEY_ID?.trim().startsWith('rzp_live_') ? 'live' : 'test'
}

export interface AdapterResolver {
  environment: PaymentEnvironment
  /** The adapter for a provider in this deployment's environment, or null when not configured. */
  get(code: ProviderCode, environment?: PaymentEnvironment): ProviderAdapter | null
}

export function envResolver(env: Record<string, string | undefined> = process.env, fetchImpl: typeof fetch = fetch): AdapterResolver {
  const environment = deploymentEnvironment(env)
  const cache = new Map<string, ProviderAdapter | null>()
  return {
    environment,
    get(code, wanted = environment) {
      const k = `${code}:${wanted}`
      if (!cache.has(k)) {
        let a: ProviderAdapter | null = null
        if (code === 'razorpay') { const c = razorpayConfig(env); a = c ? razorpayAdapter(c, fetchImpl) : null }
        if (code === 'cashfree') { const c = cashfreeConfig(env); a = c ? cashfreeAdapter(c, fetchImpl) : null }
        cache.set(k, a && a.environment === wanted ? a : null)
      }
      return cache.get(k) ?? null
    },
  }
}

export interface GatewayConfigRow {
  provider: ProviderCode
  environment: PaymentEnvironment
  status: 'disabled' | 'sandbox_validated' | 'enabled' | 'draining' | 'suspended'
  is_primary: boolean
}

/** The adapter that takes new checkouts now, or null (with the reason) when online payment is unavailable. */
export async function primaryAdapter(db: Db, resolver: AdapterResolver): Promise<{ adapter: ProviderAdapter } | { adapter: null; reason: string }> {
  const { data } = await db.from('payment_gateway_configs').select('provider, environment, status, is_primary')
    .eq('environment', resolver.environment).eq('is_primary', true).maybeSingle()
  const row = data as GatewayConfigRow | null
  if (!row) return { adapter: null, reason: 'No primary payment gateway is set.' }
  if (row.status !== 'enabled') return { adapter: null, reason: `The primary gateway is ${row.status}.` }
  const adapter = resolver.get(row.provider)
  if (!adapter) return { adapter: null, reason: `${row.provider} credentials are not configured for ${resolver.environment}.` }
  return { adapter }
}

/** Providers that may still verify, settle, refund and reconcile (everything except disabled). */
export async function operableAdapters(db: Db, resolver: AdapterResolver): Promise<ProviderAdapter[]> {
  const { data } = await db.from('payment_gateway_configs').select('provider, environment, status, is_primary').eq('environment', resolver.environment)
  return ((data ?? []) as GatewayConfigRow[]).filter((r) => r.status !== 'disabled').map((r) => resolver.get(r.provider)).filter((a): a is ProviderAdapter => !!a)
}
