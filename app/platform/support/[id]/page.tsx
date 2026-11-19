// app/platform/support/[id]/page.tsx — one support case: the conversation (with internal notes), reply, status.
import type { Metadata } from 'next'
import Link from 'next/link'
import { notFound } from 'next/navigation'
import { getConsoleAccess } from '@/lib/auth/platform'
import { createServiceClient } from '@/lib/supabase/server'
import { can, getCaseForStaff, type Db, type StaffRole } from '@/lib/platform/portal'
import { CaseControls, CaseReplyForm } from '@/components/platform/PortalClient'
import { Badge, Card, CardContent, CardHeader, CardTitle } from '@/components/ui'

export const metadata: Metadata = { title: 'Support case' }
export const dynamic = 'force-dynamic'

export default async function SupportCasePage({ params }: { params: Promise<{ id: string }> }) {
  const access = await getConsoleAccess()
  if (access.state !== 'ok') return null
  const role = access.role as StaffRole
  if (!can(role, 'supportRead')) notFound()
  const { id } = await params
  const db = createServiceClient() as unknown as Db
  const r = await getCaseForStaff(db, { userId: access.userId, role }, id)
  if (!r.success) notFound()
  const c = r.data
  const { data: staff } = await db.from('platform_users').select('user_id').in('role', ['support_agent', 'platform_admin', 'super_admin']).eq('is_active', true)
  const { data: names } = await db.from('profiles').select('auth_user_id, full_name').in('auth_user_id', (staff ?? []).map((s) => s.user_id))
  const supportStaff = (staff ?? []).map((s) => ({ id: s.user_id, label: names?.find((n) => n.auth_user_id === s.user_id)?.full_name ?? 'Staff member' }))
  const when = (iso: string) => new Intl.DateTimeFormat('en-IN', { dateStyle: 'medium', timeStyle: 'short', timeZone: 'Asia/Kolkata' }).format(new Date(iso))
  return (
    <div className="space-y-5">
      <Link href="/platform/support" className="text-[12px] text-muted hover:text-foreground">← Support cases</Link>
      <div>
        <h1 className="text-[18px] font-semibold">{c.subject}</h1>
        <p className="text-[13px] text-muted">
          <Link href={`/platform/organisations/${c.org?.id}`} className="text-brand hover:underline">{c.org?.name}</Link> · {c.org?.type === 'channel_partner' ? 'Agency' : 'Developer'} · {c.category.replace('_', ' ')} · opened {when(c.created_at)}
        </p>
      </div>
      {can(role, 'supportWrite') && <Card><CardContent className="pt-5"><CaseControls id={c.id} status={c.status} priority={c.priority} assignee={c.assignee_user_id} supportStaff={supportStaff} /></CardContent></Card>}
      <Card>
        <CardHeader><CardTitle>Conversation</CardTitle></CardHeader>
        <CardContent className="space-y-3">
          {c.messages.map((m: { id: string; author_kind: string; author_label: string | null; body: string; internal: boolean; created_at: string }) => (
            <div key={m.id} className={`rounded-xl border p-3 text-[13px] ${m.internal ? 'border-dashed border-warning bg-warning-bg' : m.author_kind === 'staff' ? 'border-default bg-surface-muted' : 'border-default'}`}>
              <p className="font-medium">{m.author_label ?? (m.author_kind === 'staff' ? 'REGrow support' : 'Customer')} {m.internal && <Badge tone="warning">Internal note</Badge>} <span className="font-normal text-subtle">{when(m.created_at)}</span></p>
              <p className="mt-1 whitespace-pre-wrap">{m.body}</p>
            </div>
          ))}
          {can(role, 'supportWrite') && c.status !== 'closed' && <CaseReplyForm id={c.id} />}
        </CardContent>
      </Card>
    </div>
  )
}
