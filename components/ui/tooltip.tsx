'use client'
// components/ui/tooltip.tsx — for icon-only controls. Never the only place important information lives.
import * as React from 'react'
import * as TooltipPrimitive from '@radix-ui/react-tooltip'

export function Tooltip({ content, children, side = 'top' }: { content: string; children: React.ReactElement; side?: 'top' | 'bottom' | 'left' | 'right' }) {
  return (
    <TooltipPrimitive.Provider delayDuration={300}>
      <TooltipPrimitive.Root>
        <TooltipPrimitive.Trigger asChild>{children}</TooltipPrimitive.Trigger>
        <TooltipPrimitive.Portal>
          <TooltipPrimitive.Content
            side={side}
            sideOffset={6}
            className="z-50 rounded-md bg-foreground px-2 py-1 text-[12px] text-inverse shadow-md"
          >
            {content}
          </TooltipPrimitive.Content>
        </TooltipPrimitive.Portal>
      </TooltipPrimitive.Root>
    </TooltipPrimitive.Provider>
  )
}
