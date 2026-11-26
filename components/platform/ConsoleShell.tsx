'use client'
// components/platform/ConsoleShell.tsx — the internal console's frame: dark navigation rail (drawer on phones),
// page header with the signed-in staff member. Which links appear is decided on the server (layout.tsx);
// every page and API route checks the role again.
import { useEffect, useState } from 'react'
import Link from 'next/link'
import { ReMark } from '@/components/brand/Logo'
import { usePathname, useRouter } from 'next/navigation'
import {
  Bot, Building2, ChevronDown, CreditCard, LayoutDashboard, LifeBuoy, LogOut, Menu, PlusCircle, ScrollText, ShieldCheck, TrendingUp, UserCog, Users, Mail, Plug, Puzzle, MapPinned, X,
  type LucideIcon,
  Globe,
} from 'lucide-react'
import { cn } from '@/lib/utils/cn'
import { createClient } from '@/lib/supabase/client'
import { ThemeToggle } from '@/components/theme/ThemeToggle'
import { AppearanceMenu } from '@/components/theme/AppearanceMenu'
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuSeparator, DropdownMenuTrigger } from '@/components/ui/dropdown-menu'

export type ConsoleIcon = 'dashboard' | 'organisations' | 'provision' | 'sales' | 'support' | 'payments' | 'audit' | 'staff' | 'people' | 'email' | 'integrations' | 'addons' | 'assistant' | 'maps' | 'website'
export interface ConsoleNavItem { href: string; label: string; icon: ConsoleIcon; badge?: number; badgeTone?: 'alert' | 'info' }
export interface ConsoleNavGroup { label: string; items: ConsoleNavItem[] }

const ICONS: Record<ConsoleIcon, LucideIcon> = {
  dashboard: LayoutDashboard, organisations: Building2, provision: PlusCircle, sales: TrendingUp,
  support: LifeBuoy, payments: CreditCard, audit: ScrollText, staff: UserCog, people: Users, email: Mail, integrations: Plug, addons: Puzzle, assistant: Bot, maps: MapPinned, website: Globe,
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
      <ReMark className="size-7" />
      <span className="text-[13px] font-semibold uppercase tracking-wider text-rail-strong">Console</span>
    </Link>
  )
}

/** Title for the header, from the deepest matching nav item ("Support", "Organisations"…). */
function pageTitle(groups: ConsoleNavGroup[], pathname: string) {
  const items = groups.flatMap((g) => g.items).filter((i) => isActive(pathname, i.href)).sort((a, b) => b.href.length - a.href.length)
  return items[0]?.label ?? 'Console'
}

function useSignOut() {
  const router = useRouter()
  const [busy, setBusy] = useState(false)
  return {
    busy,
    signOut: async () => {
      setBusy(true)
      try { await createClient().auth.signOut() } finally { router.push('/login?for=staff'); router.refresh() }
    },
  }
}

function SignOutButton({ className }: { className?: string }) {
  const { busy, signOut } = useSignOut()
  return (
    <button type="button" onClick={signOut} disabled={busy}
      className={cn('flex min-h-11 w-full items-center gap-3 rounded-lg px-3 text-[13px] font-medium text-rail-text hover:bg-rail-hover hover:text-rail-strong disabled:opacity-60', className)}>
      <LogOut className="size-[18px] text-rail-muted" aria-hidden="true" />{busy ? 'Signing out…' : 'Sign out'}
    </button>
  )
}

function UserMenu({ userLabel, roleLabel }: { userLabel: string; roleLabel: string }) {
  const { busy, signOut } = useSignOut()
  const initial = (userLabel.trim()[0] ?? '?').toUpperCase()
  return (
    <DropdownMenu>
      <DropdownMenuTrigger className="flex min-h-11 items-center gap-3 rounded-xl px-2 hover:bg-surface-hover" aria-label={`Account menu for ${userLabel}`}>
        <span className="hidden text-right sm:block">
          <span className="block text-[13px] font-medium leading-tight">{userLabel}</span>
          <span className="block text-[11px] text-muted">{roleLabel}</span>
        </span>
        <span aria-hidden="true" className="grid size-9 place-items-center rounded-full bg-rail text-[13px] font-semibold text-rail-strong">{initial}</span>
        <ChevronDown className="size-4 text-muted" aria-hidden="true" />
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-60">
        <div className="px-2.5 py-2">
          <p className="truncate text-[13px] font-medium">{userLabel}</p>
          <p className="text-[12px] text-muted">{roleLabel}</p>
        </div>
        <DropdownMenuSeparator />
        <DropdownMenuItem asChild><Link href="/account/security"><ShieldCheck aria-hidden /> Account security</Link></DropdownMenuItem>
        <DropdownMenuSeparator />
        <AppearanceMenu />
        <DropdownMenuSeparator />
        <DropdownMenuItem destructive disabled={busy} onSelect={signOut}><LogOut aria-hidden /> {busy ? 'Signing out…' : 'Sign out'}</DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  )
}

export function ConsoleShell({ groups, userLabel, roleLabel, children }: {
  groups: ConsoleNavGroup[]; userLabel: string; roleLabel: string; children: React.ReactNode
}) {
  const [open, setOpen] = useState(false)
  const pathname = usePathname() ?? ''
  useEffect(() => {
    if (!open) return
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') setOpen(false) }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [open])

  return (
    <div className="min-h-dvh bg-background text-foreground md:flex">
      {/* Desktop rail */}
      <aside className="sticky top-0 hidden h-dvh w-[248px] shrink-0 flex-col border-r border-rail-border bg-rail md:flex">
        <Brand />
        <Rail groups={groups} />
        <div className="border-t border-rail-border p-3"><SignOutButton /></div>
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
            <div className="border-t border-rail-border p-3"><SignOutButton /></div>
          </aside>
        </div>
      )}

      <div className="flex min-w-0 flex-1 flex-col">
        <header className="sticky top-0 z-30 flex h-16 items-center gap-3 border-b border-default bg-surface/95 px-4 backdrop-blur md:px-8">
          <button type="button" onClick={() => setOpen(true)} aria-label="Open menu"
            className="-ml-2 grid size-11 place-items-center rounded-lg text-muted hover:bg-surface-hover hover:text-foreground md:hidden">
            <Menu className="size-5" aria-hidden="true" />
          </button>
          <p className="truncate text-[16px] font-semibold md:text-[18px]">{groups.length ? pageTitle(groups, pathname) : 'Verify it’s you'}</p>
          <div className="ml-auto flex items-center gap-1"><ThemeToggle /><UserMenu userLabel={userLabel} roleLabel={roleLabel} /></div>
        </header>
        <main className="mx-auto w-full max-w-7xl flex-1 px-4 py-6 md:px-8 md:py-8">{children}</main>
      </div>
    </div>
  )
}
