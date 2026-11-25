// lib/settings/catalog.ts — every settings page in one list, grouped the way people look for them ("You", "Your
// company"…). Used by the settings hub, its sidebar and its search. It only decides what is SHOWN to a role; every
// page and API authorises again on the server.
import type { MemberRole } from '@/types/database'

export type SettingsAudience = 'everyone' | 'managers' | 'admins'

export interface SettingsPage {
  key: string
  label: string
  description: string
  /** Path after /{orgSlug}; absolute paths (starting with //) are outside the workspace. */
  path: string
  audience: SettingsAudience
  /** Extra words people search for. */
  keywords: string[]
  /** Only for these kinds of workspace (e.g. agency-only listings); omitted = every workspace. */
  orgTypes?: ('developer' | 'channel_partner')[]
}

export interface SettingsGroup {
  key: string
  title: string
  description: string
  pages: SettingsPage[]
}

export const SETTINGS: SettingsGroup[] = [
  {
    key: 'you', title: 'You', description: 'Your own profile, appearance, sign-in and alerts. Only you.',
    pages: [
      { key: 'profile', label: 'Profile & preferences', description: 'Name, phone and how REGrow looks for you.', path: '/settings/profile', audience: 'everyone', keywords: ['name', 'phone', 'theme', 'dark mode', 'appearance'] },
      { key: 'security', label: 'Sign-in & security', description: 'Password, two-step verification and signed-in devices.', path: '/settings/security', audience: 'everyone', keywords: ['password', 'mfa', '2fa', 'otp', 'sessions', 'sign out'] },
      { key: 'notifications', label: 'My notifications', description: 'Which alerts reach your devices, quiet hours, daily and weekly e-mails.', path: '/settings/notifications', audience: 'everyone', keywords: ['email', 'push', 'alerts', 'daily report', 'digest', 'weekly', 'quiet hours', 'do not disturb', 'mute'] },
    ],
  },
  {
    key: 'company', title: 'Your company', description: 'Organisation details, letterhead, plan and billing.',
    pages: [
      { key: 'business', label: 'Business details', description: 'Letterhead, GSTIN, RERA, signatory and bank account on documents.', path: '/settings/business', audience: 'admins', keywords: ['letterhead', 'gstin', 'pan', 'rera', 'bank', 'ifsc', 'logo', 'address', 'signatory'] },
      { key: 'organization', label: 'Organisation', description: 'Name, type of business and workspace address.', path: '/settings/organization', audience: 'admins', keywords: ['company', 'developer', 'channel partner', 'business type'] },
      { key: 'billing', label: 'Plan & billing', description: 'Your plan, seats, invoices and payments.', path: '/billing', audience: 'admins', keywords: ['invoice', 'subscription', 'seats', 'payment', 'gst'] },
      { key: 'report-settings', label: 'Report settings', description: 'When your financial year and week start, for report periods.', path: '/settings/reports', audience: 'admins', keywords: ['financial year', 'fiscal year', 'fy', 'quarter', 'week', 'april', 'reports'] },
      { key: 'archive', label: 'Archive', description: 'Deleted leads, kept for 30 days — restore anything deleted by mistake.', path: '/settings/archive', audience: 'admins', keywords: ['deleted', 'restore', 'undo', 'recycle bin', 'trash'] },
      { key: 'audit', label: 'Audit log', description: 'Who changed what in the workspace.', path: '/audit-log', audience: 'admins', keywords: ['history', 'activity', 'log'] },
      { key: 'support', label: 'Support access', description: 'Let REGrow support look at your workspace for a limited time.', path: '/support-access', audience: 'admins', keywords: ['help', 'grant', 'support'] },
    ],
  },
  {
    key: 'team', title: 'Your team', description: 'Who is on the team and what each person can do.',
    pages: [
      { key: 'team', label: 'Team members & roles', description: 'Invite people, change roles, last sign-in, reset e-mails, monthly targets.', path: '/team', audience: 'managers', keywords: ['invite', 'users', 'roles', 'permissions', 'deactivate', 'seats'] },
      { key: 'sales-structure', label: 'Sales structure', description: 'Whether the owner also sells, and teams with their own leaders, projects and leaderboards.', path: '/settings/sales', audience: 'admins', keywords: ['owner', 'teams', 'team structure', 'sales team', 'manager', 'leaderboard', 'who gets leads', 'squads'] },
      { key: 'teams', label: 'Teams', description: 'Teams with a leader, their people and their projects; team-wise performance and leaderboards.', path: '/teams', audience: 'managers', keywords: ['teams', 'squads', 'team lead', 'leader', 'project team', 'group'] },
      { key: 'roles', label: 'Roles & permissions', description: 'What each role can do, straight from the rules REGrow enforces.', path: '/settings/roles', audience: 'managers', keywords: ['permissions', 'access', 'roles', 'who can', 'rights', 'privileges'] },
      { key: 'sign-ins', label: 'Sign-in activity', description: 'When each person signed in, from which device, and whether they used two-step verification.', path: '/settings/sign-ins', audience: 'admins', keywords: ['login', 'log in', 'sign in', 'login history', 'devices', 'ip address', 'security', 'activity', 'sessions'] },
      { key: 'alert-defaults', label: 'Notification defaults', description: 'Which alerts reach the team’s devices unless they choose otherwise.', path: '/settings/alerts', audience: 'admins', keywords: ['push', 'alerts', 'notification rules', 'defaults', 'mute'] },
    ],
  },
  {
    key: 'leads', title: 'Leads and forms', description: 'How leads come in and who gets them.',
    pages: [
      { key: 'routing', label: 'Assignment rules', description: 'Who gets new leads, round robin and teams.', path: '/routing', audience: 'managers', keywords: ['routing', 'round robin', 'assignment', 'distribution'] },
      { key: 'lead-settings', label: 'Lead settings', description: 'Reasons offered when a lead is marked Lost or Junk.', path: '/settings/leads', audience: 'admins', keywords: ['lost reason', 'junk reason', 'close lead', 'disqualify', 'why lost'] },
      { key: 'fields', label: 'Fields on leads', description: 'Your own fields on every lead: dropdown lists, numbers, dates, yes/no.', path: '/settings/fields', audience: 'admins', keywords: ['custom fields', 'dropdown', 'drop-down lists', 'picklist', 'extra fields', 'purpose', 'home loan'] },
      { key: 'locations', label: 'Locations', description: 'Localities and cities offered on a buyer’s requirements.', path: '/settings/locations', audience: 'admins', keywords: ['locality', 'area', 'city', 'micro-market', 'location list'] },
      { key: 'routing-log', label: 'Assignment log', description: 'Every routing decision: who got each lead, and where leads fell through.', path: '/routing/log', audience: 'managers', keywords: ['routing log', 'assignment history', 'round robin', 'nobody available', 'logs'] },
      { key: 'whatsapp-auto-replies', label: 'WhatsApp auto-replies', description: 'A welcome message for new enquiries and an away message outside business hours.', path: '/settings/whatsapp', audience: 'admins', keywords: ['whatsapp', 'auto reply', 'autoreply', 'welcome message', 'away message', 'business hours', 'out of office', 'automation'] },
      { key: 'visit-settings', label: 'Site visits', description: 'Buyer confirmations and reminders, check-in distance, visits per person per day.', path: '/settings/visits', audience: 'admins', keywords: ['site visit', 'reminder', 'confirmation', 'check-in', 'gps', 'limit', 'calendar'] },
      { key: 'speed', label: 'Response targets', description: 'How fast new leads should be called.', path: '/speed-to-lead', audience: 'managers', keywords: ['sla', 'speed to lead', 'first call'] },
    ],
  },
  {
    key: 'properties', title: 'Properties and deals', description: 'Projects, inventory and documents for buyers.',
    pages: [
      { key: 'projects', label: 'Projects', description: 'Your projects and their RERA details.', path: '/projects', audience: 'managers', keywords: ['rera', 'project'] },
      { key: 'inventory-settings', label: 'Inventory settings', description: 'Release units on hold automatically, and the area units new units start with.', path: '/settings/inventory', audience: 'admins', keywords: ['hold', 'on hold', 'block', 'release', 'expiry', 'units', 'area', 'sq ft', 'sq yd', 'acres', 'guntas', 'cents'] },
      { key: 'matching', label: 'Matching rules', description: 'How strictly units are matched to buyers: budget margin, weak matches, suggestions.', path: '/settings/matching', audience: 'admins', keywords: ['matching', 'property matching', 'budget', 'suggestions', 'interested buyers'] },
      { key: 'listing-share', label: 'Listing share message', description: 'The WhatsApp message agents send with a resale or rental listing.', path: '/settings/listings', audience: 'admins', keywords: ['listing', 'share', 'whatsapp', 'resale', 'rental', 'template', 'message'], orgTypes: ['channel_partner'] },
      { key: 'documents', label: 'Document templates', description: 'Cost sheets, quotations and letters on your letterhead.', path: '/documents', audience: 'managers', keywords: ['cost sheet', 'quotation', 'allotment', 'demand letter', 'letterhead'] },
    ],
  },
  {
    key: 'apps', title: 'Connected apps', description: 'Other tools you connect, and where your leads come from.',
    pages: [
      { key: 'integrations', label: 'Integrations', description: 'Meta lead ads, WhatsApp, Google, property portals and website forms.', path: '/integrations', audience: 'admins', keywords: ['facebook', 'meta', 'whatsapp', 'google', '99acres', 'magicbricks', 'housing', 'api', 'webhook'] },
    ],
  },
]

