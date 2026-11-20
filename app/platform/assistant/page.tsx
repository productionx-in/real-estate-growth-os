// app/platform/assistant/page.tsx — Rio insights (Platform Owner): what visitors ask, who answered (which AI
// provider and model, or the offline guide), quality from thumbs up/down, and the training-data export.
// Counts only for customer workspace conversations; their text is never shown or exported.
import type { Metadata } from 'next'
import { notFound } from 'next/navigation'
import { Bot, Download, MessageSquare, PhoneCall, ThumbsUp } from 'lucide-react'
import { getConsoleAccess } from '@/lib/auth/platform'
import { createServiceClient } from '@/lib/supabase/server'
import { can, type Db, type StaffRole } from '@/lib/platform/portal'
import { configuredProviders } from '@/lib/support/providers'
import { FocusTile, FunnelBars, PageHeader, TableCard, Td, Th } from '@/components/platform/ConsoleUI'
import { Panel } from '@/components/platform/DashboardWidgets'

export const metadata: Metadata = { title: 'Rio insights' }
export const dynamic = 'force-dynamic'
function loadLast30Days(db: Db) {
  const since = new Date(Date.now() - 30 * 86_400_000).toISOString()
  return Promise.all([
    db.from('assistant_conversations').select('context, callback_saved').gte('started_at', since).limit(20000),
    db.from('assistant_messages').select('source, provider, model, rating, handoff, latency_ms').eq('role', 'assistant').gte('created_at', since).limit(50000),
  ])
}
const pct = (a: number, b: number) => (b ? `${Math.round((100 * a) / b)}%` : '—')

export default async function RioInsights() {
  const access = await getConsoleAccess()
  if (access.state !== 'ok') return null
  if (!can(access.role as StaffRole, 'staff')) notFound()
  const [convs, answers] = await loadLast30Days(createServiceClient() as unknown as Db)
  const c = convs.data ?? [], a = answers.data ?? []
  const rated = a.filter((m) => m.rating !== null)
  const by = new Map<string, number>()
  for (const m of a) { const k = m.source === 'offline' ? 'Offline guide' : `${m.provider} · ${m.model}`; by.set(k, (by.get(k) ?? 0) + 1) }
  const providers = configuredProviders()
  const lat = a.filter((m) => m.latency_ms).map((m) => m.latency_ms as number).sort((x, y) => x - y)

  return (
    <div className="space-y-6">
      <PageHeader title="Rio insights" description="Every conversation with Rio is saved (redacted) for research and to train REGrow's own assistant later. Last 30 days. Customer workspace conversations are counted but never shown or exported."
        actions={<>
          {/* eslint-disable-next-line @next/next/no-html-link-for-pages -- a file download from an API route, not a page */}
          <a href="/api/platform/assistant/export?rated=good" className="inline-flex min-h-10 items-center gap-2 rounded-lg border border-default bg-surface px-4 text-[13px] font-medium hover:bg-surface-hover"><Download className="size-4" aria-hidden="true" />Export rated 👍</a>
          {/* eslint-disable-next-line @next/next/no-html-link-for-pages -- a file download from an API route, not a page */}
          <a href="/api/platform/assistant/export" className="inline-flex min-h-10 items-center gap-2 rounded-lg bg-brand px-4 text-[13px] font-medium text-brand-foreground hover:bg-brand-hover"><Download className="size-4" aria-hidden="true" />Export all (JSONL)</a>
        </>} />
      <section className="grid grid-cols-2 gap-3 sm:gap-4 xl:grid-cols-4">
        <FocusTile label="Conversations" value={c.length} icon={MessageSquare} href="/platform/assistant" hint={`${c.filter((x) => x.context === 'website').length} website · ${c.filter((x) => x.context === 'workspace').length} workspace`} />
        <FocusTile label="Answers rated helpful" value={pct(rated.filter((m) => m.rating === 1).length, rated.length)} icon={ThumbsUp} tone="good" href="/platform/assistant" hint={`${rated.length} of ${a.length} answers rated`} />
        <FocusTile label="Handed to a person" value={pct(a.filter((m) => m.handoff).length, a.length)} icon={Bot} href="/platform/assistant" hint="Lower is better, if ratings stay high" />
        <FocusTile label="Callbacks requested" value={c.filter((x) => x.callback_saved).length} icon={PhoneCall} tone="good" href="/platform/sales?owner=none" hint="In Sales, campaign rio-chat" />
      </section>
      <div className="grid gap-4 lg:grid-cols-3">
        <Panel title="Who answered" className="lg:col-span-2">
          <FunnelBars rows={[...by.entries()].sort((x, y) => y[1] - x[1]).map(([label, value]) => ({ label, value }))} />
          {lat.length > 0 && <p className="mt-4 text-[12px] text-muted">AI response time: median {Math.round(lat[Math.floor(lat.length / 2)] / 100) / 10}s</p>}
        </Panel>
        <Panel title="AI providers in use">
          {providers.length === 0 ? <p className="text-[13px] text-muted">None configured — Rio answers from its offline guide. Add ANTHROPIC_API_KEY, OPENAI_API_KEY or GEMINI_API_KEY (with a model) in Vercel.</p> : (
            <div className="-mx-5 -mb-5"><TableCard minWidth={0} className="rounded-none border-0 shadow-none">
              <thead><tr><Th>Order</Th><Th>Provider</Th><Th>Model</Th></tr></thead>
              <tbody>{providers.map((p, i) => <tr key={p.name}><Td>{i === 0 ? 'First' : 'Fallback'}</Td><Td className="font-medium">{p.name}</Td><Td className="text-muted">{p.model}</Td></tr>)}</tbody>
            </TableCard></div>
          )}
        </Panel>
      </div>
    </div>
  )
}
