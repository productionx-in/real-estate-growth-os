// Shown to everyone in a workspace while REGrow support holds live access to it.
import Link from 'next/link'
import { Eye } from 'lucide-react'

export function SupportAccessBanner({ orgSlug, until, emergency, canManage }: { orgSlug: string; until: string; emergency: boolean; canManage: boolean }) {
  const time = new Intl.DateTimeFormat('en-IN', { timeStyle: 'short', dateStyle: 'medium', timeZone: 'Asia/Kolkata' }).format(new Date(until))
  return (
    <div role="status" className="flex flex-wrap items-center gap-x-3 gap-y-1 border-b border-default bg-info-bg px-4 py-2 text-[13px] text-foreground">
      <Eye aria-hidden className="size-4 text-info" />
      <span>
        <strong>{emergency ? 'Emergency support access is active' : 'REGrow support has read-only access'}</strong> until {time}.
      </span>
      {canManage && <Link href={`/${orgSlug}/support-access`} className="font-medium text-brand underline-offset-4 hover:underline">Review or end access</Link>}
    </div>
  )
}
