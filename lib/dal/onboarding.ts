// lib/dal/onboarding.ts
// "Getting started" checklist: every step is ticked from real data, so it can never claim a setup that isn't done.
import { createServiceClient } from '@/lib/supabase/server'

export interface SetupStep {
  id: 'project' | 'source' | 'team' | 'routing' | 'alerts' | 'import' | 'response'
  title: string
  body: string
  href: string
  cta: string
  done: boolean
  optional?: boolean
}

export async function getSetupChecklist(orgId: string, orgSlug: string, profileId: string): Promise<SetupStep[]> {
  const db = createServiceClient()
  const count = async (q: PromiseLike<{ count: number | null }>) => (await q).count ?? 0
  const [projects, sources, members, rules, devices, imported, settings] = await Promise.all([
    count(db.from('projects').select('id', { count: 'exact', head: true }).eq('org_id', orgId)),
    count(db.from('integration_connections').select('id', { count: 'exact', head: true }).eq('org_id', orgId).eq('status', 'connected')),
    count(db.from('org_members').select('id', { count: 'exact', head: true }).eq('org_id', orgId).eq('status', 'active')),
    count(db.from('routing_rules').select('id', { count: 'exact', head: true }).eq('org_id', orgId).eq('is_active', true)),
    count(db.from('push_subscriptions').select('id', { count: 'exact', head: true }).eq('profile_id', profileId)),
    count(db.from('leads').select('id', { count: 'exact', head: true }).eq('org_id', orgId).not('custom_fields->imported_at', 'is', null)),
    count(db.from('lead_response_settings').select('org_id', { count: 'exact', head: true }).eq('org_id', orgId)),
  ])
  const at = (p: string) => `/${orgSlug}${p}`
  return [
    { id: 'project', title: 'Add your projects', body: 'Leads are routed and reported by project.', href: at('/projects/new'), cta: 'Add project', done: projects > 0 },
    { id: 'source', title: 'Connect a lead source', body: 'Meta lead forms, Google, portals or your website form.', href: at('/integrations'), cta: 'Connect', done: sources > 0 },
    { id: 'team', title: 'Invite your sales team', body: 'Everyone who calls leads needs a login.', href: at('/team'), cta: 'Invite', done: members > 1 },
    { id: 'routing', title: 'Decide who gets which leads', body: 'Create a team and a routing rule.', href: at('/routing'), cta: 'Set up routing', done: rules > 0 },
    { id: 'response', title: 'Set your response rules', body: 'How fast a new lead must be called, and working hours.', href: at('/routing'), cta: 'Set rules', done: settings > 0 },
    { id: 'alerts', title: 'Turn on phone alerts', body: 'Open the bell and switch on “Alerts on this device”.', href: at('/today'), cta: 'Open Today', done: devices > 0 },
    { id: 'import', title: 'Bring your existing leads', body: 'Import a CSV export from your current CRM or a spreadsheet.', href: at('/leads/import'), cta: 'Import', done: imported > 0, optional: true },
  ]
}
