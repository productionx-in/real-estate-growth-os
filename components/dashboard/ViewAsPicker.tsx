'use client'
// components/dashboard/ViewAsPicker.tsx — owners, admins and managers preview the home page as a team member sees it
// (?as=<profile id>). The server checks who may be viewed; this only changes the address.
import { useRouter, useSearchParams } from 'next/navigation'
import { Select } from '@/components/ui'
import { Eye } from 'lucide-react'

export function ViewAsPicker({ members, current }: { members: { id: string; label: string }[]; current: string | null }) {
  const router = useRouter()
  const params = useSearchParams()
  return (
    <label className="inline-flex items-center gap-2 text-[13px] text-muted">
      <Eye aria-hidden className="size-4" />
      <span>View as</span>
      <Select value={current ?? ''}
        onChange={(e) => {
          const next = new URLSearchParams(params.toString())
          if (e.target.value) next.set('as', e.target.value); else next.delete('as')
          router.push(`?${next.toString()}`)
        }}>
        <option value="">Myself</option>
        {members.map((m) => <option key={m.id} value={m.id}>{m.label}</option>)}
      </Select>
    </label>
  )
}
