// app/(dashboard)/[orgSlug]/campaigns/page.tsx — marketing campaigns (20260088): e-mail or WhatsApp to a lead segment.
// Owners, admins and managers only (others get 404; the API refuses them too).
import type { Metadata } from 'next'
import Link from 'next/link'
import { notFound } from 'next/navigation'
import { Megaphone } from 'lucide-react'
import { PageShell } from '@/components/layout/PageShell'
import { Alert, Badge, Card, CardContent, CardHeader, CardTitle } from '@/components/ui'
import { EmptyState } from '@/components/shared/EmptyState'
import { NewCampaignForm } from '@/components/campaigns/CampaignControls'
import { getVerifiedWorkspace } from '@/lib/dal/workspace'
import { resolveLeadViewer } from '@/lib/dal/viewer'
import { listSegments } from '@/lib/dal/segments'
import { listCampaigns, suppressionCounts, whatsappOptions } from '@/lib/dal/campaigns'
import { getEmailConfig } from '@/lib/email/config'
import { CHANNEL_LABEL, STATUS_LABEL, canRunCampaigns, type CampaignStatus } from '@/lib/campaigns/rules'

export const metadata: Metadata = { title: 'Campaigns' }
export const dynamic = 'force-dynamic'

const TONE: Record<CampaignStatus, 'neutral' | 'info' | 'success' | 'warning'> = { draft: 'neutral', sending: 'info', sent: 'success', cancelled: 'warning' }
const day = (iso: string) => new Intl.DateTimeFormat('en-IN', { day: 'numeric', month: 'short', year: 'numeric', timeZone: 'Asia/Kolkata' }).format(new Date(iso))

export default async function CampaignsPage({ params }: { params: Promise<{ orgSlug: string }> }) {
  const { orgSlug } = await params
  const { org, role, profile } = await getVerifiedWorkspace(orgSlug)
  if (!canRunCampaigns(role)) notFound()
  const viewer = await resolveLeadViewer(org.id, role, profile.id)
  const [campaigns, segments, wa, optOuts] = await Promise.all([
    listCampaigns(org.id), listSegments(org.id, viewer), whatsappOptions(org.id), suppressionCounts(org.id),
  ])
  const emailReady = getEmailConfig().problems.length === 0 && getEmailConfig().provider !== 'none'

  return (
    <PageShell title="Campaigns" description="Send an e-mail or a WhatsApp message to a segment of your leads. Opt-outs are always respected.">
      <div className="space-y-6">
        {!emailReady && (
          <Alert tone="warning" title="E-mail sending is not set up yet">
            E-mail campaigns can be drafted, but REGrow cannot send e-mail until it is configured. Messages wait safely and go out once it is.
          </Alert>
        )}
        <Card>
          <CardHeader><CardTitle>New campaign</CardTitle></CardHeader>
          <CardContent>
            {segments.length === 0 ? (
              <p className="text-[13px] text-muted">First create a segment — the group of leads to send to — in <Link className="text-brand hover:underline" href={`/${orgSlug}/leads/segments`}>Leads → Segments</Link>.</p>
            ) : (
              <NewCampaignForm orgId={org.id} orgSlug={orgSlug} segments={segments.map((s) => ({ id: s.id, name: s.name, count: s.count }))} whatsappReady={wa.length > 0} />
            )}
          </CardContent>
        </Card>

        {campaigns.length === 0 ? (
          <Card><EmptyState icon={Megaphone} title="No campaigns yet" description="Drafts and sent campaigns appear here, with how many were delivered." /></Card>
        ) : (
          <ul className="divide-y divide-default overflow-hidden rounded-xl border border-default bg-surface">
            {campaigns.map((c) => (
              <li key={c.id}>
                <Link href={`/${orgSlug}/campaigns/${c.id}`} className="flex flex-col gap-1 px-4 py-3 hover:bg-surface-hover sm:flex-row sm:items-center sm:justify-between">
                  <span className="min-w-0">
                    <span className="flex flex-wrap items-center gap-2">
                      <span className="font-medium">{c.name}</span>
                      <Badge tone={TONE[c.status]}>{STATUS_LABEL[c.status]}</Badge>
                      <Badge>{CHANNEL_LABEL[c.channel]}</Badge>
                    </span>
                    <span className="block truncate text-[12px] text-muted">{c.segmentName ?? 'No segment'} · {day(c.startedAt ?? c.createdAt)}</span>
                  </span>
                  <span className="shrink-0 text-[13px] tabular-nums text-muted">
                    {c.status === 'draft' ? '—' : `${c.counts.sent} sent${c.counts.failed ? ` · ${c.counts.failed} failed` : ''}${c.counts.skipped ? ` · ${c.counts.skipped} left out` : ''}`}
                  </span>
                </Link>
              </li>
            ))}
          </ul>
        )}
        <p className="text-[12px] text-muted">Opted out of marketing: {optOuts.email} e-mail {optOuts.email === 1 ? 'address' : 'addresses'} (unsubscribe link) · {optOuts.whatsapp} WhatsApp {optOuts.whatsapp === 1 ? 'number' : 'numbers'} (replied STOP).</p>
      </div>
    </PageShell>
  )
}
