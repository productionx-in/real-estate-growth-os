// app/platform/audit/page.tsx — what platform staff did (provisioning, state changes, support access). Read-only.
import type { Metadata } from 'next'
import { notFound } from 'next/navigation'
import { getConsoleAccess, PLATFORM_AUDIT_READERS } from '@/lib/auth/platform'
import { createServiceClient } from '@/lib/supabase/server'
import { Card } from '@/components/ui'

export const metadata: Metadata = { title: 'Platform audit log' }

export default async function PlatformAuditPage() {
  const access = await getConsoleAccess()
  if (access.state !== 'ok') return null
  if (!PLATFORM_AUDIT_READERS.includes(access.role)) notFound()

  const service = createServiceClient()
  const { data } = await service
    .from('platform_audit_logs')
    .select('id, created_at, actor_user_id, actor_role, action, target_entity_type, target_entity_id, metadata, ip_address')
    .order('created_at', { ascending: false })
    .limit(200)
  const rows = data ?? []
  const actorIds = [...new Set(rows.map((r) => r.actor_user_id))]
  const { data: profiles } = actorIds.length
    ? await service.from('profiles').select('auth_user_id, full_name').in('auth_user_id', actorIds)
    : { data: [] }
  const name = new Map((profiles ?? []).map((p) => [p.auth_user_id, p.full_name]))
  const when = (iso: string) => new Intl.DateTimeFormat('en-IN', { dateStyle: 'medium', timeStyle: 'short', timeZone: 'Asia/Kolkata' }).format(new Date(iso))

  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-[18px] font-semibold">Platform audit log</h1>
        <p className="text-[13px] text-muted">Latest 200 actions by REGrow staff. Entries cannot be edited or deleted.</p>
      </div>
      <Card className="overflow-x-auto">
        <table className="w-full min-w-[760px] text-[12px]">
          <thead>
            <tr className="border-b border-default text-left text-muted">
              <th scope="col" className="px-4 py-2.5 font-medium">When</th>
              <th scope="col" className="px-3 py-2.5 font-medium">Who</th>
              <th scope="col" className="px-3 py-2.5 font-medium">Action</th>
              <th scope="col" className="px-3 py-2.5 font-medium">Target</th>
              <th scope="col" className="px-4 py-2.5 font-medium">Details</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((r) => (
              <tr key={r.id} className="border-b border-default align-top last:border-0">
                <td className="whitespace-nowrap px-4 py-2.5 tabular-nums text-muted">{when(r.created_at)}</td>
                <td className="px-3 py-2.5">{name.get(r.actor_user_id) ?? 'Unknown'} <span className="text-subtle">· {r.actor_role}</span></td>
                <td className="px-3 py-2.5 font-medium">{r.action}</td>
                <td className="px-3 py-2.5 text-muted">{r.target_entity_type} <span className="font-mono text-[11px]">{String(r.target_entity_id).slice(0, 8)}</span></td>
                <td className="max-w-md px-4 py-2.5 text-muted"><code className="break-words font-mono text-[11px]">{JSON.stringify(r.metadata)}</code></td>
              </tr>
            ))}
          </tbody>
        </table>
      </Card>
    </div>
  )
}
