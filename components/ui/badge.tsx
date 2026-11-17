// components/ui/badge.tsx
import * as React from 'react'
import { cva, type VariantProps } from 'class-variance-authority'
import { cn } from '@/lib/utils/cn'

export const badgeVariants = cva('inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-[11px] font-medium', {
  variants: {
    tone: {
      neutral: 'bg-surface-hover text-muted border-default',
      brand: 'bg-brand-light text-brand border-transparent',
      success: 'bg-success-bg text-success border-transparent',
      warning: 'bg-warning-bg text-warning border-transparent',
      danger: 'bg-danger-bg text-danger border-transparent',
      info: 'bg-info-bg text-info border-transparent',
    },
  },
  defaultVariants: { tone: 'neutral' },
})

export function Badge({ className, tone, ...props }: React.HTMLAttributes<HTMLSpanElement> & VariantProps<typeof badgeVariants>) {
  return <span className={cn(badgeVariants({ tone }), className)} {...props} />
}
