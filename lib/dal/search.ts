// lib/dal/search.ts
// The ⌘K search: leads and projects in one organisation, for one viewer. Callers authorise first. Lead
// visibility goes through applyLeadFilters, the same rule as the Leads page, so a sales executive only
// ever finds leads assigned to them. The text is cleaned by cleanSearch before it reaches PostgREST.
import { createServiceClient } from '@/lib/supabase/server'
import { applyLeadFilters, cleanSearch, type Viewer } from '@/lib/leads/view-filters'

export interface SearchResults {
  leads: { id: string; name: string; phone: string | null; status: string; projectName: string | null }[]
  projects: { id: string; name: string; city: string | null }[]
}

export const EMPTY_RESULTS: SearchResults = { leads: [], projects: [] }

export async function searchWorkspace(orgId: string, viewer: Viewer, raw: unknown, now = new Date()): Promise<SearchResults> {
  const q = cleanSearch(raw)
  if (!q) return EMPTY_RESULTS
  const db = createServiceClient()
  const leadQuery = applyLeadFilters(
    db.from('leads').select('id, name, phone, status, project:projects(name)').eq('org_id', orgId),
    { q }, viewer, now
  ).order('updated_at', { ascending: false }).limit(8)
  const projectQuery = db.from('projects').select('id, name, city').eq('org_id', orgId)
    .ilike('name', `%${q}%`).order('name').limit(5)
  const [{ data: leads }, { data: projects }] = await Promise.all([leadQuery, projectQuery])
  return {
    leads: ((leads ?? []) as unknown as { id: string; name: string; phone: string | null; status: string; project: { name: string } | null }[])
      .map((l) => ({ id: l.id, name: l.name, phone: l.phone, status: l.status, projectName: l.project?.name ?? null })),
    projects: (projects ?? []) as SearchResults['projects'],
  }
}
