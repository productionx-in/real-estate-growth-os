// app/api/platform/assistant/export/route.ts — Rio's conversations as a training dataset (JSONL, one conversation
// per line in chat format). Platform Owner only, MFA-verified, audited. Website and sign-in conversations only:
// customer workspace conversations are never exported (staff never read customer business data).
import { NextResponse, type NextRequest } from 'next/server'
import { staffActor } from '@/lib/platform/route-auth'
import { exportConversations } from '@/lib/support/memory'

export async function GET(request: NextRequest) {
  const a = await staffActor('staff')
  if (!a.success) return a.response
  const since = request.nextUrl.searchParams.get('since')
  const onlyRatedGood = request.nextUrl.searchParams.get('rated') === 'good'
  const rows = await exportConversations(a.db as never, { since: since && /^\d{4}-\d{2}-\d{2}$/.test(since) ? since : undefined, onlyRatedGood })
  const { error } = await a.db.from('platform_audit_logs').insert({
    actor_user_id: a.actor.userId, actor_role: a.actor.role, action: 'assistant.exported', target_entity_type: 'assistant_conversations',
    target_entity_id: a.actor.userId, metadata: { conversations: rows.length, since: since ?? null, only_rated_good: onlyRatedGood },
  })
  if (error) return NextResponse.json({ error: 'Could not record the export in the audit log.' }, { status: 500 })
  return new NextResponse(rows.map((r) => JSON.stringify(r)).join('\n') + (rows.length ? '\n' : ''), {
    headers: { 'Content-Type': 'application/x-ndjson; charset=utf-8', 'Content-Disposition': `attachment; filename="rio-conversations-${new Date().toISOString().slice(0, 10)}.jsonl"`, 'Cache-Control': 'no-store' },
  })
}
