'use client'
// components/ui/sheet.tsx — a side panel for details and editing without leaving the page (a lead, a unit, a listing).
// Same dimmer and focus handling as Dialog (Radix): Escape and the dimmer close it, focus is trapped and returned.
// Slides in from the right on larger screens; on phones it becomes a bottom sheet like every other overlay.
import * as React from 'react'
import * as DialogPrimitive from '@radix-ui/react-dialog'
import { X } from 'lucide-react'
import { cn } from '@/lib/utils/cn'

export const Sheet = DialogPrimitive.Root
export const SheetTrigger = DialogPrimitive.Trigger
export const SheetClose = DialogPrimitive.Close

export function SheetContent({ title, description, className, children, ...props }:
  React.ComponentPropsWithoutRef<typeof DialogPrimitive.Content> & { title: string; description?: string }) {
  return (
    <DialogPrimitive.Portal>
      <DialogPrimitive.Overlay className="anim-overlay fixed inset-0 z-50 bg-overlay backdrop-blur-sm" />
      <DialogPrimitive.Content
        className={cn(
          'anim-side fixed z-50 flex flex-col border-default bg-surface [box-shadow:var(--edge-highlight),var(--shadow-2xl)]',
          'sm:inset-y-0 sm:right-0 sm:w-[min(520px,100vw)] sm:border-l sm:rounded-l-3xl',
          'max-sm:inset-x-0 max-sm:bottom-0 max-sm:max-h-[92dvh] max-sm:rounded-t-3xl max-sm:border-t max-sm:pb-[env(safe-area-inset-bottom)]',
          className,
        )}
        {...props}
      >
        <div className="flex items-start justify-between gap-3 border-b border-default px-5 py-4">
          <div className="min-w-0">
            <DialogPrimitive.Title className="text-[15px] font-semibold text-foreground">{title}</DialogPrimitive.Title>
            <DialogPrimitive.Description className={description ? 'mt-0.5 text-[13px] text-muted' : 'sr-only'}>{description ?? title}</DialogPrimitive.Description>
          </div>
          <DialogPrimitive.Close aria-label="Close" className="rounded-md p-1.5 text-subtle hover:bg-surface-hover hover:text-foreground"><X aria-hidden className="size-4" /></DialogPrimitive.Close>
        </div>
        <div className="min-h-0 flex-1 overflow-y-auto px-5 py-4">{children}</div>
      </DialogPrimitive.Content>
    </DialogPrimitive.Portal>
  )
}

export function SheetFooter({ className, ...props }: React.HTMLAttributes<HTMLDivElement>) {
  return <div className={cn('-mx-5 -mb-4 mt-4 flex justify-end gap-2 border-t border-default bg-surface-muted px-5 py-3', className)} {...props} />
}
