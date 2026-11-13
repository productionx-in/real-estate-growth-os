// components/inventory/InventoryStatusBadge.tsx
import { cn } from '@/lib/utils/cn'
import {
  INVENTORY_STATUS_LABELS,
  INVENTORY_STATUS_COLORS,
  type InventoryStatus,
} from '@/types/inventory'

interface InventoryStatusBadgeProps {
  status: InventoryStatus
  className?: string
  showDot?: boolean
}

export function InventoryStatusBadge({
  status,
  className,
  showDot = true,
}: InventoryStatusBadgeProps) {
  const label = INVENTORY_STATUS_LABELS[status] || status
  const style = INVENTORY_STATUS_COLORS[status] || INVENTORY_STATUS_COLORS.available

  return (
    <span
      className={cn(
        'inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-[11px] font-medium border transition-colors',
        style.bg,
        style.text,
        style.border,
        className
      )}
    >
      {showDot && (
        <span className={cn('w-1.5 h-1.5 rounded-full flex-shrink-0', style.dot)} />
      )}
      <span>{label}</span>
    </span>
  )
}
