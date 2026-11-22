'use client'
// components/layout/Sidebar.tsx
// Workspace navigation. Desktop: a sidebar that collapses to an icon rail (remembered per browser).
// Phones: an off-canvas drawer opened from the header or the tab bar's "More". The links come from
// lib/navigation/nav.ts, shared with the tab bar and ⌘K; the server still authorises every page.
import React, { useEffect, useState } from 'react'
import Link from 'next/link'
import { useParams, usePathname, useRouter } from 'next/navigation'
import {
  LayoutDashboard, Users, FolderOpen, UserCircle, Settings, Building2, Layers, Plug, TrendingUp, Briefcase,
  ChevronsUpDown, Check, Compass, Shuffle, ListChecks, Gauge, ScrollText, LifeBuoy, CalendarDays,
  MessageCircle, FileText, PanelLeftClose, PanelLeftOpen, X, CreditCard,
  Handshake, ShieldCheck, House,
} from 'lucide-react'
import { cn } from '@/lib/utils/cn'
import { PRODUCT_NAME } from '@/lib/brand'
import { navGroups, isActiveLink, ROLE_LABELS, type NavKey, type OrgType } from '@/lib/navigation/nav'
import {
  DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuLabel, DropdownMenuSeparator, DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import { Tooltip } from '@/components/ui/tooltip'
import type { MemberRole } from '@/types/database'
import type { AvailableOrgSummary } from '@/lib/dal/workspace'

/** Dispatched by the header's menu button and the tab bar's "More" to open/close the drawer on phones. */
export const NAV_TOGGLE_EVENT = 'regrow:toggle-nav'
const COLLAPSE_KEY = 'regrow:nav-collapsed'

export const NAV_ICONS: Record<NavKey, React.ComponentType<{ className?: string }>> = {
  home: LayoutDashboard, today: ListChecks, leads: Users, visits: CalendarDays, inbox: MessageCircle,
  sales: Briefcase, routing: Shuffle, speed: Gauge, projects: FolderOpen, inventory: Layers, documents: FileText,
  analytics: TrendingUp, integrations: Plug, team: UserCircle, settings: Settings, billing: CreditCard, audit: ScrollText, support: ShieldCheck, partners: Handshake, help: LifeBuoy, listings: House,
}

export interface SidebarProps {
  orgName?: string
  orgSlug?: string
  orgType?: OrgType
  role?: MemberRole
  availableOrgs?: AvailableOrgSummary[]
  /** Modules switched off for this workspace (see lib/auth/entitlements.ts); their links are hidden. */
  disabledModules?: string[]
}

const orgTypeLabel = (t: OrgType) => (t === 'channel_partner' ? 'Channel partner' : 'Developer')

export function Sidebar({
  orgName,
  orgSlug: propOrgSlug,
  orgType = 'developer',
  role = 'sales_exec',
  availableOrgs = [],
  disabledModules = [],
}: SidebarProps = {}) {
  const params = useParams()
  const pathname = usePathname() || ''
  const router = useRouter()
  const orgSlug = propOrgSlug || (params?.orgSlug as string) || ''

  const [mobileOpen, setMobileOpen] = useState(false)
  const [collapsed, setCollapsed] = useState(false)
  useEffect(() => {
    // Read after mount (not during render) so the server and first client render match.
    const t = setTimeout(() => {
      try { if (localStorage.getItem(COLLAPSE_KEY) === '1') setCollapsed(true) } catch { /* storage blocked: stay expanded */ }
    }, 0)
    const toggle = () => setMobileOpen((v) => !v)
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') setMobileOpen(false) }
    window.addEventListener(NAV_TOGGLE_EVENT, toggle)
    window.addEventListener('keydown', onKey)
    return () => { clearTimeout(t); window.removeEventListener(NAV_TOGGLE_EVENT, toggle); window.removeEventListener('keydown', onKey) }
  }, [])
  // Close the drawer when the page changes (link taps, back button).
  const [seenPath, setSeenPath] = useState(pathname)
  if (seenPath !== pathname) {
    setSeenPath(pathname)
    setMobileOpen(false)
  }

  function toggleCollapsed() {
    const next = !collapsed
    setCollapsed(next)
    try { localStorage.setItem(COLLAPSE_KEY, next ? '1' : '0') } catch { /* ignore */ }
  }

  const groups = navGroups(orgSlug, role, orgType, disabledModules)
  const displayName = orgName || (orgSlug ? orgSlug.replace(/-/g, ' ') : 'Workspace')
  const roleName = ROLE_LABELS[role] ?? 'Member'
  const hasMultipleOrgs = availableOrgs.length > 1
  // The rail only applies on desktop; the phone drawer always shows labels.
  const rail = collapsed && !mobileOpen

  // Switch workspace, keeping the section when it exists everywhere.
  const switchOrg = (target: string) => {
    if (target === orgSlug) return
    const sub = pathname.split('/').filter(Boolean).filter((p) => p !== orgSlug).join('/')
    const keep = ['leads', 'inventory', 'sales', 'projects'].some((s) => sub === s || sub.startsWith(`${s}/`))
    router.push(keep ? `/${target}/${sub}` : `/${target}`)
  }

  const brandMark = (
    <span className="flex size-8 flex-shrink-0 items-center justify-center rounded-lg bg-brand text-brand-foreground shadow-xs">
      <Building2 aria-hidden className="size-4" />
    </span>
  )

  return (
    <>
      {mobileOpen && <div className="fixed inset-0 z-30 bg-overlay backdrop-blur-[2px] md:hidden" aria-hidden="true" onClick={() => setMobileOpen(false)} />}
      <aside
        id="app-sidebar"
        aria-label="Workspace navigation"
        style={{ width: rail ? 'var(--sidebar-width-collapsed)' : 'var(--sidebar-width)', transitionDuration: 'var(--duration-base)', transitionTimingFunction: 'var(--ease-out)' }}
        className={cn(
          'flex h-full flex-shrink-0 flex-col border-r border-default bg-surface',
          'fixed inset-y-0 left-0 z-40 transition-[transform,width] md:static md:z-auto md:translate-x-0',
          mobileOpen ? 'translate-x-0 shadow-xl' : '-translate-x-full'
        )}
      >
        {/* Workspace */}
        <div style={{ height: 'var(--header-height)' }} className={cn('flex flex-shrink-0 items-center gap-1 border-b border-default', rail ? 'justify-center px-2' : 'px-3')}>
          {hasMultipleOrgs ? (
            <DropdownMenu>
              <DropdownMenuTrigger
                className={cn('flex min-w-0 items-center gap-2.5 rounded-lg p-1.5 text-left transition-colors hover:bg-surface-hover', rail ? '' : 'flex-1')}
                aria-label={`Workspace: ${displayName}. Switch workspace`}
              >
                {brandMark}
                {!rail && (
                  <>
                    <span className="min-w-0 flex-1">
                      <span className="block truncate text-[13px] font-semibold leading-tight text-foreground">{displayName}</span>
                      <span className="mt-0.5 block truncate text-[11px] leading-tight text-muted">{orgTypeLabel(orgType)} · {roleName}</span>
                    </span>
                    <ChevronsUpDown aria-hidden className="size-3.5 flex-shrink-0 text-subtle" />
                  </>
                )}
              </DropdownMenuTrigger>
              <DropdownMenuContent align="start" className="w-64">
                <DropdownMenuLabel>Your workspaces</DropdownMenuLabel>
                <div className="max-h-64 overflow-y-auto">
                  {availableOrgs.map((o) => (
                    <DropdownMenuItem key={o.id} onSelect={() => switchOrg(o.slug)} className="items-start py-2">
                      <span className="min-w-0 flex-1">
                        <span className="block truncate font-medium">{o.name}</span>
                        <span className="block text-[11px] text-muted">{orgTypeLabel(o.type)} · {ROLE_LABELS[o.role] ?? o.role}</span>
                      </span>
                      {o.slug === orgSlug && <Check aria-label="Current workspace" className="mt-0.5 text-brand" />}
                    </DropdownMenuItem>
                  ))}
                </div>
                <DropdownMenuSeparator />
                <DropdownMenuItem asChild><Link href="/select-org"><Compass aria-hidden /> All workspaces</Link></DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          ) : (
            <div className={cn('flex min-w-0 items-center gap-2.5 p-1.5', rail ? '' : 'flex-1')} title={displayName}>
              {brandMark}
              {!rail && (
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-[13px] font-semibold leading-tight text-foreground">{displayName}</span>
                  <span className="mt-0.5 block truncate text-[11px] leading-tight text-muted">{orgTypeLabel(orgType)} · {roleName}</span>
                </span>
              )}
            </div>
          )}
          <button type="button" onClick={() => setMobileOpen(false)} aria-label="Close menu" className="flex size-10 items-center justify-center rounded-md text-muted hover:bg-surface-hover md:hidden">
            <X aria-hidden className="size-5" />
          </button>
        </div>

        {/* Links */}
        <nav className={cn('flex-1 space-y-5 overflow-y-auto py-3', rail ? 'px-2' : 'px-2.5')}>
          {groups.map((g, i) => (
            <div key={g.title ?? i}>
              {g.title && (rail
                ? <div className="mx-2 mb-2 border-t border-default" aria-hidden />
                : <p className="px-2.5 pb-1.5 text-[11px] font-medium text-subtle">{g.title}</p>)}
              <ul className="space-y-0.5">
                {g.items.map((item) => {
                  const Icon = NAV_ICONS[item.key]
                  const active = isActiveLink(item, pathname)
                  const link = (
                    <Link
                      href={item.href}
                      aria-current={active ? 'page' : undefined}
                      aria-label={rail ? item.label : undefined}
                      className={cn(
                        'group relative flex items-center gap-2.5 rounded-lg text-[13px] font-medium transition-colors',
                        rail ? 'size-10 justify-center' : 'px-2.5 py-2 pointer-coarse:py-2.5',
                        active ? 'bg-[var(--sidebar-active-bg)] text-[var(--sidebar-active-text)]' : 'text-muted hover:bg-surface-hover hover:text-foreground'
                      )}
                    >
                      {active && !rail && <span aria-hidden className="absolute inset-y-1.5 left-0 w-[3px] rounded-r-full bg-brand" />}
                      <Icon className={cn('size-4 flex-shrink-0', active ? 'text-brand' : 'text-subtle group-hover:text-foreground')} />
                      {!rail && <span className="truncate">{item.label}</span>}
                    </Link>
                  )
                  return <li key={item.href}>{rail ? <Tooltip content={item.label} side="right">{link}</Tooltip> : link}</li>
                })}
              </ul>
            </div>
          ))}
        </nav>

        {/* Collapse (desktop) */}
        <div className={cn('hidden flex-shrink-0 items-center border-t border-default p-2 md:flex', rail ? 'justify-center' : 'justify-between')}>
          {!rail && <span className="px-2 text-[11px] text-subtle">{PRODUCT_NAME}</span>}
          <button
            type="button"
            onClick={toggleCollapsed}
            aria-label={rail ? 'Expand sidebar' : 'Collapse sidebar'}
            aria-expanded={!rail}
            aria-controls="app-sidebar"
            className="flex size-8 items-center justify-center rounded-md text-subtle transition-colors hover:bg-surface-hover hover:text-foreground"
          >
            {rail ? <PanelLeftOpen aria-hidden className="size-4" /> : <PanelLeftClose aria-hidden className="size-4" />}
          </button>
        </div>
      </aside>
    </>
  )
}
