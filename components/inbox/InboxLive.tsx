'use client'
// components/inbox/InboxLive.tsx — keeps the inbox current (refresh every 15 s while the tab is visible) and
// marks the open conversation as read.
import { useEffect } from 'react'
import { useRouter } from 'next/navigation'

export function InboxLive({ orgId, conversationId, unread }: { orgId: string; conversationId: string | null; unread: number }) {
  const router = useRouter()
  useEffect(() => {
    const t = setInterval(() => { if (document.visibilityState === 'visible') router.refresh() }, 15_000)
    return () => clearInterval(t)
  }, [router])
  useEffect(() => {
    if (!conversationId || unread === 0) return
    fetch(`/api/whatsapp/conversations/${conversationId}/read`, {
      method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ orgId }),
    }).then((r) => { if (r.ok) router.refresh() }).catch(() => {})
  }, [conversationId, unread, orgId, router])
  return null
}
