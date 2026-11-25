'use client'
// components/ui/dialog.tsx — Radix Dialog: focus trap, Escape to close, focus returns to the trigger, aria wiring.
import * as React from 'react'
import * as DialogPrimitive from '@radix-ui/react-dialog'
import { X } from 'lucide-react'
import { cn } from '@/lib/utils/cn'

export const Dialog = DialogPrimitive.Root
export const DialogTrigger = DialogPrimitive.Trigger
export const DialogClose = DialogPrimitive.Close

export function DialogContent({
  className,
  children,
  title,
  description,
  ...props
}: React.ComponentPropsWithoutRef<typeof DialogPrimitive.Content> & { title: string; description?: string }) {
  return (
    <DialogPrimitive.Portal>
      <DialogPrimitive.Overlay className="anim-overlay fixed inset-0 z-50 bg-overlay backdrop-blur-sm" />
      <DialogPrimitive.Content
        className={cn(
          // Desktop: centred, rising from slightly behind the page. Phone: a bottom sheet with a grab handle.
          'anim-dialog fixed z-50 overflow-y-auto border border-default bg-surface p-5 [box-shadow:var(--edge-highlight),var(--shadow-2xl)]',
          'sm:left-1/2 sm:top-1/2 sm:w-[calc(100vw-2rem)] sm:max-w-lg sm:-translate-x-1/2 sm:-translate-y-1/2 sm:max-h-[calc(100dvh-2rem)] sm:rounded-3xl',
          'max-sm:inset-x-0 max-sm:bottom-0 max-sm:max-h-[90dvh] max-sm:rounded-t-3xl max-sm:pb-[calc(1.25rem+env(safe-area-inset-bottom))] max-sm:pt-6',
          'max-sm:before:absolute max-sm:before:left-1/2 max-sm:before:top-2 max-sm:before:h-1 max-sm:before:w-10 max-sm:before:-translate-x-1/2 max-sm:before:rounded-full max-sm:before:bg-strong',
          className
        )}
        {...props}
      >
        <DialogPrimitive.Title className="pr-8 text-[15px] font-semibold text-foreground">{title}</DialogPrimitive.Title>
        {description ? (
          <DialogPrimitive.Description className="mt-1 text-[13px] text-muted">{description}</DialogPrimitive.Description>
        ) : (
          <DialogPrimitive.Description className="sr-only">{title}</DialogPrimitive.Description>
        )}
        <div className="mt-4">{children}</div>
        <DialogPrimitive.Close
          aria-label="Close"
          className="absolute right-3 top-3 rounded-md p-1.5 text-subtle hover:bg-surface-hover hover:text-foreground"
        >
          <X aria-hidden className="size-4" />
        </DialogPrimitive.Close>
      </DialogPrimitive.Content>
    </DialogPrimitive.Portal>
  )
}

export function DialogFooter({ className, ...props }: React.HTMLAttributes<HTMLDivElement>) {
  return <div className={cn('mt-5 flex flex-col-reverse gap-2 sm:flex-row sm:justify-end', className)} {...props} />
}
