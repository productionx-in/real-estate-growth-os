'use client'
// components/platform/ConsoleShell.tsx — the internal console's frame: dark navigation rail (drawer on phones),
// page header with the signed-in staff member. Which links appear is decided on the server (layout.tsx);
// every page and API route checks the role again.
import { useEffect, useState } from 'react'
import Link from 'next/link'
import { usePathname } from 'next/navigation'
import {
  Building2, CreditCard, LayoutDashboard, LifeBuoy, Menu, PlusCircle, ScrollText, TrendingUp, UserCog, X,
  type LucideIcon,
} from 'lucide-react'
import { cn } from '@/lib/utils/cn'

export type ConsoleIcon = 'dashboard' | 'organisations' | 'provision' | 'sales' | 'support' | 'payments' | 'audit' | 'staff'
export interface ConsoleNavItem { href: string; label: string; icon: ConsoleIcon; badge?: number; badgeTone?: 'alert' | 'info' }
export interface ConsoleNavGroup { label: string; items: ConsoleNavItem[] }

const ICONS: Record<ConsoleIcon, LucideIcon> = {
  dashboard: LayoutDashboard, organisations: Building2, provision: PlusCircle, sales: TrendingUp,
  support: LifeBuoy, payments: CreditCard, audit: ScrollText, staff: UserCog,
}

function isActive(pathname: string, href: string) {
  return href === '/platform' ? pathname === '/platform' : pathname === href || pathname.startsWith(`${href}/`)
}

function Rail({ groups, onNavigate }: { groups: ConsoleNavGroup[]; onNavigate?: () => void }) {
  const pathname = usePathname() ?? ''
  return (
    <nav aria-label="Console" className="flex-1 space-y-6 overflow-y-auto px-3 py-5">
      {groups.map((g) => (
        <div key={g.label}>
          <p className="px-3 pb-2 text-[11px] font-semibold uppercase tracking-wider text-rail-muted">{g.label}</p>
          <ul className="space-y-1">
            {g.items.map((item) => {
              const Icon = ICONS[item.icon]
              const active = isActive(pathname, item.href)
              return (
                <li key={item.href}>
                  <Link href={item.href} onClick={onNavigate} aria-current={active ? 'page' : undefined}
                    className={cn(
                      'flex min-h-11 items-center gap-3 rounded-lg px-3 text-[13px] font-medium transition-colors duration-150',
                      active ? 'bg-highlight-soft text-rail-strong' : 'text-rail-text hover:bg-rail-hover hover:text-rail-strong',
                    )}>
                    <Icon className={cn('size-[18px] shrink-0', active ? 'text-highlight' : 'text-rail-muted')} aria-hidden="true" />
                    <span className="flex-1 truncate">{item.label}</span>
                    {item.badge ? (
                      <span aria-label={`${item.badge} need attention`}
                        className={cn('min-w-5 rounded-full px-1.5 py-0.5 text-center text-[11px] font-semibold tabular-nums',
                          item.badgeTone === 'alert' ? 'bg-danger text-danger-foreground' : 'bg-highlight text-highlight-foreground')}>
                        {item.badge > 99 ? '99+' : item.badge}
                      </span>
                    ) : null}
                  </Link>
                </li>
              )
            })}
          </ul>
        </div>
      ))}
    </nav>
  )
}

function Brand() {
  return (
    <Link href="/platform" className="flex items-center gap-2.5 px-6 py-5">
      <span className="grid size-8 place-items-center rounded-lg bg-highlight text-[13px] font-bold text-highlight-foreground">RG</span>
      <span className="text-[13px] font-semibold uppercase tracking-wider text-rail-strong">REGrow console</span>
    </Link>
  )
}

export function ConsoleShell({ groups, userLabel, roleLabel, children }: {
  groups: ConsoleNavGroup[]; userLabel: string; roleLabel: string; children: React.ReactNode
}) {
  const [open, setOpen] = useState(false)
  useEffect(() => {
    if (!open) return
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') setOpen(false) }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [open])

  const initial = (userLabel.trim()[0] ?? '?').toUpperCase()
  return (
    <div className="min-h-dvh bg-background text-foreground md:flex">
      {/* Desktop rail */}
      <aside className="sticky top-0 hidden h-dvh w-[248px] shrink-0 flex-col border-r border-rail-border bg-rail md:flex">
        <Brand />
        <Rail groups={groups} />
      </aside>

      {/* Phone drawer */}
      {open && (
        <div className="fixed inset-0 z-50 md:hidden" role="dialog" aria-modal="true" aria-label="Console menu">
          <button type="button" aria-label="Close menu" className="absolute inset-0 bg-overlay" onClick={() => setOpen(false)} />
          <aside className="relative flex h-full w-[min(280px,85vw)] flex-col bg-rail">
            <div className="flex items-center justify-between pr-3">
              <Brand />
              <button type="button" onClick={() => setOpen(false)} aria-label="Close menu"
                className="grid size-11 place-items-center rounded-lg text-rail-text hover:bg-rail-hover hover:text-rail-strong">
                <X className="size-5" aria-hidden="true" />
              </button>
            </div>
            <Rail groups={groups} onNavigate={() => setOpen(false)} />
          </aside>
        </div>
      )}

      <div className="flex min-w-0 flex-1 flex-col">
        <header className="sticky top-0 z-30 flex h-16 items-center gap-3 border-b border-default bg-surface/95 px-4 backdrop-blur md:px-8">
          <button type="button" onClick={() => setOpen(true)} aria-label="Open menu"
            className="-ml-2 grid size-11 place-items-center rounded-lg text-muted hover:bg-surface-hover hover:text-foreground md:hidden">
            <Menu className="size-5" aria-hidden="true" />
          </button>
          <p className="text-[16px] font-semibold md:text-[18px]">Admin console</p>
          <div className="ml-auto flex items-center gap-3">
            <div className="hidden text-right sm:block">
              <p className="text-[13px] font-medium leading-tight">{userLabel}</p>
              <p className="text-[11px] text-muted">{roleLabel}</p>
            </div>
            <span aria-hidden="true" className="grid size-9 place-items-center rounded-full bg-rail text-[13px] font-semibold text-rail-strong">{initial}</span>
          </div>
        </header>
        <main className="mx-auto w-full max-w-7xl flex-1 px-4 py-6 md:px-8 md:py-8">{children}</main>
      </div>
    </div>
  )
}
