'use client'
// components/ui/dropdown-menu.tsx — Radix DropdownMenu: arrow-key navigation, typeahead, Escape, focus return.
import * as React from 'react'
import * as Menu from '@radix-ui/react-dropdown-menu'
import { Check } from 'lucide-react'
import { cn } from '@/lib/utils/cn'

export const DropdownMenu = Menu.Root
export const DropdownMenuTrigger = Menu.Trigger
export const DropdownMenuGroup = Menu.Group

export function DropdownMenuContent({ className, sideOffset = 6, ...props }: React.ComponentPropsWithoutRef<typeof Menu.Content>) {
  return (
    <Menu.Portal>
      <Menu.Content
        sideOffset={sideOffset}
        className={cn('anim-menu z-50 min-w-44 rounded-xl border border-default bg-surface p-1 [box-shadow:var(--edge-highlight),var(--shadow-lg)]', className)}
        {...props}
      />
    </Menu.Portal>
  )
}

export function DropdownMenuItem({ className, destructive, ...props }: React.ComponentPropsWithoutRef<typeof Menu.Item> & { destructive?: boolean }) {
  return (
    <Menu.Item
      className={cn(
        'flex cursor-pointer select-none items-center gap-2 rounded-md px-2.5 py-1.5 text-[13px] outline-none',
        'data-[highlighted]:bg-surface-hover data-[disabled]:pointer-events-none data-[disabled]:opacity-50 [&_svg]:size-4',
        destructive ? 'text-danger' : 'text-foreground',
        className
      )}
      {...props}
    />
  )
}

/** A toggle inside a menu (role menuitemcheckbox). Keeps the menu open so several can be ticked. */
export function DropdownMenuCheckboxItem({ className, children, onSelect, ...props }: React.ComponentPropsWithoutRef<typeof Menu.CheckboxItem>) {
  return (
    <Menu.CheckboxItem
      onSelect={(e) => { e.preventDefault(); onSelect?.(e) }}
      className={cn(
        'group relative flex cursor-pointer select-none items-center gap-2 rounded-md py-1.5 pl-8 pr-2.5 text-[13px] text-foreground outline-none',
        'data-[highlighted]:bg-surface-hover data-[disabled]:pointer-events-none data-[disabled]:opacity-50',
        className
      )}
      {...props}
    >
      <span className="absolute left-2.5 flex size-4 items-center justify-center rounded border border-strong group-data-[state=checked]:border-brand group-data-[state=checked]:bg-brand">
        <Menu.ItemIndicator><Check aria-hidden className="size-3 text-brand-foreground" /></Menu.ItemIndicator>
      </span>
      {children}
    </Menu.CheckboxItem>
  )
}

/** One choice of several (role menuitemradio). Keeps the menu open so the effect can be seen. */
export const DropdownMenuRadioGroup = Menu.RadioGroup
export function DropdownMenuRadioItem({ className, children, onSelect, ...props }: React.ComponentPropsWithoutRef<typeof Menu.RadioItem>) {
  return (
    <Menu.RadioItem
      onSelect={(e) => { e.preventDefault(); onSelect?.(e) }}
      className={cn(
        'relative flex cursor-pointer select-none items-center gap-2 rounded-md py-1.5 pl-8 pr-2.5 text-[13px] text-foreground outline-none [&_svg]:size-4',
        'data-[highlighted]:bg-surface-hover data-[disabled]:pointer-events-none data-[disabled]:opacity-50',
        className
      )}
      {...props}
    >
      <span className="absolute left-2.5 flex size-4 items-center justify-center">
        <Menu.ItemIndicator><Check aria-hidden className="size-4 text-brand" /></Menu.ItemIndicator>
      </span>
      {children}
    </Menu.RadioItem>
  )
}

export function DropdownMenuLabel({ className, ...props }: React.ComponentPropsWithoutRef<typeof Menu.Label>) {
  return <Menu.Label className={cn('px-2.5 py-1.5 text-[11px] font-semibold uppercase tracking-wide text-subtle', className)} {...props} />
}

export function DropdownMenuSeparator({ className, ...props }: React.ComponentPropsWithoutRef<typeof Menu.Separator>) {
  return <Menu.Separator className={cn('my-1 h-px bg-[var(--border)]', className)} {...props} />
}
