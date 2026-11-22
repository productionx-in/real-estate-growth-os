// lib/dal/report-catalogue.ts — data for the reports catalogue (lib/reports/catalogue.ts). Callers authorise first:
// organisation-wide reports are for roles that see every lead. Every query is scoped by organisation; archived leads
// are excluded (public.leads is the view of live leads).
import { createServiceClient } from '@/lib/supabase/server'
import { buildCatalogue, type Catalogue, type RBooking, type RLead, type RVisit } from '@/lib/reports/catalogue'

export const CATALOGUE_PERIODS = { '7d': 7, '30d': 30, '90d': 90, '365d': 365 } as const
export type CataloguePeriod = keyof typeof CATALOGUE_PERIODS
const MAX_LEADS = 50_000
const CHUNK = 500

export async function getCatalogue(orgId: string, period: CataloguePeriod, now = new Date()): Promise<Catalogue & { capped: boolean; from: string; to: string }> {
  const db = createServiceClient()
  const from = new Date(now.getTime() - CATALOGUE_PERIODS[period] * 86_400_000)
  const leads: RLead[] = []
  for (let offset = 0; offset < MAX_LEADS; offset += 1000) {
    const { data } = await db.from('leads').select('id, source, status, assigned_to, created_at, first_action_at')
      .eq('org_id', orgId).gte('created_at', from.toISOString()).lte('created_at', now.toISOString())
      .order('created_at').range(offset, offset + 999)
    leads.push(...((data ?? []) as RLead[]))
    if (!data || data.length < 1000) break
  }
  const ids = leads.map((l) => l.id)
  const visits: RVisit[] = [], bookings: RBooking[] = []
  for (let i = 0; i < ids.length; i += CHUNK) {
    const part = ids.slice(i, i + CHUNK)
    const [{ data: v }, { data: b }] = await Promise.all([
      db.from('site_visits').select('lead_id, status').eq('org_id', orgId).in('lead_id', part),
      db.from('bookings').select('lead_id, status, total_amount').eq('org_id', orgId).in('lead_id', part),
    ])
    visits.push(...((v ?? []) as RVisit[])); bookings.push(...((b ?? []) as RBooking[]))
  }
  return { ...buildCatalogue(leads, visits, bookings, { from, to: now }), capped: leads.length >= MAX_LEADS, from: from.toISOString(), to: now.toISOString() }
}

export async function memberNames(orgId: string): Promise<Map<string, string>> {
  const { data } = await createServiceClient().from('org_members').select('profile_id, profile:profiles!org_members_profile_id_fkey(full_name)').eq('org_id', orgId)
  const out = new Map<string, string>()
  for (const m of (data ?? []) as unknown as { profile_id: string; profile: { full_name: string | null } | { full_name: string | null }[] | null }[]) {
    out.set(m.profile_id, (Array.isArray(m.profile) ? m.profile[0]?.full_name : m.profile?.full_name) || 'Team member')
  }
  return out
}
