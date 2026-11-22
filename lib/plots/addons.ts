// lib/plots/addons.ts — paid add-ons activated per developer PROJECT (project_addons, 20260080).
// Unlike modules (lib/auth/entitlements.ts: ON unless switched off), an add-on is OFF unless a Platform Owner has
// activated it for the project. States: not_purchased (no row), pending (requested or prepared), active, suspended,
// expired (active but past valid_until — derived, exactly as public.project_addon_state() derives it in SQL).
// Every page and API of an add-on checks it on the server; a read error counts as not purchased (fail closed).
// The database re-checks on every write that creates, changes, publishes or shares a map.
import { NextResponse } from 'next/server'
import { createServiceClient } from '@/lib/supabase/server'

import { PROJECT_ADDON_COLUMNS, NO_PROJECT_ADDON, toProjectAddon, ADDONS, STATE_INFO, type AddonKey, type ProjectAddon, type ProjectAddonRow } from '@/lib/plots/addon-states'
export * from '@/lib/plots/addon-states'

type Row = ProjectAddonRow

export async function getProjectAddon(orgId: string, projectId: string, addon: AddonKey): Promise<ProjectAddon> {
  const { data, error } = await createServiceClient().from('project_addons')
    .select(PROJECT_ADDON_COLUMNS).eq('org_id', orgId).eq('project_id', projectId).eq('addon', addon).maybeSingle()
  if (error || !data) return NO_PROJECT_ADDON
  return toProjectAddon(data as Row)
}

/** Every project of a workspace that has a row for the add-on (others are not purchased). */
export async function listProjectAddons(orgId: string, addon: AddonKey): Promise<Map<string, ProjectAddon>> {
  const { data } = await createServiceClient().from('project_addons').select(PROJECT_ADDON_COLUMNS).eq('org_id', orgId).eq('addon', addon)
  return new Map(((data ?? []) as Row[]).map((r) => [r.project_id, toProjectAddon(r)]))
}

/** A 403 response unless the project's add-on is active, otherwise null. */
export async function requireProjectAddon(orgId: string, projectId: string, addon: AddonKey): Promise<NextResponse | null> {
  const a = await getProjectAddon(orgId, projectId, addon)
  if (a.state === 'active') return null
  return NextResponse.json(
    { error: `${ADDONS[addon].name}: ${STATE_INFO[a.state].customer}`, code: 'ADDON_NOT_ACTIVE', addon, state: a.state },
    { status: 403 },
  )
}
