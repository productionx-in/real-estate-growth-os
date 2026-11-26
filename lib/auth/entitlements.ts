// lib/auth/entitlements.ts
// Per-customer module switches (migration 20260047). A module with no row is ON.
// Every API route of a module calls requireModule() after authorising the caller; pages use getModules().
// tests/entitlements-guard.test.mjs checks that every module route does.
import { NextResponse } from 'next/server'
import { createServiceClient } from '@/lib/supabase/server'

export const MODULES = {
  projects: 'Projects',
  inventory: 'Inventory',
  sales: 'Sales pipeline',
  visits: 'Site visits',
  partners: 'Channel partners',
  documents: 'Documents',
  campaigns: 'Campaigns',
  whatsapp: 'WhatsApp inbox',
  routing: 'Lead routing',
  integrations: 'Integrations',
  analytics: 'Analytics & reports',
  performance: 'Performance & rewards',
} as const
export type ModuleKey = keyof typeof MODULES
export type ModuleMap = Record<ModuleKey, boolean>

export const ALL_ON = Object.fromEntries(Object.keys(MODULES).map((k) => [k, true])) as ModuleMap

export function resolveModules(rows: { module: string; enabled: boolean }[]): ModuleMap {
  const map = { ...ALL_ON }
  for (const r of rows) if (r.module in map) map[r.module as ModuleKey] = r.enabled
  return map
}

export async function getModules(orgId: string): Promise<ModuleMap> {
  const service = createServiceClient()
  const { data, error } = await service.from('org_module_entitlements').select('module, enabled').eq('org_id', orgId)
  if (error) {
    // Fail closed only for modules we know are off; on a read error keep the customer working.
    console.error('entitlements read failed:', error.message)
    return { ...ALL_ON }
  }
  return resolveModules(data ?? [])
}

/** Returns a 403 response when the module is switched off for this organisation, otherwise null. */
export async function requireModule(orgId: string, module: ModuleKey): Promise<NextResponse | null> {
  const modules = await getModules(orgId)
  if (modules[module]) return null
  return NextResponse.json(
    { error: `${MODULES[module]} is not included in this workspace’s plan. Contact your RE by PX account manager.`, code: 'MODULE_DISABLED', module },
    { status: 403 }
  )
}
