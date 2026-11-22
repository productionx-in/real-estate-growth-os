// lib/auth/capabilities.ts — the "Roles & permissions" grid (Your team → Roles & permissions). Every row is
// computed from the same functions the server uses to authorise (lib/auth/permissions.ts and the isAdmin /
// isManager rules of lib/dal/workspace.ts), so the grid cannot drift from what REGrow actually allows.
import type { MemberRole } from '@/types/database'
import {
  ASSIGNABLE_ROLES, MEMBER_ROLES, canAssignLeads, canCreateLeads, canManageChannelPartners, canManageRouting,
  canWriteSales, isManagement, leadScopeOf,
} from '@/lib/auth/permissions'

export type Cell = { level: 'yes' | 'partial' | 'no'; note?: string }
export interface CapabilityRow { group: string; label: string; cells: Record<MemberRole, Cell> }

const isAdminRole = (r: MemberRole) => r === 'owner' || r === 'admin'
const yes = (note?: string): Cell => ({ level: 'yes', note })
const partial = (note: string): Cell => ({ level: 'partial', note })
const no: Cell = { level: 'no' }

const SCOPE_NOTE = { all: 'All leads', team: 'Their team’s', own: 'Their own', booked: 'Booked customers' } as const

function row(group: string, label: string, f: (r: MemberRole) => Cell): CapabilityRow {
  return { group, label, cells: Object.fromEntries(MEMBER_ROLES.map((r) => [r, f(r)])) as Record<MemberRole, Cell> }
}

export const CAPABILITIES: CapabilityRow[] = [
  row('Leads', 'See leads', (r) => { const s = leadScopeOf(r); return s === 'all' ? yes(SCOPE_NOTE.all) : partial(SCOPE_NOTE[s]) }),
  row('Leads', 'Work leads (calls, notes, follow-ups, documents)', (r) => {
    if (!canWriteSales(r)) return no
    const s = leadScopeOf(r); return s === 'all' ? yes(SCOPE_NOTE.all) : partial(SCOPE_NOTE[s])
  }),
  row('Leads', 'Add leads by hand', (r) => (canCreateLeads(r) ? yes() : no)),
  row('Leads', 'Receive new leads', (r) => (ASSIGNABLE_ROLES.includes(r) ? yes() : no)),
  row('Leads', 'Assign and reassign leads', (r) => (!canAssignLeads(r) ? no : r === 'team_lead' ? partial('Within their team') : yes())),
  row('Leads', 'Delete leads (to the Archive)', (r) => (isAdminRole(r) ? yes() : no)),
  row('Sales', 'Routing rules and speed-to-lead', (r) => (canManageRouting(r) ? yes() : no)),
  row('Sales', 'Channel partners', (r) => (canManageChannelPartners(r) ? yes() : no)),
  row('Sales', 'Team-wide analytics', (r) => (leadScopeOf(r) === 'all' ? yes() : no)),
  row('Properties', 'Add and edit projects and units', (r) => (isManagement(r) ? yes() : no)),
  row('Properties', 'Delete projects and units', (r) => (isAdminRole(r) ? yes() : no)),
  row('Team', 'See the team page and set targets', (r) => (isManagement(r) ? yes() : no)),
  row('Team', 'Invite people, change roles, deactivate', (r) => (isAdminRole(r) ? (r === 'owner' ? yes() : partial('Not owners')) : no)),
  row('Workspace', 'Workspace settings, integrations, audit log', (r) => (isAdminRole(r) ? yes() : no)),
  row('Workspace', 'Plan and billing', (r) => (isAdminRole(r) ? yes() : no)),
]
