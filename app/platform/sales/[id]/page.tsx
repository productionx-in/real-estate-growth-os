// app/platform/sales/[id]/page.tsx — one prospect: details, stage, owner, follow-up and activity history.
import type { Metadata } from 'next'
import Link from 'next/link'
import { notFound } from 'next/navigation'
import { getConsoleAccess } from '@/lib/auth/platform'
import { createServiceClient } from '@/lib/supabase/server'
import { can, getProspect, type Db, type StaffRole } from '@/lib/platform/portal'
import { ActivityForm, ProspectControls, STAGE_LABEL } from '@/components/platform/PortalClient'
import { Badge, Button, Card, CardContent, CardHeader, CardTitle } from '@/components/ui'

export const metadata: Metadata = { title: 'Prospect' }
export const dynamic = 'force-dynamic'

export default async function ProspectPage({ params }: { params: Promise<{ id: string }> }) {
  const access = await getConsoleAccess()
  if (access.state !== 'ok') return null
  const role = access.role as StaffRole
  if (!can(role, 'salesRead')) notFound()
  const { id } = await params
  const db = createServiceClient() as unknown as Db
  const r = await getProspect(db, { userId: access.userId, role }, id)
  if (!r.success) notFound()
  const p = r.data
  const { data: staff } = await db.from('platform_users').select('user_id, role').in('role', ['sales_rep', 'sales_manager', 'super_admin']).eq('is_active', true)
  const { data: names } = await db.from('profiles').select('auth_user_id, full_name').in('auth_user_id', (staff ?? []).map((s) => s.user_id))
  const salesStaff = (staff ?? []).map((s) => ({ id: s.user_id, label: names?.find((n) => n.auth_user_id === s.user_id)?.full_name ?? 'Staff member' }))
  const when = (iso: string) => new Intl.DateTimeFormat('en-IN', { dateStyle: 'medium', timeStyle: 'short', timeZone: 'Asia/Kolkata' }).format(new Date(iso))
  return (
    <div className="space-y-5">
      <Link href="/platform/sales" className="text-[12px] text-muted hover:text-foreground">← Sales pipeline</Link>
      <div className="flex flex-wrap items-center gap-3">
        <h1 className="text-[22px] font-semibold tracking-tight">{p.company_name}</h1>
        <Badge tone="brand">{STAGE_LABEL[p.stage]}</Badge>
        <span className="text-[13px] text-muted">{p.org_type === 'channel_partner' ? 'Channel partner agency' : 'Developer / builder'}{p.city ? ` · ${p.city}` : ''}{p.team_size ? ` · team of ${p.team_size}` : ''}</span>
      </div>
      <Card className={p.linked_org_id ? '' : 'border-brand/40'}>
        <CardContent className="flex flex-wrap items-center justify-between gap-3 p-5">
          {p.linked_org_id ? (
            <>
              <div>
                <p className="text-[14px] font-semibold">Workspace created</p>
                <p className="text-[13px] text-muted">This request has a REGrow workspace. Manage it, or get a new invitation link, from its page.</p>
              </div>
              <Button asChild variant="secondary"><Link href={`/platform/organisations/${p.linked_org_id}`}>Open workspace</Link></Button>
            </>
          ) : (
            <>
              <div className="min-w-0">
                <p className="text-[14px] font-semibold">Activate this customer</p>
                <p className="text-[13px] text-muted">
                  Create their workspace and invite {p.contact_email ? <strong className="text-foreground">{p.contact_email}</strong> : 'them'} as the owner. The form is filled in from this request.
                  {!p.contact_email && ' Add their e-mail address on the next screen.'}
                </p>
              </div>
              {role === 'super_admin'
                ? <Button asChild><Link href={`/admin/provision?prospect=${p.id}`}>Activate — create workspace</Link></Button>
                : <p className="text-[12px] text-muted">Only the Platform Owner can create workspaces. Move this to “Qualified” and let them know.</p>}
            </>
          )}
        </CardContent>
      </Card>
      <div className="grid gap-4 lg:grid-cols-[1fr_1.2fr]">
        <Card>
          <CardHeader><CardTitle>Contact</CardTitle></CardHeader>
          <CardContent className="space-y-1 text-[13px]">
            <p>{p.contact_name ?? '—'}</p>
            {p.contact_email && <p><a className="text-brand hover:underline" href={`mailto:${p.contact_email}`}>{p.contact_email}</a></p>}
            {p.contact_phone && <p><a className="text-brand hover:underline" href={`tel:${p.contact_phone}`}>{p.contact_phone}</a></p>}
            <p className="text-muted">Source: {p.source}{p.campaign ? ` · ${p.campaign}` : ''}</p>
            {p.lost_reason && <p className="text-danger">Lost: {p.lost_reason}</p>}
            {p.notes && <p className="whitespace-pre-wrap pt-2 text-muted">{p.notes}</p>}
          </CardContent>
        </Card>
        {can(role, 'salesWrite') && (
          <Card>
            <CardHeader><CardTitle>Pipeline</CardTitle></CardHeader>
            <CardContent>
              <ProspectControls id={p.id} stage={p.stage} ownerUserId={p.owner_user_id} followUp={p.next_follow_up_at} salesStaff={salesStaff} canAssignAnyone={can(role, 'salesAll')} me={access.userId} />
            </CardContent>
          </Card>
        )}
      </div>
      <Card>
        <CardHeader><CardTitle>Activity</CardTitle></CardHeader>
        <CardContent className="space-y-4">
          {can(role, 'salesWrite') && <ActivityForm id={p.id} />}
          <ol className="space-y-2 text-[13px]">
            {p.activities.map((a: { id: string; kind: string; body: string; created_at: string }) => (
              <li key={a.id} className="border-b border-default pb-2"><span className="font-medium capitalize">{a.kind.replace('_', ' ')}</span> · <span className="text-subtle">{when(a.created_at)}</span><p className="text-muted whitespace-pre-wrap">{a.body}</p></li>
            ))}
            {p.activities.length === 0 && <li className="text-muted">No activity yet.</li>}
          </ol>
        </CardContent>
      </Card>
    </div>
  )
}
