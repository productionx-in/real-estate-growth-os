// lib/marketing/capabilities.ts — the capability register: every product capability the public website may mention,
// with its honest status. Public pages refer to capabilities by id; tests fail if a page names an unknown id or
// presents a capability as more available than its status allows. Change a status here first, then the copy.
//
// Status meanings (internal):
//   in_production      built, released and used by customers in production
//   available          built and released; not yet evidenced by production usage
//   needs_setup        built; works only after the customer connects their own third-party account / gets API access
//   partial            part of the workflow exists; the page must describe only that part
//   planned            not built; may be mentioned only as planned
//   not_available      not built and not planned; must not be implied
// Evidence (19 Nov 2026, read-only production check): 16 projects and 98 inventory units across customer workspaces;
// 26 leads; no lead has yet arrived through a third-party integration; no online payment has been taken.

export type CapabilityStatus = 'in_production' | 'available' | 'needs_setup' | 'partial' | 'planned' | 'not_available'

export interface Capability {
  id: string
  name: string
  status: CapabilityStatus
  /** What the public site may say about it. */
  summary: string
  /** Shown to the visitor when the status needs qualifying. */
  publicNote?: string
}

const SETUP_NOTE = 'Needs your own account connected; we set it up with you.'

export const CAPABILITIES = {
  // Leads and CRM
  lead_inbox: { id: 'lead_inbox', name: 'Unified lead inbox', status: 'in_production', summary: 'Every enquiry from every connected source in one list, with duplicates matched on phone number.' },
  website_forms: { id: 'website_forms', name: 'Website forms and embed', status: 'available', summary: 'Enquiry forms for your website and project pages, protected against spam.' },
  csv_import: { id: 'csv_import', name: 'CSV and Excel import', status: 'in_production', summary: 'Import leads from a CSV or Excel export with field mapping and duplicate checks.' },
  api_webhooks: { id: 'api_webhooks', name: 'Lead API and webhooks', status: 'available', summary: 'Send leads from any system through a documented API or inbound webhook.' },
  meta_leads: { id: 'meta_leads', name: 'Meta lead ads', status: 'needs_setup', summary: 'Leads from Facebook and Instagram lead forms arrive in RE as they are submitted.', publicNote: SETUP_NOTE },
  google_leads: { id: 'google_leads', name: 'Google Ads lead forms', status: 'needs_setup', summary: 'Leads from Google Ads lead form extensions arrive in RE.', publicNote: SETUP_NOTE },
  portal_leads: { id: 'portal_leads', name: 'Property portal leads', status: 'needs_setup', summary: 'Leads from property portals such as 99acres, MagicBricks and Housing.com.', publicNote: 'Needs API access granted by the portal to your account; availability depends on the portal.' },
  whatsapp: { id: 'whatsapp', name: 'WhatsApp Business', status: 'needs_setup', summary: 'Buyer conversations and lead alerts over the WhatsApp Business Platform.', publicNote: 'Needs your WhatsApp Business account connected; message charges apply per Meta’s pricing.' },
  lead_stages: { id: 'lead_stages', name: 'Lead stages and pipeline', status: 'in_production', summary: 'Every lead moves through clear stages from new to booked or lost, with history.' },
  lead_tags_merge: { id: 'lead_tags_merge', name: 'Tags and duplicate merge', status: 'available', summary: 'Tag leads, and merge duplicates with full history kept.' },
  lead_requirements: { id: 'lead_requirements', name: 'Buyer requirements and matching', status: 'available', summary: 'Record budget, configuration and location preferences and see matching available units.' },
  documents: { id: 'documents', name: 'Document templates', status: 'available', summary: 'Generate cost sheets and other documents from templates.' },
  // Sales operations
  routing_rules: { id: 'routing_rules', name: 'Routing rules', status: 'in_production', summary: 'Readable rules send each lead to the right team by project, source or campaign.' },
  rotation: { id: 'rotation', name: 'Fair rotation', status: 'in_production', summary: 'Round-robin with lead share, daily caps and on-duty status for each salesperson.' },
  returning_buyer: { id: 'returning_buyer', name: 'Returning buyers', status: 'available', summary: 'A buyer who enquires again goes back to the salesperson who already knows them.' },
  assignment_alerts: { id: 'assignment_alerts', name: 'Assignment alerts', status: 'available', summary: 'In-app and push notifications the moment a lead is assigned.' },
  follow_ups: { id: 'follow_ups', name: 'Follow-up reminders and escalation', status: 'available', summary: 'Follow-up tasks with reminders; a lead not contacted in time is escalated to a manager.' },
  speed_to_lead: { id: 'speed_to_lead', name: 'Speed-to-lead reporting', status: 'available', summary: 'How quickly each lead was received, assigned and first contacted — by team and salesperson.' },
  roles: { id: 'roles', name: 'Roles and visibility', status: 'in_production', summary: 'Owners, admins, managers, team leads and salespeople each see what they should.' },
  teams: { id: 'teams', name: 'Teams', status: 'in_production', summary: 'Organise salespeople into teams per project or function.' },
  mobile_app: { id: 'mobile_app', name: 'Mobile web app', status: 'available', summary: 'Works on any phone browser and installs to the home screen, with push notifications.' },
  // Projects and inventory
  projects: { id: 'projects', name: 'Projects', status: 'in_production', summary: 'Projects with category, RERA number, approvals, dates, amenities and specifications.' },
  hierarchy: { id: 'hierarchy', name: 'Project structure', status: 'in_production', summary: 'Phases, towers, blocks, floors and other levels, arranged to match the real project.' },
  units: { id: 'units', name: 'Unit inventory', status: 'in_production', summary: 'Every unit with configuration, areas, facing, floor, parking and price.' },
  inventory_status: { id: 'inventory_status', name: 'Availability status', status: 'in_production', summary: 'Available, on hold, blocked, booked and sold — changed through controlled transitions.' },
  inventory_history: { id: 'inventory_history', name: 'Inventory audit history', status: 'available', summary: 'Every status change recorded with who changed it and when.' },
  inventory_import: { id: 'inventory_import', name: 'Bulk inventory import', status: 'available', summary: 'Load hundreds of units from a sheet, validated before anything is saved.' },
  inventory_views: { id: 'inventory_views', name: 'Inventory table and visual view', status: 'available', summary: 'Filterable table and a visual floor-by-floor view of availability.' },
  unit_blocking: { id: 'unit_blocking', name: 'Unit holds (blocking)', status: 'available', summary: 'Hold a unit for a buyer with a token amount and an expiry, then convert it to a booking.' },
  bookings: { id: 'bookings', name: 'Bookings', status: 'available', summary: 'Record bookings against units, from booking to agreement and registration.' },
  inventory_absorption: { id: 'inventory_absorption', name: 'Inventory absorption', status: 'available', summary: 'Available, blocked, booked and sold units and absorption rate per organisation.' },
  price_permissions: { id: 'price_permissions', name: 'Price visibility for partners', status: 'available', summary: 'Choose per shared project whether partner agencies see nothing, availability only, or availability with prices.' },
  microsites: { id: 'microsites', name: 'Project showroom pages', status: 'available', summary: 'Public project pages with an enquiry form that sends leads straight to the right project.' },
  // Site visits
  site_visits: { id: 'site_visits', name: 'Site visit scheduling', status: 'available', summary: 'Schedule, reschedule, check in, complete or mark no-show, with a clear status flow.' },
  // Channel partners
  partner_network: { id: 'partner_network', name: 'Developer–agency partnerships', status: 'available', summary: 'Developers and agencies connect their separate RE workspaces with a partner code.' },
  project_sharing: { id: 'project_sharing', name: 'Project sharing with partners', status: 'available', summary: 'Developers share chosen projects with partner agencies and decide how much inventory they see.' },
  buyer_registration: { id: 'buyer_registration', name: 'Buyer registration', status: 'available', summary: 'Agencies register buyers with a developer; first registration wins and is protected for an agreed period.' },
  registration_review: { id: 'registration_review', name: 'Registration review', status: 'available', summary: 'Developers accept or reject registrations; conflicts with existing leads are detected.' },
  agency_ownership: { id: 'agency_ownership', name: 'Agency data ownership', status: 'in_production', summary: 'Each agency has its own workspace; its buyers and leads stay its own.' },
  commissions: { id: 'commissions', name: 'Commission tracking', status: 'partial', summary: 'Commission records against channel partner bookings.', publicNote: 'Commission records only; payouts are handled outside RE.' },
  // Analytics
  funnel: { id: 'funnel', name: 'Sales funnel', status: 'available', summary: 'Lead-to-visit-to-booking funnel with stage conversion rates.' },
  channel_performance: { id: 'channel_performance', name: 'Source performance', status: 'available', summary: 'Leads, site visits, bookings and booking value by lead source.' },
  sales_velocity: { id: 'sales_velocity', name: 'Sales velocity', status: 'available', summary: 'Average days from enquiry to booking.' },
  // Platform and security
  tenant_isolation: { id: 'tenant_isolation', name: 'Organisation data isolation', status: 'in_production', summary: 'Each company’s data is separated in the database itself, not just hidden in the app.' },
  audit_log: { id: 'audit_log', name: 'Audit log', status: 'available', summary: 'Owners and admins see who changed what in their workspace.' },
  support_access: { id: 'support_access', name: 'Customer-approved support access', status: 'available', summary: 'RE support sees your data only with your time-limited, audited permission.' },
  online_payments: { id: 'online_payments', name: 'Online subscription payments', status: 'partial', summary: 'Subscription invoices with GST.', publicNote: 'Online payment of invoices is being set up.' },
  automation: { id: 'automation', name: 'Workflow automation', status: 'partial', summary: 'Automated actions on lead events.', publicNote: 'Limited set of automated actions.' },
  sso: { id: 'sso', name: 'Single sign-on', status: 'not_available', summary: '' },
  native_apps: { id: 'native_apps', name: 'Native iOS/Android apps', status: 'not_available', summary: '' },
  dialer: { id: 'dialer', name: 'Built-in calling / dialer', status: 'not_available', summary: '' },
} as const satisfies Record<string, Capability>

export type CapabilityId = keyof typeof CAPABILITIES

/** Capabilities a public page may list as a feature (everything except not_available). */
export function publicCapability(id: CapabilityId): Capability {
  const c: Capability = CAPABILITIES[id]
  if (c.status === 'not_available') throw new Error(`capability ${id} is not available and must not be published`)
  return c
}

/** Short label for statuses that need qualifying on a public page (null = no label needed). */
export function statusLabel(status: CapabilityStatus): string | null {
  switch (status) {
    case 'needs_setup': return 'Connect your account'
    case 'partial': return 'Partial'
    case 'planned': return 'Planned'
    default: return null
  }
}
