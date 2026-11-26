'use client'
// components/layout/Header.tsx
// Top bar: where you are, search (⌘K), duty status, notifications, and your account menu.
import { AppearanceMenu } from '@/components/theme/AppearanceMenu'
import { ThemeToggle } from '@/components/theme/ThemeToggle'
import { useRouter, usePathname } from 'next/navigation'
import Link from 'next/link'
import { Bell, ChevronRight, Menu, Search, LogOut, Compass, Settings, Mail } from 'lucide-react'
import { NAV_TOGGLE_EVENT } from '@/components/layout/Sidebar'
import { PALETTE_OPEN_EVENT } from '@/components/layout/CommandPalette'
import { NotificationBell } from '@/components/notifications/NotificationBell'
import { UserAvatar } from '@/components/ui/user-avatar'
import { DutyToggle } from '@/components/routing/DutyToggle'
import {
  DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuSeparator, DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import { createClient } from '@/lib/supabase/client'
import { navGroups, isActiveLink, ROLE_LABELS, type OrgType } from '@/lib/navigation/nav'
import type { MemberRole } from '@/types/database'
import type { AvailableOrgSummary } from '@/lib/dal/workspace'
import { ASSIGNABLE_ROLES } from '@/lib/auth/permissions'

export interface HeaderProps {
  orgId?: string
  orgName?: string
  orgSlug?: string
  orgType?: OrgType
  role?: MemberRole
  user?: { id: string; email?: string }
  profile?: { id: string; full_name: string; avatar_url: string | null; phone: string | null }
  availableOrgs?: AvailableOrgSummary[]
  /** Receives leads in this workspace (an owner only while they also sell); shows the on-duty switch. */
  takesLeads?: boolean
}

/** Pages below a section ("…/leads/new") get a second crumb. */
const SUBPAGE_LABELS: Record<string, string> = { new: 'New', import: 'Import', edit: 'Edit' }

export function Header({ orgId, orgName, orgSlug = '', orgType = 'developer', role = 'sales_exec', user, profile, availableOrgs = [], takesLeads }: HeaderProps) {
  const router = useRouter()
  const pathname = usePathname() || ''

  async function signOut() {
    await createClient().auth.signOut()
    router.push('/login')
    router.refresh()
  }

  // Breadcrumb from the shared navigation, so it always uses the same words as the menu.
  const links = navGroups(orgSlug, role, orgType).flatMap((g) => g.items)
  const here = links.filter((l) => isActiveLink(l, pathname)).sort((a, b) => b.href.length - a.href.length)[0]
  const sub = pathname.split('/').filter(Boolean).at(-1) ?? ''
  const crumb = here?.label ?? 'Home'
  const subCrumb = here && pathname !== here.href ? SUBPAGE_LABELS[sub] : undefined

  const name = profile?.full_name || 'Your account'

  return (
    <header
      style={{ height: 'var(--header-height)' }}
      className="glass z-10 flex flex-shrink-0 items-center justify-between gap-2 border-b border-default px-2 md:px-5"
    >
      <div className="flex min-w-0 items-center gap-1.5">
        <button
          type="button"
          onClick={() => window.dispatchEvent(new Event(NAV_TOGGLE_EVENT))}
          className="flex size-10 items-center justify-center rounded-md text-foreground hover:bg-surface-hover md:hidden"
          aria-label="Open menu"
          aria-controls="app-sidebar"
        >
          <Menu aria-hidden className="size-5" />
        </button>
        <nav aria-label="Breadcrumb" className="flex min-w-0 items-center gap-1.5 text-[13px]">
          <Link href={`/${orgSlug}`} className="hidden truncate text-muted transition-colors hover:text-foreground lg:block lg:max-w-48">
            {orgName || 'Workspace'}
          </Link>
          <ChevronRight aria-hidden className="hidden size-3.5 flex-shrink-0 text-subtle lg:block" />
          {subCrumb ? (
            <>
              <Link href={here!.href} className="truncate text-muted hover:text-foreground">{crumb}</Link>
              <ChevronRight aria-hidden className="size-3.5 flex-shrink-0 text-subtle" />
              <span aria-current="page" className="truncate font-semibold text-foreground">{subCrumb}</span>
            </>
          ) : (
            <span aria-current="page" className="truncate font-semibold text-foreground">{crumb}</span>
          )}
        </nav>
      </div>

      <div className="flex flex-shrink-0 items-center gap-1 md:gap-2">
        {/* Search: a wide field on desktop, an icon on phones. */}
        <button
          type="button"
          onClick={() => window.dispatchEvent(new Event(PALETTE_OPEN_EVENT))}
          className="hidden h-9 w-56 items-center gap-2 rounded-lg border border-default bg-surface-muted px-3 text-[13px] text-subtle transition-colors hover:border-strong hover:text-muted md:flex lg:w-72"
        >
          <Search aria-hidden className="size-4" />
          <span className="flex-1 text-left">Search leads, projects…</span>
          <kbd className="rounded border border-default bg-surface px-1.5 font-sans text-[11px]">⌘K</kbd>
        </button>
        <button
          type="button"
          onClick={() => window.dispatchEvent(new Event(PALETTE_OPEN_EVENT))}
          aria-label="Search"
          className="flex size-10 items-center justify-center rounded-md text-muted hover:bg-surface-hover md:hidden"
        >
          <Search aria-hidden className="size-5" />
        </button>

        {orgId && (takesLeads ?? ASSIGNABLE_ROLES.includes(role)) && <DutyToggle orgId={orgId} />}

        {orgId && orgSlug ? (
          <NotificationBell orgId={orgId} orgSlug={orgSlug} />
        ) : (
          <span className="flex size-8 items-center justify-center text-muted" aria-hidden="true"><Bell className="size-4" /></span>
        )}

        <ThemeToggle className="hidden sm:grid" />

        <DropdownMenu>
          <DropdownMenuTrigger
            aria-label={`Account: ${name}`}
            className="flex items-center gap-2 rounded-full p-0.5 transition-colors hover:bg-surface-hover md:rounded-lg md:py-1 md:pl-1 md:pr-2"
          >
            <UserAvatar name={profile?.full_name} src={profile?.avatar_url} size={32} />
            <span className="hidden max-w-32 truncate text-[13px] font-medium text-foreground lg:block">{name}</span>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end" className="w-64">
            <div className="px-2.5 py-2">
              <p className="truncate text-[13px] font-semibold text-foreground">{name}</p>
              {user?.email && <p className="truncate text-[12px] text-muted">{user.email}</p>}
              <p className="mt-1.5 inline-flex rounded-full bg-surface-hover px-2 py-0.5 text-[11px] font-medium text-muted">
                {ROLE_LABELS[role]} · {orgName || 'Workspace'}
              </p>
            </div>
            <DropdownMenuSeparator />
            <DropdownMenuItem asChild><Link href={`/${orgSlug}/settings`}><Settings aria-hidden /> Settings</Link></DropdownMenuItem>
            {availableOrgs.length > 1 && (
              <DropdownMenuItem asChild><Link href="/select-org"><Compass aria-hidden /> Switch workspace</Link></DropdownMenuItem>
            )}
            <DropdownMenuItem asChild><Link href={`/${orgSlug}/settings/notifications`}><Mail aria-hidden /> My notifications</Link></DropdownMenuItem>
            <DropdownMenuSeparator />
            <AppearanceMenu />
            <DropdownMenuSeparator />
            <DropdownMenuItem destructive onSelect={signOut}><LogOut aria-hidden /> Sign out</DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </div>
    </header>
  )
}
