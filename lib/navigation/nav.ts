// lib/navigation/nav.ts
// One definition of the workspace navigation, shared by the sidebar, the phone tab bar and the ⌘K palette,
// so the three can never disagree about what a role sees. This only decides which links are shown; every
// page and API still authorises on the server.
import type { MemberRole } from '@/types/database'
import { canCreateLeads } from '@/lib/auth/permissions'

export type NavKey =
  | 'home' | 'today' | 'leads' | 'visits' | 'inbox' | 'sales' | 'routing' | 'speed' | 'projects' | 'inventory'
  | 'documents' | 'analytics' | 'integrations' | 'team' | 'settings' | 'billing' | 'audit' | 'support' | 'partners' | 'help'

export interface NavLink {
  key: NavKey
  label: string
  href: string
  /** Only the exact path counts as "here" (the workspace home). */
  exact?: boolean
}

export interface NavGroup {
  /** Omitted for the first group: the everyday pages need no heading. */
  title?: string
  items: NavLink[]
}

export type OrgType = 'developer' | 'channel_partner'

/** Path segment after the workspace slug → the module that must be on for the link to show (lib/auth/entitlements.ts). */
export const MODULE_OF_SEGMENT: Record<string, string> = {
  sales: 'sales', visits: 'sales', documents: 'sales', partners: 'sales', inventory: 'inventory', routing: 'routing',
  integrations: 'integrations', analytics: 'analytics',
}

export { ROLE_LABELS } from '@/lib/auth/permissions'

const isAdmin = (role: MemberRole) => role === 'owner' || role === 'admin'

export function navGroups(orgSlug: string, role: MemberRole = 'sales_exec', orgType: OrgType = 'developer', disabledModules: string[] = []): NavGroup[] {
  const at = (path: string) => `/${orgSlug}${path}`
  const L = (key: NavKey, label: string, path: string, exact = false): NavLink => ({ key, label, href: at(path), ...(exact ? { exact } : {}) })
  const home = L('home', 'Home', '', true)
  const today = L('today', 'Today', '/today')
  const visits = L('visits', 'Site visits', '/visits')
  const inbox = L('inbox', 'WhatsApp inbox', '/inbox')
  const projects = L('projects', 'Projects', '/projects')
  const inventory = L('inventory', 'Inventory', '/inventory')
  const documents = L('documents', 'Document templates', '/documents')
  const analytics = L('analytics', 'Analytics', '/analytics')
  const team = L('team', 'Team', '/team')
  // Channel partner network: owners, admins and managers of either side (the page and API check again).
  const partners = L('partners', 'Partner network', '/partners')
  const adminLinks = [L('settings', 'Settings', '/settings'), L('billing', 'Plan & billing', '/billing'), L('audit', 'Audit log', '/audit-log'), L('support', 'Support access', '/support-access')]

  let groups: NavGroup[]
  if (role === 'readonly') {
    groups = [{ items: [home, projects, inventory, documents, analytics] }]
  } else if (role === 'sales_exec') {
    groups = [
      { items: [home, today, L('leads', 'My leads', '/leads'), visits, inbox] },
      { title: 'Selling', items: [L('sales', 'Sales', '/sales'), inventory] },
    ]
  } else if (role === 'team_lead') {
    groups = [
      { items: [home, today, L('leads', 'Team leads', '/leads'), visits, inbox] },
      { title: 'Selling', items: [L('sales', 'Sales', '/sales'), inventory] },
    ]
  } else if (role === 'post_sales') {
    groups = [
      { items: [home, L('leads', 'Booked customers', '/leads'), inbox] },
      { title: 'Customers', items: [L('sales', 'Bookings', '/sales'), documents, projects, inventory] },
    ]
  } else if (orgType === 'channel_partner') {
    groups = [
      { items: [home, today, L('leads', 'Referred leads', '/leads'), visits, inbox, L('sales', 'Deals & commissions', '/sales'), partners] },
      { title: 'Agency', items: [team, ...(isAdmin(role) ? adminLinks : [])] },
    ]
  } else if (role === 'manager') {
    groups = [
      { items: [home, today, L('leads', 'Leads', '/leads'), visits, inbox] },
      { title: 'Sales', items: [L('sales', 'Sales', '/sales'), partners, L('routing', 'Lead routing', '/routing'), L('speed', 'Speed to lead', '/speed-to-lead')] },
      { title: 'Portfolio', items: [projects, inventory, documents] },
      { title: 'Insights', items: [analytics, team] },
    ]
  } else {
    groups = [
      { items: [home, today, L('leads', 'Leads', '/leads'), visits, inbox] },
      { title: 'Sales', items: [L('sales', 'Sales & partners', '/sales'), partners, L('routing', 'Lead routing', '/routing'), L('speed', 'Speed to lead', '/speed-to-lead')] },
      { title: 'Portfolio', items: [projects, inventory, documents] },
      { title: 'Insights', items: [analytics] },
      { title: 'Workspace', items: [L('integrations', 'Integrations', '/integrations'), team, ...adminLinks] },
    ]
  }

  // Everyone can reach REGrow support from their workspace (cases they open; owners and admins see all of the org's).
  groups[groups.length - 1].items.push(L('help', 'Help & support', '/help'))

  return groups
    .map((g) => ({
      ...g,
      items: g.items.filter((i) => {
        const mod = MODULE_OF_SEGMENT[i.href.split('/')[2] ?? '']
        return !mod || !disabledModules.includes(mod)
      }),
    }))
    .filter((g) => g.items.length > 0)
}

/** Is this link the page being viewed? The longest matching link wins, so /leads/new lights up Leads only. */
export function isActiveLink(link: NavLink, pathname: string): boolean {
  if (link.exact) return pathname === link.href
  return pathname === link.href || pathname.startsWith(`${link.href}/`)
}

/** Phone tab bar: at most four destinations (plus "More", which opens the full menu), in this order of use. */
const TAB_PRIORITY: NavKey[] = ['home', 'today', 'leads', 'inbox', 'visits', 'projects', 'inventory', 'analytics']

export function tabLinks(groups: NavGroup[]): NavLink[] {
  const all = groups.flatMap((g) => g.items)
  return TAB_PRIORITY.map((k) => all.find((i) => i.key === k)).filter((i): i is NavLink => !!i).slice(0, 4)
}

/** Short labels for the tab bar (the full label is the accessible name). */
export const TAB_LABELS: Partial<Record<NavKey, string>> = { leads: 'Leads', inbox: 'Inbox', visits: 'Visits' }

/** Who may add a lead by hand (mirrors the check on /leads/new and POST /api/leads). */
export const canCreateLead = (role: MemberRole) => canCreateLeads(role)
