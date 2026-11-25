'use client'
// components/layout/BottomNav.tsx
// Phone tab bar: the four places a salesperson goes most, one thumb-tap away, plus "More" for the full menu.
// Hidden from md up, where the sidebar is always visible.
import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { Menu } from 'lucide-react'
import { cn } from '@/lib/utils/cn'
import { NAV_ICONS, NAV_TOGGLE_EVENT } from '@/components/layout/Sidebar'
import { navGroups, tabLinks, isActiveLink, TAB_LABELS, type OrgType } from '@/lib/navigation/nav'
import type { MemberRole } from '@/types/database'

export function BottomNav({ orgSlug, role, orgType, disabledModules }: { orgSlug: string; role: MemberRole; orgType: OrgType; disabledModules: string[] }) {
  const pathname = usePathname() || ''
  const tabs = tabLinks(navGroups(orgSlug, role, orgType, disabledModules))
  const item = 'flex min-w-0 flex-1 flex-col items-center justify-center gap-0.5 text-[11px] font-medium transition-colors'
  return (
    <nav aria-label="Main" className="safe-bottom fixed inset-x-0 bottom-0 z-20 border-t border-default bg-surface/95 backdrop-blur md:hidden">
      <ul className="flex" style={{ height: 'var(--bottom-nav-height)' }}>
        {tabs.map((t) => {
          const Icon = NAV_ICONS[t.key]
          const active = isActiveLink(t, pathname)
          return (
            <li key={t.key} className="flex flex-1">
              <Link href={t.href} aria-label={t.label} aria-current={active ? 'page' : undefined} className={cn(item, active ? 'text-brand' : 'text-muted')}>
                <span className={cn('flex h-7 w-12 items-center justify-center rounded-full transition-colors', active && 'nav-pop bg-brand-light')}>
                  <Icon aria-hidden className="size-5" />
                </span>
                <span className="max-w-full truncate px-1">{TAB_LABELS[t.key] ?? t.label}</span>
              </Link>
            </li>
          )
        })}
        <li className="flex flex-1">
          <button type="button" onClick={() => window.dispatchEvent(new Event(NAV_TOGGLE_EVENT))} aria-controls="app-sidebar" className={cn(item, 'text-muted')}>
            <span className="flex h-7 w-12 items-center justify-center"><Menu aria-hidden className="size-5" /></span>
            More
          </button>
        </li>
      </ul>
    </nav>
  )
}
