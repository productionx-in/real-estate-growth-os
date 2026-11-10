// components/shared/EmptyState.tsx
import { LucideIcon } from 'lucide-react'

interface EmptyStateProps {
  icon?: LucideIcon
  title: string
  description?: string
  action?: React.ReactNode
}

export function EmptyState({ icon: Icon, title, description, action }: EmptyStateProps) {
  return (
    <div className="flex flex-col items-center justify-center py-16 text-center">
      {Icon && (
        <div className="w-12 h-12 rounded-xl bg-[var(--surface-hover)] flex items-center justify-center mb-4">
          <Icon className="w-6 h-6 text-[var(--foreground-subtle)]" />
        </div>
      )}
      <h3 className="text-[14px] font-medium text-[var(--foreground)]">{title}</h3>
      {description && (
        <p className="mt-1 text-[13px] text-[var(--foreground-muted)] max-w-sm">{description}</p>
      )}
      {action && <div className="mt-4">{action}</div>}
    </div>
  )
}
