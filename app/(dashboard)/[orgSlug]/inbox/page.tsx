// app/(dashboard)/[orgSlug]/inbox/page.tsx
// WhatsApp inbox: conversations on the left, the open conversation on the right (one at a time on phones).
// Managers see every conversation; a sales executive sees conversations with their own leads.
import type { Metadata } from 'next'
import Link from 'next/link'
import { ArrowLeft, Check, CheckCheck, MessageCircle, TriangleAlert } from 'lucide-react'
import { PageShell } from '@/components/layout/PageShell'
import { EmptyState } from '@/components/shared/EmptyState'
import { Badge, Button } from '@/components/ui'
import { Composer } from '@/components/inbox/Composer'
import { InboxLive } from '@/components/inbox/InboxLive'
import { getVerifiedWorkspace } from '@/lib/dal/workspace'
import { getResponseMinutes } from '@/lib/dal/action-board'
import { getThread, listConversations, type InboxFilter } from '@/lib/dal/whatsapp-inbox'
import { numberLabel } from '@/lib/integrations/whatsapp/numbers'
import { messageLabel } from '@/lib/integrations/whatsapp/inbox-rules'
import { createServiceClient } from '@/lib/supabase/server'
import { cn } from '@/lib/utils/cn'
import { resolveLeadViewer } from '@/lib/dal/viewer'
import { leadScopeOf } from '@/lib/auth/permissions'

export const metadata: Metadata = { title: 'WhatsApp inbox' }
export const dynamic = 'force-dynamic'

const FILTERS: Record<InboxFilter, string> = { all: 'All', unread: 'Unread', mine: 'Mine', unlinked: 'No lead' }
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

interface PageProps {
  params: Promise<{ orgSlug: string }>
  searchParams: Promise<{ c?: string; f?: string }>
}

