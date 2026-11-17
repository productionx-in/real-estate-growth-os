// app/platform/page.tsx — customer workspaces: metadata only (name, type, plan, state, size). No business data.
import type { Metadata } from 'next'
import Link from 'next/link'
import { getConsoleAccess } from '@/lib/auth/platform'
import { createServiceClient } from '@/lib/supabase/server'
import { Badge, Card, EmptyState, Input } from '@/components/ui'
import { Building2 } from 'lucide-react'

export const metadata: Metadata = { title: 'Organisations' }

const STATE_TONE = { active: 'success', grace: 'warning', suspended: 'danger', deactivated: 'neutral', pending_setup: 'info' } as const

export default async function PlatformHome({ searchParams }: { searchParams: Promise<{ q?: string }> }) {
  const access = await getConsoleAccess()
  if (access.state !== 'ok') return null // layout renders the MFA step
  const { q } = await searchParams
  const service = createServiceClient()
  let query = service
    .from('organisations')
    .select('id, name, slug, type, plan, lifecycle_state, created_at, org_members(count)')
    .order('created_at', { ascending: false })
    .limit(200)
  const term = q?.trim().replace(/[%,()]/g, '')
  if (term) query = query.or(`name.ilike.%${term}%,slug.ilike.%${term}%`)
  const { data: orgs } = await query
  const { data: pending } = await service.from('support_access_grants').select('org_id').eq('status', 'pending')
  const pendingByOrg = new Set((pending ?? []).map((p) => p.org_id))

  type Row = { id: string; name: string; slug: string; type: string; plan: string | null; lifecycle_state: keyof typeof STATE_TONE; created_at: string; org_members: { count: number }[] }
  const rows = (orgs ?? []) as unknown as Row[]

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-[18px] font-semibold">Organisations</h1>
          <p className="text-[13px] text-muted">Workspace details only. Leads, contacts and settings need a support grant approved by the customer.</p>
        </div>
        <form className="w-full max-w-xs" role="search">
          <label htmlFor="q" className="sr-only">Search organisations</label>
          <Input id="q" name="q" defaultValue={q} placeholder="Search name or slug" />
        </form>
      </div>
      <Card className="overflow-x-auto">
        {rows.length === 0 ? <EmptyState icon={Building2} title="No organisations found" /> : (
          <table className="w-full min-w-[720px] text-[13px]">
            <thead>
              <tr className="border-b border-default text-left text-muted">
                <th scope="col" className="px-4 py-2.5 font-medium">Organisation</th>
                <th scope="col" className="px-3 py-2.5 font-medium">Type</th>
                <th scope="col" className="px-3 py-2.5 font-medium">Plan</th>
                <th scope="col" className="px-3 py-2.5 font-medium">State</th>
                <th scope="col" className="px-3 py-2.5 text-right font-medium">Members</th>
                <th scope="col" className="px-4 py-2.5 font-medium">Created</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((o) => (
                <tr key={o.id} className="border-b border-default last:border-0 hover:bg-surface-hover">
                  <td className="px-4 py-2.5">
                    <Link href={`/platform/organisations/${o.id}`} className="font-medium text-brand hover:underline">{o.name}</Link>
                    <span className="ml-2 text-[12px] text-subtle">{o.slug}</span>
                    {pendingByOrg.has(o.id) && <Badge tone="warning" className="ml-2">Support request open</Badge>}
                  </td>
                  <td className="px-3 py-2.5 text-muted">{o.type === 'channel_partner' ? 'Channel partner' : 'Developer'}</td>
                  <td className="px-3 py-2.5 text-muted">{o.plan ?? '—'}</td>
                  <td className="px-3 py-2.5"><Badge tone={STATE_TONE[o.lifecycle_state] ?? 'neutral'}>{o.lifecycle_state.replace('_', ' ')}</Badge></td>
                  <td className="px-3 py-2.5 text-right tabular-nums">{o.org_members?.[0]?.count ?? 0}</td>
                  <td className="px-4 py-2.5 tabular-nums text-muted">{new Date(o.created_at).toLocaleDateString('en-IN')}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </Card>
    </div>
  )
}