const RANK: Record<MemberRole, number> = { owner: 3, admin: 3, manager: 2, team_lead: 1, sales_exec: 1, post_sales: 1, readonly: 1 }
const NEEDS: Record<SettingsAudience, number> = { everyone: 1, managers: 2, admins: 3 }

/** The groups and pages this role may see (in this kind of workspace); empty groups are dropped. */
export function settingsFor(role: MemberRole, orgType?: 'developer' | 'channel_partner'): SettingsGroup[] {
  return SETTINGS
    .map((g) => ({ ...g, pages: g.pages.filter((p) => RANK[role] >= NEEDS[p.audience] && (!p.orgTypes || !orgType || p.orgTypes.includes(orgType))) }))
    .filter((g) => g.pages.length > 0)
}

/** Case-insensitive search over labels, descriptions and keywords; every word must match. */
export function searchSettings(groups: SettingsGroup[], query: string): (SettingsPage & { group: string })[] {
  const words = query.toLowerCase().split(/\s+/).filter(Boolean)
  if (!words.length) return []
  return groups.flatMap((g) => g.pages.map((p) => ({ ...p, group: g.title })))
    .filter((p) => {
      const hay = [p.label, p.description, p.group, ...p.keywords].join(' ').toLowerCase()
      return words.every((w) => hay.includes(w))
    })
}