export default async function InboxPage({ params, searchParams }: PageProps) {
  const { orgSlug } = await params
  const sp = await searchParams
  const { org, role, profile, isManager } = await getVerifiedWorkspace(orgSlug)
  const viewer = await resolveLeadViewer(org.id, role, profile.id)
  const filter: InboxFilter = sp.f && sp.f in FILTERS && (sp.f !== 'unlinked' || isManager) ? (sp.f as InboxFilter) : 'all'
  const openId = sp.c && UUID.test(sp.c) ? sp.c : null

  const [conversations, thread, { timezone }, { data: numberRows }] = await Promise.all([
    listConversations(org.id, viewer, filter),
    openId ? getThread(org.id, openId, viewer) : Promise.resolve(null),
    getResponseMinutes(org.id),
    createServiceClient().from('integration_connections').select('id, name, metadata')
      .eq('org_id', org.id).eq('provider', 'whatsapp_cloud'),
  ])
  const connections = (numberRows ?? []).length
  // With several WhatsApp numbers, each conversation shows the number it is on (lib/integrations/whatsapp/numbers.ts).
  const numberOf = new Map((numberRows ?? []).map((c) => [c.id, numberLabel({ name: c.name, metadata: c.metadata as Record<string, unknown> | null })]))
  const showNumber = numberOf.size > 1

  const time = (iso: string | null) => {
    if (!iso) return ''
    const d = new Date(iso)
    const day = (x: Date) => x.toLocaleDateString('en-CA', { timeZone: timezone })
    return day(d) === day(new Date())
      ? d.toLocaleTimeString('en-IN', { timeZone: timezone, hour: 'numeric', minute: '2-digit' })
      : d.toLocaleDateString('en-IN', { timeZone: timezone, day: 'numeric', month: 'short' })
  }
  const stamp = (iso: string) => new Date(iso).toLocaleString('en-IN', { timeZone: timezone, day: 'numeric', month: 'short', hour: 'numeric', minute: '2-digit' })
  const href = (q: Record<string, string | null>) => {
    const p = new URLSearchParams()
    const f = q.f ?? (filter === 'all' ? null : filter)
    if (f) p.set('f', f)
    if (q.c) p.set('c', q.c)
    const s = p.toString()
    return `/${orgSlug}/inbox${s ? `?${s}` : ''}`
  }

  if (!connections) {
    return (
      <PageShell title="WhatsApp inbox" description="Every WhatsApp conversation with your buyers, in one place.">
        <EmptyState
          icon={MessageCircle}
          title="WhatsApp is not connected yet"
          description={isManager
            ? 'Connect your WhatsApp Business number in Integrations. Messages from buyers will appear here and you can reply from RE.'
            : 'Ask your manager to connect the company WhatsApp Business number.'}
          action={isManager ? <Button asChild size="sm"><Link href={`/${orgSlug}/integrations`}>Go to Integrations</Link></Button> : undefined}
        />
      </PageShell>
    )
  }

  const list = (
    <div className={cn('flex min-h-0 w-full flex-col border-default md:w-80 md:shrink-0 md:border-r', thread && 'hidden md:flex')}>
      <nav aria-label="Filter conversations" className="flex gap-1 border-b border-default p-2">
        {(Object.keys(FILTERS) as InboxFilter[]).filter((f) => f !== 'unlinked' || isManager).filter((f) => f !== 'mine' || leadScopeOf(role) !== 'own').map((f) => (
          <Link key={f} href={href({ f: f === 'all' ? null : f, c: openId })} aria-current={filter === f ? 'page' : undefined}
            className={cn('rounded-md px-2 py-1 text-[12px] font-medium', filter === f ? 'bg-brand-light text-brand' : 'text-muted hover:bg-surface-hover')}>
            {FILTERS[f]}
          </Link>
        ))}
      </nav>
      {conversations.length === 0 ? (
        <p className="p-4 text-[13px] text-muted">{filter === 'all' ? 'No conversations yet. They appear here when a buyer messages your WhatsApp number.' : 'Nothing here.'}</p>
      ) : (
        <ul className="min-h-0 flex-1 overflow-y-auto">
          {conversations.map((c) => (
            <li key={c.id}>
              <Link href={href({ c: c.id })} aria-current={c.id === openId ? 'true' : undefined}
                className={cn('block border-b border-default px-3 py-2.5 hover:bg-surface-hover', c.id === openId && 'bg-surface-hover')}>
                <div className="flex items-baseline justify-between gap-2">
                  <span className={cn('truncate text-[13px]', c.unread ? 'font-semibold text-foreground' : 'font-medium text-foreground')}>{c.name}</span>
                  <span className="shrink-0 text-[11px] text-subtle">{time(c.lastMessageAt)}</span>
                </div>
                <div className="mt-0.5 flex items-center justify-between gap-2">
                  <span className="truncate text-[12px] text-muted">
                    {c.lastDirection === 'outbound' && 'You: '}{c.preview ? messageLabel('', c.preview) : ''}
                  </span>
                  {c.unread > 0 && <span className="shrink-0 rounded-full bg-brand px-1.5 text-[11px] font-semibold text-brand-foreground" aria-label={`${c.unread} unread`}>{c.unread}</span>}
                </div>
                {(c.optedOut || (isManager && c.assigneeName) || showNumber) && (
                  <div className="mt-1 flex flex-wrap gap-x-2 text-[11px] text-subtle">
                    {showNumber && <span className="truncate">{numberOf.get(c.connectionId) ?? 'WhatsApp number'}</span>}
                    {c.optedOut && <span className="text-danger">Opted out</span>}
                    {isManager && c.assigneeName && <span>{c.assigneeName}</span>}
                  </div>
                )}
              </Link>
            </li>
          ))}
        </ul>
      )}
    </div>
  )

  return (
    <PageShell title="WhatsApp inbox" description={{ all: 'Every WhatsApp conversation with your buyers', own: 'Conversations with your leads', team: 'Conversations with your team’s leads', booked: 'Conversations with booked customers' }[leadScopeOf(role)]}>
      <InboxLive orgId={org.id} conversationId={thread?.conversation.id ?? null} unread={thread?.conversation.unread ?? 0} />
      <div className="flex h-[calc(100dvh-13rem)] min-h-[28rem] overflow-hidden rounded-lg border border-default bg-surface">
        {list}
        {thread ? (
          <section aria-label={`Conversation with ${thread.conversation.name}`} className="flex min-w-0 flex-1 flex-col">
            <header className="flex items-center gap-2 border-b border-default px-3 py-2">
              <Link href={href({ c: null })} className="rounded-md p-1 text-muted hover:bg-surface-hover md:hidden" aria-label="Back to conversations">
                <ArrowLeft aria-hidden className="size-4" />
              </Link>
              <div className="min-w-0 flex-1">
                <p className="truncate text-[14px] font-semibold text-foreground">{thread.conversation.name}</p>
                <p className="text-[12px] text-muted">{thread.conversation.phone}{thread.conversation.assigneeName ? ` · ${thread.conversation.assigneeName}` : ''}{showNumber ? ` · via ${numberOf.get(thread.conversation.connectionId) ?? 'WhatsApp'}` : ''}</p>
              </div>
              {thread.conversation.optedOut && <Badge tone="danger">Opted out</Badge>}
              {thread.conversation.leadId && (
                <Button asChild size="sm" variant="secondary"><Link href={`/${orgSlug}/leads/${thread.conversation.leadId}`}>Open lead</Link></Button>
              )}
            </header>
            <ol className="flex min-h-0 flex-1 flex-col gap-2 overflow-y-auto bg-surface-muted p-3" aria-label="Messages">
              {thread.messages.map((m) => (
                <li key={m.id} className={cn('max-w-[85%] rounded-lg px-3 py-2 text-[13px] shadow-xs sm:max-w-[70%]',
                  m.direction === 'inbound' ? 'self-start border border-default bg-surface text-foreground' : 'self-end bg-brand-light text-foreground')}>
                  <p className={cn('whitespace-pre-wrap break-words', !m.body || /^\[[A-Z_]+\]$/.test(m.body) ? 'italic text-muted' : '')}>
                    {messageLabel(m.type, m.body)}
                  </p>
                  <p className="mt-1 flex items-center justify-end gap-1 text-[11px] text-subtle">
                    {m.direction === 'outbound' && m.sentBy && <span>{m.sentBy} ·</span>}
                    <time dateTime={m.at}>{stamp(m.at)}</time>
                    {m.direction === 'outbound' && (
                      m.status === 'failed' ? <TriangleAlert aria-label="Not delivered" className="size-3.5 text-danger" />
                        : m.status === 'read' ? <CheckCheck aria-label="Read" className="size-3.5 text-brand" />
                          : m.status === 'delivered' ? <CheckCheck aria-label="Delivered" className="size-3.5" />
                            : <Check aria-label="Sent" className="size-3.5" />
                    )}
                  </p>
                </li>
              ))}
            </ol>
            {thread.canReply ? (
              <Composer orgId={org.id} conversationId={thread.conversation.id} reply={thread.reply} templates={thread.templates} />
            ) : (
              <p className="border-t border-default p-3 text-[12px] text-muted">Read-only members can view conversations but not reply.</p>
            )}
          </section>
        ) : (
          <div className="hidden flex-1 items-center justify-center p-6 text-center text-[13px] text-muted md:flex">
            {openId ? 'This conversation is not available to you.' : 'Choose a conversation.'}
          </div>
        )}
      </div>
    </PageShell>
  )
}
