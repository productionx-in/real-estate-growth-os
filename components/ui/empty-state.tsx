// components/ui/empty-state.tsx
import * as React from 'react'
import type { LucideIcon } from 'lucide-react'

export function EmptyState({ icon: Icon, title, description, action }: { icon?: LucideIcon; title: string; description?: string; action?: React.ReactNode }) {
  return (
    <div className="flex flex-col items-center justify-center px-4 py-16 text-center">
      {Icon && (
        // Three stacked tiles in perspective, the front one carrying the icon: depth without an illustration to load.
        <div aria-hidden className="empty-stack relative mb-5 size-16 [perspective:600px]">
          <span className="absolute inset-0 rounded-2xl border border-default bg-surface-hover [transform:translate3d(10px,-8px,-30px)_rotate(8deg)] opacity-60" />
          <span className="absolute inset-0 rounded-2xl border border-default bg-surface-hover [transform:translate3d(-8px,-4px,-15px)_rotate(-6deg)] opacity-80" />
          <span className="surface-raised absolute inset-0 flex items-center justify-center rounded-2xl border border-default bg-surface">
            <Icon className="size-7 text-brand" />
          </span>
        </div>
      )}
      <h3 className="text-[14px] font-medium text-foreground">{title}</h3>
      {description && <p className="mt-1 max-w-sm text-[13px] text-muted">{description}</p>}
      {action && <div className="mt-4">{action}</div>}
    </div>
  )
}
