// lib/plots/addon-usage.ts — what the platform console shows about Interactive Plot Map per project: entitlement,
// configuration and publishing status, and usage counts. Counts and statuses only: no layout geometry, no inventory
// rows, no buyer data. Platform pages call this after checking the staff role.
import { createServiceClient } from '@/lib/supabase/server'
import { toProjectAddon, PROJECT_ADDON_COLUMNS, type ProjectAddon } from '@/lib/plots/addons'

export interface ProjectAddonUsage {
  orgId: string
  orgName: string
  projectId: string
  projectName: string
  addon: ProjectAddon
  layouts: number
  published: number
  shared: number
  mappedPlots: number
}

type AddonRow = Parameters<typeof toProjectAddon>[0] & { org_id: string }

/** Every project with an add-on row (optionally one workspace's), pending requests first. With `includeAllProjects`
 *  and an orgId, also that workspace's projects without a row (not purchased), so one can be activated. */
export async function listPlotMapUsage(opts: { orgId?: string; includeAllProjects?: boolean } = {}): Promise<ProjectAddonUsage[]> {
  const db = createServiceClient()
  let q = db.from('project_addons').select(`org_id, ${PROJECT_ADDON_COLUMNS}`).eq('addon', 'plot_maps')
  if (opts.orgId) q = q.eq('org_id', opts.orgId)
  const { data: rows } = await q.limit(1000)
  const addons = new Map(((rows ?? []) as unknown as AddonRow[]).map((r) => [r.project_id, r]))

  let pq = db.from('projects').select('id, org_id, name')
  if (opts.orgId && opts.includeAllProjects) pq = pq.eq('org_id', opts.orgId)
  else pq = pq.in('id', [...addons.keys()].length ? [...addons.keys()] : ['00000000-0000-0000-0000-000000000000'])
  const { data: projects } = await pq.order('name').limit(1000)
  const list = projects ?? []
  if (!list.length) return []

  const orgIds = [...new Set(list.map((p) => p.org_id))]
  const projectIds = list.map((p) => p.id)
  const [{ data: orgs }, { data: layouts }] = await Promise.all([
    db.from('organisations').select('id, name').in('id', orgIds),
    db.from('plot_layouts').select('id, project_id, status, share_enabled').in('project_id', projectIds),
  ])
  const layoutIds = (layouts ?? []).map((l) => l.id)
  const { data: links } = layoutIds.length ? await db.from('plot_layout_links').select('layout_id').in('layout_id', layoutIds) : { data: [] }
  const linksPerLayout = new Map<string, number>()
  for (const l of links ?? []) linksPerLayout.set(l.layout_id, (linksPerLayout.get(l.layout_id) ?? 0) + 1)
  const orgName = new Map((orgs ?? []).map((o) => [o.id, o.name]))

  const order: Record<string, number> = { pending: 0, expired: 1, suspended: 2, active: 3, not_purchased: 4 }
  return list.map((p) => {
    const mine = (layouts ?? []).filter((l) => l.project_id === p.id)
    const row = addons.get(p.id)
    return {
      orgId: p.org_id, orgName: orgName.get(p.org_id) ?? '', projectId: p.id, projectName: p.name,
      addon: toProjectAddon(row ?? null),
      layouts: mine.length,
      published: mine.filter((l) => l.status === 'published').length,
      shared: mine.filter((l) => l.share_enabled).length,
      mappedPlots: mine.reduce((n, l) => n + (linksPerLayout.get(l.id) ?? 0), 0),
    }
  }).sort((a, b) => order[a.addon.state] - order[b.addon.state] || a.orgName.localeCompare(b.orgName) || a.projectName.localeCompare(b.projectName))
}
