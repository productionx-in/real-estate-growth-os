// app/platform/email/page.tsx — application e-mail health: is the sender configuration valid, what is queued, held
// or failed, and a way to retry. Shows no credentials, no message content and only masked recipient addresses.
// Supabase Auth e-mails (password reset, sign-up) are sent by Supabase with its own SMTP settings and are not here.
import type { Metadata } from 'next'
import { getConsoleAccess } from '@/lib/auth/platform'
import { can, type StaffRole } from '@/lib/platform/portal'
import { emailHealth } from '@/lib/email/service'
import { createServiceClient } from '@/lib/supabase/server'
import { Alert, Badge, Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui'
import { PageHeader, TableCard, Td, Th } from '@/components/platform/ConsoleUI'
import { RetryEmailsButton } from '@/components/platform/RetryEmailsButton'

export const metadata: Metadata = { title: 'E-mail' }
export const dynamic = 'force-dynamic'

const when = (iso: string) => new Intl.DateTimeFormat('en-IN', { dateStyle: 'medium', timeStyle: 'short', timeZone: 'Asia/Kolkata' }).format(new Date(iso))

export default async function EmailHealthPage() {
  const access = await getConsoleAccess()
  if (access.state !== 'ok') return null
  if (!can(access.role as StaffRole, 'email')) return <Alert tone="warning">Only the Platform Owner and platform admins see e-mail delivery.</Alert>
  const h = await emailHealth(createServiceClient())
  const valid = h.config.problems.length === 0
  return (
    <div className="space-y-5">
      <PageHeader title="E-mail" description="Every e-mail RE sends from the app goes through one outbox: queued, retried with backoff, and never dropped. Password-reset and sign-up e-mails are sent by Supabase (its own SMTP settings) and are not listed here." />
      <Card className={valid ? '' : 'border-danger/40'}>
        <CardHeader>
          <div>
            <CardTitle>Sender configuration {valid ? <Badge tone="success">Valid</Badge> : <Badge tone="danger">Needs fixing</Badge>}</CardTitle>
            <CardDescription>Read from the environment at every send. Changing it needs no change to queued e-mails.</CardDescription>
          </div>
        </CardHeader>
        <CardContent className="space-y-2 text-[13px]">
          <p><span className="text-muted">Provider:</span> {h.config.provider} <span className="text-muted">({h.config.source.provider === 'EMAIL_PROVIDER' ? 'EMAIL_PROVIDER' : 'inferred'})</span> · <span className="text-muted">key:</span> {h.config.apiKeyPresent ? 'present' : 'missing'}</p>
          <p><span className="text-muted">From:</span> {h.config.from ?? '—'} <span className="text-muted">({h.config.source.from})</span></p>
          <p><span className="text-muted">Reply-to:</span> {h.config.replyTo ?? '—'}</p>
          {h.config.problems.map((p) => <Alert key={p} tone="danger">{p}</Alert>)}
        </CardContent>
      </Card>
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-6">
        {([['Sent (24 h)', h.sentLast24h], ['Queued', h.counts.queued], ['Sending', h.counts.sending], ['Held', h.counts.held], ['Failed', h.counts.failed], ['Cancelled', h.counts.cancelled]] as const).map(([l, n]) => (
          <Card key={l}><CardContent className="p-4"><p className="text-[12px] text-muted">{l}</p><p className={`text-[22px] font-semibold tabular-nums ${(l === 'Held' || l === 'Failed') && n ? 'text-danger' : ''}`}>{n}</p></CardContent></Card>
        ))}
      </div>
      <Card>
        <CardHeader>
          <div className="flex w-full flex-wrap items-center justify-between gap-3">
            <div>
              <CardTitle>Needs attention</CardTitle>
              <CardDescription>Held e-mails go out on their own once the configuration is valid. Failed ones (e.g. an invalid address) only on retry.</CardDescription>
            </div>
            {h.attention.length > 0 && <RetryEmailsButton />}
          </div>
        </CardHeader>
        <CardContent className="p-0">
          {h.attention.length === 0 ? <p className="px-5 pb-5 text-[13px] text-muted">Nothing held or failed.</p> : (
            <TableCard minWidth={760}>
              <thead><tr><Th>E-mail</Th><Th>To</Th><Th>Workspace</Th><Th>Status</Th><Th>Tries</Th><Th>Reason</Th><Th>Updated</Th></tr></thead>
              <tbody>
                {h.attention.map((r) => (
                  <tr key={r.id} className="border-t border-default">
                    <Td>{r.template}</Td><Td>{r.recipient}</Td><Td>{r.org ?? 'RE'}</Td>
                    <Td><Badge tone={r.status === 'held' ? 'warning' : 'danger'}>{r.status}</Badge></Td>
                    <Td className="tabular-nums">{r.attempts}</Td>
                    <Td className="max-w-[260px] truncate text-muted">{r.errorKind ? `${r.errorKind}: ` : ''}{r.error ?? '—'}</Td>
                    <Td className="text-muted">{when(r.updatedAt)}</Td>
                  </tr>
                ))}
              </tbody>
            </TableCard>
          )}
        </CardContent>
      </Card>
    </div>
  )
}
