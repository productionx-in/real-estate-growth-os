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

/** Who is signing in, as chosen on the sign-in page. Only a preference: access always comes from memberships and roles. */
export type SignInAudience = 'developer' | 'agency' | 'staff'
export const AUDIENCES: { id: SignInAudience; label: string; hint: string }[] = [
  { id: 'developer', label: 'Developer / builder', hint: 'Your projects, inventory, sales team and partner agencies' },
  { id: 'agency', label: 'Channel partner agency', hint: 'Your buyers, your team and the developers you work with' },
  { id: 'staff', label: 'REGrow team', hint: 'Internal console for REGrow staff (authenticator app required)' },
]
/** Entry points shown on the public sign-in page. Staff sign in through an unlisted address. */
export const PUBLIC_AUDIENCES = AUDIENCES.filter((a) => a.id !== 'staff')
export const parseAudience = (v: string | null | undefined): SignInAudience => (v === 'agency' || v === 'staff' ? v : 'developer')
/** Where to go after sign-in for an audience, unless a safe redirect was requested. */
export const audienceHome = (a: SignInAudience) => (a === 'staff' ? '/platform' : `/select-org?type=${a === 'agency' ? 'channel_partner' : 'developer'}`)

/**
 * Where to send someone who reaches /select-org. A destination from the URL is used only when it is a safe
 * same-origin path inside a workspace they belong to; otherwise one workspace → open it, several → the only one of
 * the type they signed in as (if exactly one), else let them choose.
 */
export function resolveWorkspaceDestination(workspaces: WorkspaceChoice[], rawNext: string | null | undefined, preferredType?: OrgType | null):
  { kind: 'redirect'; to: string } | { kind: 'choose' } | { kind: 'none' } {
  if (workspaces.length === 0) return { kind: 'none' }
  const next = rawNext ? safeRedirectPath(rawNext, '') : ''
  if (next) {
    const slug = next.split(/[/?#]/)[1] ?? ''
    if (workspaces.some((w) => w.slug === slug)) return { kind: 'redirect', to: next }
  }
  if (workspaces.length === 1) return { kind: 'redirect', to: `/${workspaces[0].slug}` }
  const ofType = preferredType ? workspaces.filter((w) => w.type === preferredType) : []
  if (ofType.length === 1) return { kind: 'redirect', to: `/${ofType[0].slug}` }
  return { kind: 'choose' }
}
