// lib/plots/addons.ts — paid add-ons (org_addons, 20260072). Unlike modules (lib/auth/entitlements.ts: ON unless
// switched off), an add-on is OFF unless a Platform Owner has switched it on for the workspace. Every page and API
// of an add-on checks it on the server; a read error counts as OFF (fail closed: a paid feature is never given away).
import { NextResponse } from 'next/server'
import { createServiceClient } from '@/lib/supabase/server'

export const ADDONS = {
  plot_maps: {
    name: 'Interactive plot maps',
    pitch: 'Your project layouts as live, clickable maps — every plot coloured by its real status, with a link buyers can open on their phone.',
  },
} as const
export type AddonKey = keyof typeof ADDONS

/** List price pre-filled in the console for a new deal (rupees, before GST). Every deal can be changed there.
 *  Reasoning and the tiers for larger layouts: docs/commercial/PLOT_MAPS_ADDON.md. */
export const ADDON_LIST_PRICE: Record<AddonKey, { setupRupees: number; monthlyRupees: number; includedLayouts: number }> = {
  plot_maps: { setupRupees: 14_999, monthlyRupees: 2_999, includedLayouts: 1 },
}

export interface AddonTerms { enabled: boolean; setupFeePaise: number; monthlyFeePaise: number; includedLayouts: number; notes: string | null; enabledAt: string | null }
export const NO_ADDON: AddonTerms = { enabled: false, setupFeePaise: 0, monthlyFeePaise: 0, includedLayouts: 0, notes: null, enabledAt: null }

export async function getAddon(orgId: string, addon: AddonKey): Promise<AddonTerms> {
  const { data, error } = await createServiceClient().from('org_addons')
    .select('enabled, setup_fee_paise, monthly_fee_paise, included_layouts, notes, enabled_at').eq('org_id', orgId).eq('addon', addon).maybeSingle()
  if (error || !data) return NO_ADDON
  return {
    enabled: data.enabled === true, setupFeePaise: Number(data.setup_fee_paise), monthlyFeePaise: Number(data.monthly_fee_paise),
    includedLayouts: data.included_layouts, notes: data.notes, enabledAt: data.enabled_at,
  }
}

/** A 403 response when the workspace does not have the add-on, otherwise null. */
export async function requireAddon(orgId: string, addon: AddonKey): Promise<NextResponse | null> {
  if ((await getAddon(orgId, addon)).enabled) return null
  return NextResponse.json(
    { error: `${ADDONS[addon].name} is an add-on that isn’t switched on for this workspace. Contact your REGrow account manager.`, code: 'ADDON_DISABLED', addon },
    { status: 403 },
  )
}
