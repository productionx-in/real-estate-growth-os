'use client'
// components/layout/Sidebar.tsx
import Link from 'next/link'
import { useParams, usePathname } from 'next/navigation'
import {
  LayoutDashboard,
  Users,
  FolderOpen,
  UserCircle,
  Settings,
  Building2,
  Layers,
} from 'lucide-react'
import { cn } from '@/lib/utils/cn'

interface NavItem {
  label: string
  href: string
  icon: React.ComponentType<{ className?: string }>
  exact?: boolean
}

function useNavItems(orgSlug: string): NavItem[] {
  return [
    {
      label: 'Overview',
      href: `/${orgSlug}`,
      icon: LayoutDashboard,
      exact: true,
    },
    {
      label: 'Leads',
      href: `/${orgSlug}/leads`,
      icon: Users,
    },
    {
      label: 'Projects',
      href: `/${orgSlug}/projects`,
      icon: FolderOpen,
    },
    {
      label: 'Inventory',
      href: `/${orgSlug}/inventory`,
      icon: Layers,
    },
    {
      label: 'Team',
      href: `/${orgSlug}/team`,
      icon: UserCircle,
    },
    {
      label: 'Settings',
      href: `/${orgSlug}/settings`,
      icon: Settings,
    },
  ]
}

export function Sidebar() {
  const params = useParams()
  const pathname = usePathname()
  const orgSlug = params?.orgSlug as string

  const navItems = useNavItems(orgSlug ?? '')

  function isActive(item: NavItem): boolean {
    if (item.exact) return pathname === item.href
    return pathname.startsWith(item.href)
  }

  return (
    <aside
      style={{ width: 'var(--sidebar-width)' }}
      className="flex-shrink-0 h-full bg-[var(--surface)] border-r border-[var(--border)] flex flex-col"
    >
      {/* Brand */}
      <div
        style={{ height: 'var(--header-height)' }}
        className="flex items-center px-4 border-b border-[var(--border)] flex-shrink-0"
      >
        <div className="flex items-center gap-2.5">
          <div className="w-7 h-7 rounded-md bg-[var(--brand)] flex items-center justify-center flex-shrink-0">
            <Building2 className="w-4 h-4 text-white" />
          </div>
          <div className="min-w-0">
            <p className="text-[13px] font-semibold text-[var(--foreground)] truncate leading-tight">
              Growth OS
            </p>
            {orgSlug && (
              <p className="text-[11px] text-[var(--foreground-muted)] truncate leading-tight capitalize">
                {orgSlug.replace(/-/g, ' ')}
              </p>
            )}
          </div>
        </div>
      </div>

      {/* Nav */}
      <nav className="flex-1 overflow-y-auto py-3 px-2">
        <ul className="space-y-0.5">
          {navItems.map((item) => {
            const Icon = item.icon
            const active = isActive(item)
            return (
              <li key={item.href}>
                <Link
                  href={item.href}
                  className={cn(
                    'flex items-center gap-2.5 px-2.5 py-1.5 rounded-md text-[13px] font-medium transition-colors',
                    active
                      ? 'bg-[var(--sidebar-active-bg)] text-[var(--sidebar-active-text)]'
                      : 'text-[var(--foreground-muted)] hover:bg-[var(--surface-muted)] hover:text-[var(--foreground)]'
                  )}
                >
                  <Icon
                    className={cn(
                      'w-4 h-4 flex-shrink-0',
                      active ? 'text-[var(--brand)]' : 'text-[var(--foreground-muted)]'
                    )}
                  />
                  <span>{item.label}</span>
                </Link>
              </li>
            )
          })}
        </ul>
      </nav>

      {/* Footer */}
      <div className="p-3 border-t border-[var(--border)] flex-shrink-0">
        <div className="text-[11px] text-[var(--foreground-subtle)] text-center">
          Real Estate Growth OS
        </div>
      </div>
    </aside>
  )
}
