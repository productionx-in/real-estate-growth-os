// components/ui/alert.tsx
import * as React from 'react'
import { AlertTriangle, CheckCircle2, Info, XCircle } from 'lucide-react'
import { cn } from '@/lib/utils/cn'

const TONES = {
  info: { box: 'bg-info-bg text-info', Icon: Info },
  success: { box: 'bg-success-bg text-success', Icon: CheckCircle2 },
  warning: { box: 'bg-warning-bg text-warning', Icon: AlertTriangle },
  danger: { box: 'bg-danger-bg text-danger', Icon: XCircle },
} as const

interface AlertProps extends React.HTMLAttributes<HTMLDivElement> {
  tone?: keyof typeof TONES
  title?: string
}

/** Inline message. Danger alerts are announced immediately (role=alert); others politely (role=status). */
export function Alert({ tone = 'info', title, className, children, ...props }: AlertProps) {
  const { box, Icon } = TONES[tone]
  return (
    <div role={tone === 'danger' ? 'alert' : 'status'} className={cn('flex gap-2.5 rounded-lg p-3 text-[13px]', box, className)} {...props}>
      <Icon aria-hidden className="mt-0.5 size-4 shrink-0" />
      <div className="min-w-0 text-foreground">
        {title && <p className="font-semibold">{title}</p>}
        {children && <div className={cn(title && 'mt-0.5', 'text-muted')}>{children}</div>}
      </div>
    </div>
  )
}
