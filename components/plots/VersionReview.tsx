'use client'
// components/plots/VersionReview.tsx — the review steps for one map version, and its history.
// Managers: submit for review, record QA. Owners and admins (the developer's approval): approve, send back, publish.
// The server re-checks the role and the order of steps (POST /api/plot-maps/versions/[id]/review).
import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { Alert, Button, Input } from '@/components/ui'
import { qaPassedSinceSubmit } from '@/lib/plots/version-groups'

export interface ReviewItem { action: string; comment: string | null; actorName: string | null; at: string }
type Action = 'submit' | 'qa_pass' | 'qa_fail' | 'approve' | 'reject' | 'publish'

const LABEL: Record<string, string> = {
  submitted: 'Submitted for review', qa_passed: 'QA passed', qa_failed: 'QA found problems', approved: 'Approved',
  rejected: 'Sent back', published: 'Published', superseded: 'Replaced by a newer version',
}
const when = (iso: string) => new Intl.DateTimeFormat('en-IN', { dateStyle: 'medium', timeStyle: 'short', timeZone: 'Asia/Kolkata' }).format(new Date(iso))

export function VersionReview({ orgId, versionId, status, canApprove, history }: {
  orgId: string; versionId: string; status: string; canApprove: boolean; history: ReviewItem[]
}) {
  const router = useRouter()
  const [comment, setComment] = useState('')
  const [busy, setBusy] = useState<Action | null>(null)
  const [error, setError] = useState<string | null>(null)
  const qaPassed = qaPassedSinceSubmit(history)

  async function act(action: Action) {
    if (action === 'publish' && !window.confirm('Publish this version? Your team and anyone with the buyer link will see it at once; the previous version is kept in history.')) return
    setBusy(action); setError(null)
    try {
      const res = await fetch(`/api/plot-maps/versions/${versionId}/review`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ orgId, action, ...(comment.trim() ? { comment: comment.trim() } : {}) }),
      })
      const out = await res.json().catch(() => ({}))
      if (!res.ok) { setError(out.error ?? 'Could not update.'); return }
      setComment(''); router.refresh()
    } catch { setError('Network error. Please try again.') } finally { setBusy(null) }
  }

  const buttons: { a: Action; label: string; show: boolean; tone?: 'secondary' | 'danger' }[] = [
    { a: 'submit', label: 'Submit for review', show: status === 'draft' || status === 'rejected' },
    { a: 'qa_pass', label: 'QA passed', show: status === 'in_review' && !qaPassed },
    { a: 'qa_fail', label: 'QA found problems', show: status === 'in_review', tone: 'secondary' },
    { a: 'approve', label: 'Approve', show: canApprove && status === 'in_review' && qaPassed },
    { a: 'reject', label: 'Send back', show: canApprove && (status === 'in_review' || status === 'approved'), tone: 'secondary' },
    { a: 'publish', label: 'Publish', show: canApprove && status === 'approved' },
  ]
  const visible = buttons.filter((b) => b.show)
  const needsComment = visible.some((b) => b.a === 'reject' || b.a === 'qa_fail')

  if (visible.length === 0 && !error && history.length === 0) return null
  return (
    <div className="space-y-2 border-t border-default pt-2">
      {visible.length > 0 && (
        <>
          {needsComment && <Input value={comment} maxLength={1000} onChange={(e) => setComment(e.target.value)} placeholder="Comment (needed to send back or report QA problems)" aria-label="Review comment" />}
          <div className="flex flex-wrap gap-1.5">
            {visible.map((b) => <Button key={b.a} size="sm" variant={b.tone ?? 'primary'} loading={busy === b.a} disabled={!!busy} onClick={() => act(b.a)}>{b.label}</Button>)}
          </div>
        </>
      )}
      {error && <Alert tone="danger">{error}</Alert>}
      {history.length > 0 && (
        <details className="text-[12px]">
          <summary className="cursor-pointer text-muted">History ({history.length})</summary>
          <ol className="mt-1 space-y-1">
            {history.slice(0, 20).map((h, i) => (
              <li key={i}><span className="font-medium text-foreground">{LABEL[h.action] ?? h.action}</span> · {h.actorName ?? 'Someone'} · {when(h.at)}{h.comment && <span className="block text-muted">“{h.comment}”</span>}</li>
            ))}
          </ol>
        </details>
      )}
    </div>
  )
}
