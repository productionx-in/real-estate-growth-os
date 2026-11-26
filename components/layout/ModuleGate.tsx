'use client'
// components/layout/ModuleGate.tsx — a page of a module this workspace's plan doesn't include (switched off by RE by PX
// in the console) shows a plain explanation instead of a half-working screen. The server already refuses the module's
// APIs (lib/auth/entitlements.ts requireModule); this only covers someone opening the address directly.
import Link from 'next/link'
import { useSelectedLayoutSegment } from 'next/navigation'
import { Lock } from 'lucide-react'
import { MODULE_OF_SEGMENT } from '@/lib/navigation/nav'

export function ModuleGate({ disabled, orgSlug, labels, children }: { disabled: string[]; orgSlug: string; labels: Record<string, string>; children: React.ReactNode }) {
  const segment = useSelectedLayoutSegment()
  const mod = segment ? MODULE_OF_SEGMENT[segment] : undefined
  if (!mod || !disabled.includes(mod) || mod === 'teams') return <>{children}</>
  return (
    <div className="mx-auto flex max-w-md flex-col items-center px-6 py-20 text-center">
      <span className="grid size-12 place-items-center rounded-2xl bg-surface-muted text-muted"><Lock className="size-5" aria-hidden="true" /></span>
      <h1 className="mt-4 text-[18px] font-semibold text-foreground">{labels[mod] ?? 'This module'} isn’t in your plan</h1>
      <p className="mt-2 text-[14px] text-muted">Your RE by PX account manager can turn it on. See what’s included under Plan &amp; billing.</p>
      <Link href={`/${orgSlug}`} className="mt-6 text-[14px] font-medium text-brand hover:underline">Back to home</Link>
    </div>
  )
}
