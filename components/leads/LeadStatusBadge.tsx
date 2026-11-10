// components/leads/LeadStatusBadge.tsx
import { cn } from '@/lib/utils/cn'
import type { LeadStatus } from '@/types/app'

const STATUS_CONFIG: Record<
  LeadStatus,
  { label: string; className: string }
> = {
  new: {
    label: 'New',
    className: 'bg-blue-50 text-blue-700 border-blue-100',
  },
  contacted: {
    label: 'Contacted',
    className: 'bg-purple-50 text-purple-700 border-purple-100',
  },
  qualified: {
    label: 'Qualified',
    className: 'bg-indigo-50 text-indigo-700 border-indigo-100',
  },
  site_visit_scheduled: {
    label: 'Visit Scheduled',
    className: 'bg-orange-50 text-orange-700 border-orange-100',
  },
  site_visited: {
    label: 'Site Visited',
    className: 'bg-amber-50 text-amber-700 border-amber-100',
  },
  negotiation: {
    label: 'Negotiation',
    className: 'bg-yellow-50 text-yellow-700 border-yellow-100',
  },
  booked: {
    label: 'Booked',
    className: 'bg-green-50 text-green-700 border-green-100',
  },
  lost: {
    label: 'Lost',
    className: 'bg-red-50 text-red-600 border-red-100',
  },
  junk: {
    label: 'Junk',
    className: 'bg-gray-100 text-gray-500 border-gray-200',
  },
}

interface LeadStatusBadgeProps {
  status: LeadStatus
  className?: string
}

export function LeadStatusBadge({ status, className }: LeadStatusBadgeProps) {
  const config = STATUS_CONFIG[status] ?? STATUS_CONFIG.new
  return (
    <span
      className={cn(
        'inline-flex items-center px-2 py-0.5 rounded-full text-[11px] font-medium border',
        config.className,
        className
      )}
    >
      {config.label}
    </span>
  )
}
