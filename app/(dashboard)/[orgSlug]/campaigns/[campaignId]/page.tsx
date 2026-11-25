// app/(dashboard)/[orgSlug]/campaigns/[campaignId]/page.tsx — one campaign: edit and send a draft, or follow a sent
// campaign's delivery, recipient by recipient. Owners, admins and managers only.
import type { Metadata } from 'next'
import Link from 'next/link'
import { notFound } from 'next/navigation'
import { PageShell } from '@/components/layout/PageShell'
import { Badge, Card, CardContent, CardHeader, CardTitle, StatCard } from '@/components/ui'
import { AutoRefresh } from '@/components/plots/AutoRefresh'
import { CancelCampaignButton, DraftEditor, SendPanel } from '@/components/campaigns/CampaignControls'
import { getVerifiedWorkspace } from '@/lib/dal/workspace'
import { resolveLeadViewer } from '@/lib/dal/viewer'
import { listSegments } from '@/lib/dal/segments'
import { campaignRecipients, getCampaign, missingForSend, whatsappOptions } from '@/lib/dal/campaigns'
import { CHANNEL_LABEL, SKIP_LABEL, STATUS_LABEL, canRunCampaigns, type SkipReason } from '@/lib/campaigns/rules'

export const metadata: Metadata = { title: 'Campaign' }
export const dynamic = 'force-dynamic'
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i
const when = (iso: string | null) => iso ? new Intl.DateTimeFormat('en-IN', { day: 'numeric', month: 'short', hour: 'numeric', minute: '2-digit', timeZone: 'Asia/Kolkata' }).format(new Date(iso)) : '—'
const OUTCOME: Record<string, { label: string; tone: 'neutral' | 'info' | 'success' | 'warning' | 'danger' }> = {
  queued: { label: 'Waiting', tone: 'info' }, sent: { label: 'Sent', tone: 'success' }, skipped: { label: 'Left out', tone: 'neutral' }, failed: { label: 'Failed', tone: 'danger' },
}

export default async function CampaignPage({ params }: { params: Promise<{ orgSlug: string; campaignId: string }> }) {
  const { orgSlug, campaignId } = await params
  if (!UUID.test(campaignId)) notFound()
  const { org, role, profile } = await getVerifiedWorkspace(orgSlug)
  if (!canRunCampaigns(role)) notFound()
  const c = await getCampaign(org.id, campaignId)
  if (!c) notFound()
  const listHref = `/${orgSlug}/campaigns`
  const draft = c.status === 'draft'

  if (draft) {
    const viewer = await resolveLeadViewer(org.id, role, profile.id)
    const [segments, wa] = await Promise.all([listSegments(org.id, viewer), c.channel === 'whatsapp' ? whatsappOptions(org.id) : Promise.resolve([])])
    return (
      <PageShell back={{ href: listHref, label: 'Campaigns' }} title={c.name}
        description={`${CHANNEL_LABEL[c.channel]} campaign · draft`}
        actions={<CancelCampaignButton orgId={org.id} campaignId={c.id} draft listHref={listHref} />}>
        <div className="space-y-6">
          <Card><CardHeader><CardTitle>Message</CardTitle></CardHeader><CardContent>
            <DraftEditor orgId={org.id} campaign={c} segments={segments.map((s) => ({ id: s.id, name: s.name, count: s.count }))} whatsapp={wa} />
          </CardContent></Card>
          <Card><CardHeader><CardTitle>Send</CardTitle></CardHeader><CardContent>
            <SendPanel orgId={org.id} orgSlug={orgSlug} campaignId={c.id} channel={c.channel} missing={missingForSend(c)} />
          </CardContent></Card>
        </div>
      </PageShell>
    )
  }

  const recipients = await campaignRecipients(org.id, c.id)
  const k = c.counts
  return (
    <PageShell back={{ href: listHref, label: 'Campaigns' }}
      title={<span className="flex flex-wrap items-center gap-2">{c.name}<Badge tone={c.status === 'sent' ? 'success' : c.status === 'sending' ? 'info' : 'warning'}>{STATUS_LABEL[c.status]}</Badge></span>}
      description={`${CHANNEL_LABEL[c.channel]} to ${c.segmentName ?? 'a deleted segment'} · started ${when(c.startedAt)}${c.finishedAt ? ` · finished ${when(c.finishedAt)}` : ''}`}
      actions={c.status === 'sending' ? <CancelCampaignButton orgId={org.id} campaignId={c.id} draft={false} listHref={listHref} /> : undefined}>
      {(c.status === 'sending' || k.queued > 0) && <AutoRefresh seconds={15} />}
      <div className="space-y-6">
        <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
          <StatCard label="Sent" value={k.sent} tone="good" />
          <StatCard label="Waiting" value={k.queued} hint={c.channel === 'email' ? 'in the e-mail queue' : 'sent in batches'} />
          <StatCard label="Left out" value={k.skipped} hint="opted out, no address, duplicate or junk" />
          <StatCard label="Failed" value={k.failed} tone={k.failed ? 'bad' : 'neutral'} />
        </div>
        {c.channel === 'email' && c.subject && (
          <Card><CardHeader><CardTitle>{c.subject}</CardTitle></CardHeader><CardContent>
            <div className="space-y-3 text-[14px] leading-6">{(c.body ?? '').split(/\n\s*\n/).map((p, i) => <p key={i} className="whitespace-pre-line">{p}</p>)}</div>
          </CardContent></Card>
        )}
        {c.channel === 'whatsapp' && <p className="text-[13px] text-muted">Template: <span className="font-medium text-foreground">{c.waTemplateName}</span> ({c.waLanguage})</p>}
        <div className="overflow-x-auto rounded-xl border border-default bg-surface">
          <table className="w-full min-w-[560px] text-[13px]">
            <thead className="bg-surface-muted text-left text-[12px] text-muted">
              <tr><th className="px-3 py-2 font-medium">Lead</th><th className="px-3 py-2 font-medium">{c.channel === 'email' ? 'E-mail' : 'WhatsApp'}</th><th className="px-3 py-2 font-medium">Result</th><th className="px-3 py-2 font-medium">When</th></tr>
            </thead>
            <tbody className="divide-y divide-default">
              {recipients.map((r) => (
                <tr key={r.id}>
                  <td className="px-3 py-2">{r.leadId ? <Link href={`/${orgSlug}/leads/${r.leadId}`} className="font-medium hover:underline">{r.leadName ?? 'Lead'}</Link> : <span className="text-muted">Deleted lead</span>}</td>
                  <td className="px-3 py-2 text-muted">{r.address || '—'}</td>
                  <td className="px-3 py-2">
                    <Badge tone={OUTCOME[r.status]?.tone ?? 'neutral'}>{OUTCOME[r.status]?.label ?? r.status}</Badge>
                    {r.skipReason && <span className="ml-2 text-[12px] text-muted">{r.skipReason === 'cancelled' ? 'Campaign stopped' : SKIP_LABEL[r.skipReason as SkipReason] ?? r.skipReason}</span>}
                    {r.error && <span className="ml-2 text-[12px] text-danger">{r.error}</span>}
                  </td>
                  <td className="px-3 py-2 tabular-nums text-muted">{when(r.sentAt)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        {k.total > recipients.length && <p className="text-[12px] text-muted">Showing {recipients.length} of {k.total} recipients.</p>}
      </div>
    </PageShell>
  )
}
