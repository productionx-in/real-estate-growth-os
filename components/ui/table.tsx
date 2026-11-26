// components/ui/table.tsx — the one table design (the .data-table rules in app/globals.css): muted header on a soft
// band, quiet row dividers, a hover tint, tabular numbers, and a raised, horizontally scrolling frame on small screens.
// Alignment and padding stay with each cell (numbers right-aligned with `num`).
import * as React from 'react'
import { cn } from '@/lib/utils/cn'

/** The raised frame a table sits in; scrolls sideways on narrow screens. */
export function TableShell({ className, children }: { className?: string; children: React.ReactNode }) {
  return (
    <div className={cn('surface-raised overflow-hidden rounded-2xl border border-default bg-surface', className)}>
      <div className="overflow-x-auto">{children}</div>
    </div>
  )
}

export function Table({ className, ...props }: React.TableHTMLAttributes<HTMLTableElement>) {
  return <table className={cn('data-table w-full text-left', className)} {...props} />
}
export const THead = (p: React.HTMLAttributes<HTMLTableSectionElement>) => <thead {...p} />
export const TBody = (p: React.HTMLAttributes<HTMLTableSectionElement>) => <tbody {...p} />
export function TH({ className, num, ...props }: React.ThHTMLAttributes<HTMLTableCellElement> & { num?: boolean }) {
  return <th scope="col" className={cn('px-4 py-2.5', num && 'num text-right', className)} {...props} />
}
export function TD({ className, num, ...props }: React.TdHTMLAttributes<HTMLTableCellElement> & { num?: boolean }) {
  return <td className={cn('px-4 py-3', num && 'num text-right', className)} {...props} />
}
/** One row spanning the table with a friendly message. */
export function TableEmpty({ colSpan, children }: { colSpan: number; children: React.ReactNode }) {
  return <tr><td colSpan={colSpan} className="px-4 py-10 text-center text-[13px] text-muted">{children}</td></tr>
}
