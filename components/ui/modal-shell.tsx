'use client'
// components/ui/modal-shell.tsx — the one overlay for larger editors and wizards that bring their own header and
// footer (inventory, integrations, team, hierarchy). Same behaviour as Dialog and Sheet (Radix): the dimmer, focus
// kept inside and returned afterwards, Escape and a click outside to close, the page behind made inert; the same
// entrance and elevation. Phones get a bottom sheet. For a simple form, use Dialog (title + body) or Sheet instead.
import * as React from 'react'
import * as DialogPrimitive from '@radix-ui/react-dialog'
import { cn } from '@/lib/utils/cn'

const WIDTH = { sm: 'sm:max-w-sm', md: 'sm:max-w-md', lg: 'sm:max-w-2xl', xl: 'sm:max-w-3xl', full: 'sm:max-w-6xl' } as const

export function ModalShell({ open = true, onClose, label, description, size = 'md', variant = 'dialog', className, children }: {
  open?: boolean
  onClose: () => void
  /** The accessible name (the panel shows its own visible header). */
  label: string
  description?: string
  size?: keyof typeof WIDTH
  /** dialog: centred; drawer: from the right edge (details beside the list). */
  variant?: 'dialog' | 'drawer'
  className?: string
  children: React.ReactNode
}) {
  return (
    <DialogPrimitive.Root open={open} onOpenChange={(o) => { if (!o) onClose() }}>
      <DialogPrimitive.Portal>
        <DialogPrimitive.Overlay className="anim-overlay fixed inset-0 z-50 bg-overlay backdrop-blur-sm" />
        <DialogPrimitive.Content
          className={cn(
            'fixed z-50 flex flex-col overflow-y-auto border-default bg-surface [box-shadow:var(--edge-highlight),var(--shadow-2xl)] focus:outline-none',
            variant === 'drawer'
              ? 'anim-side sm:inset-y-0 sm:right-0 sm:w-[min(640px,100vw)] sm:border-l sm:rounded-l-3xl'
              : cn('anim-dialog sm:left-1/2 sm:top-1/2 sm:w-[calc(100vw-2rem)] sm:-translate-x-1/2 sm:-translate-y-1/2 sm:max-h-[calc(100dvh-2rem)] sm:rounded-3xl sm:border', WIDTH[size]),
            'max-sm:inset-x-0 max-sm:bottom-0 max-sm:max-h-[92dvh] max-sm:rounded-t-3xl max-sm:border-t max-sm:pb-[env(safe-area-inset-bottom)]',
            className,
          )}
        >
          <DialogPrimitive.Title className="sr-only">{label}</DialogPrimitive.Title>
          <DialogPrimitive.Description className="sr-only">{description ?? label}</DialogPrimitive.Description>
          {children}
        </DialogPrimitive.Content>
      </DialogPrimitive.Portal>
    </DialogPrimitive.Root>
  )
}
