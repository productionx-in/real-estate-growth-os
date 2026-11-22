// lib/dal/workspace-settings.ts — read and save workspace settings (org_settings, 20260074). Reads are for anyone in
// the workspace (the caller has already resolved the workspace); saving is owners and admins only — the API authorises.
import { createServiceClient } from '@/lib/supabase/server'
import { DEFAULT_SETTINGS, settingsFromRow, type SettingsSection, type WorkspaceSettings } from '@/lib/settings/workspace'

// org_settings is not in the generated types yet.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const table = () => (createServiceClient() as unknown as { from: (t: string) => any }).from('org_settings')

export async function getWorkspaceSettings(orgId: string): Promise<WorkspaceSettings> {
  const { data, error } = await table().select('leads, inventory, reports, lists, fields, notifications').eq('org_id', orgId).maybeSingle()
  if (error) return DEFAULT_SETTINGS
  return settingsFromRow(data)
}

/** Saves one section. The value must already be normalised (normaliseSection). */
export async function saveWorkspaceSection<S extends SettingsSection>(orgId: string, actorId: string, section: S, value: WorkspaceSettings[S]): Promise<boolean> {
  const { error } = await table().upsert(
    { org_id: orgId, [section]: value, updated_by: actorId, updated_at: new Date().toISOString() },
    { onConflict: 'org_id' },
  )
  return !error
}
