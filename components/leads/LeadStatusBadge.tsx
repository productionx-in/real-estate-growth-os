// components/leads/LeadStatusBadge.tsx
import { cn } from '@/lib/utils/cn'
import type { LeadStatus } from '@/types/app'

const STATUS_CONFIG: Record<
  LeadStatus,
  { label: string; className: string }
> = {
  new: {
    label: 'New',
    className: 'bg-brand-light text-brand border-brand/30',
  },
  contacted: {
    label: 'Contacted',
    className: 'bg-accent-bg text-accent border-accent-border',
  },
  qualified: {
    label: 'Qualified',
    className: 'bg-accent-bg text-accent border-accent-border',
  },
  site_visit_scheduled: {
    label: 'Visit Scheduled',
    className: 'bg-warning-bg text-warning border-warning/30',
  },
  site_visited: {
    label: 'Site Visited',
    className: 'bg-warning-bg text-warning border-warning/30',
  },
  negotiation: {
    label: 'Negotiation',
    className: 'bg-warning-bg text-warning border-warning/30',
  },
  booked: {
    label: 'Booked',
    className: 'bg-success-bg text-success border-success/30',
  },
  lost: {
    label: 'Lost',
    className: 'bg-danger-bg text-danger border-danger/30',
  },
  junk: {
    label: 'Junk',
    className: 'bg-surface-hover text-subtle border-default',
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
