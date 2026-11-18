// lib/workspace/select.ts — choosing a workspace after sign-in. Pure rules (no server imports), used by
// /select-org and tested in tests/workspace-select.test.mjs. Membership itself is always resolved on the server.
import { safeRedirectPath } from '@/lib/auth/safe-redirect'

export type OrgType = 'developer' | 'channel_partner'

export const ORG_TYPE_LABEL: Record<OrgType, string> = { developer: 'Developer', channel_partner: 'Channel partner agency' }
export const ORG_TYPE_HINT: Record<OrgType, string> = {
  developer: 'Projects, inventory, sales team and partner agencies',
  channel_partner: 'Your own buyers, your team, and the developers you work with',
}

export interface WorkspaceChoice { slug: string; name: string; type: OrgType; role: string }

/**
 * Where to send someone who reaches /select-org. A destination from the URL is used only when it is a safe
 * same-origin path inside a workspace they belong to; otherwise one workspace → open it, several → let them choose.
 */
export function resolveWorkspaceDestination(workspaces: WorkspaceChoice[], rawNext: string | null | undefined):
  { kind: 'redirect'; to: string } | { kind: 'choose' } | { kind: 'none' } {
  if (workspaces.length === 0) return { kind: 'none' }
  const next = rawNext ? safeRedirectPath(rawNext, '') : ''
  if (next) {
    const slug = next.split(/[/?#]/)[1] ?? ''
    if (workspaces.some((w) => w.slug === slug)) return { kind: 'redirect', to: next }
  }
  if (workspaces.length === 1) return { kind: 'redirect', to: `/${workspaces[0].slug}` }
  return { kind: 'choose' }
}
