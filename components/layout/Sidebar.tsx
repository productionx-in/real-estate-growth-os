'use client'
// components/layout/Sidebar.tsx
// Role-aware enterprise sidebar with interactive workspace switcher and permission-scoped navigation sections.
import React, { useState, useRef, useEffect } from 'react'
import Link from 'next/link'
import { useParams, usePathname, useRouter } from 'next/navigation'
import {
  LayoutDashboard,
  Users,
  FolderOpen,
  UserCircle,
  Settings,
  Building2,
  Layers,
  Plug,
  TrendingUp,
  Briefcase,
  ChevronsUpDown,
  Check,
  Plus,
  Compass,
} from 'lucide-react'
import { cn } from '@/lib/utils/cn'
import type { MemberRole } from '@/types/database'
import type { AvailableOrgSummary } from '@/lib/dal/workspace'

interface NavItem {
  label: string
  href: string
  icon: React.ComponentType<{ className?: string }>
  exact?: boolean
}

interface NavSection {
  title?: string
  items: NavItem[]
}

export interface SidebarProps {
  orgName?: string
  orgSlug?: string
  orgType?: 'developer' | 'channel_partner'
  role?: MemberRole
  user?: { id: string; email?: string }
  profile?: { id: string; full_name: string; avatar_url: string | null; phone: string | null }
  availableOrgs?: AvailableOrgSummary[]
}

const ROLE_DISPLAY_NAMES: Record<MemberRole, string> = {
  owner: 'Owner',
  admin: 'Admin',
  manager: 'Sales Manager',
  sales_exec: 'Sales Executive',
  readonly: 'Read Only',
}

function getRoleNavSections(
  orgSlug: string,
  role: MemberRole = 'sales_exec',
  orgType: 'developer' | 'channel_partner' = 'developer'
): NavSection[] {
  // 1. Sales Executive: strictly focused on their calling queue, assigned leads, and pitching inventory
  if (role === 'sales_exec') {
    return [
      {
        title: 'MY PIPELINE',
        items: [
          { label: 'Overview', href: `/${orgSlug}`, icon: LayoutDashboard, exact: true },
          { label: 'My Leads', href: `/${orgSlug}/leads`, icon: Users },
          { label: 'Sales & Visits', href: `/${orgSlug}/sales`, icon: Briefcase },
          { label: 'Inventory Units', href: `/${orgSlug}/inventory`, icon: Layers },
        ],
      },
    ]
  }

  // 2. Read-Only Auditor / External Observer
  if (role === 'readonly') {
    return [
      {
        title: 'WORKSPACE',
        items: [
          { label: 'Overview', href: `/${orgSlug}`, icon: LayoutDashboard, exact: true },
          { label: 'Projects', href: `/${orgSlug}/projects`, icon: FolderOpen },
          { label: 'Inventory Explorer', href: `/${orgSlug}/inventory`, icon: Layers },
          { label: 'Analytics & BI', href: `/${orgSlug}/analytics`, icon: TrendingUp },
        ],
      },
    ]
  }

  // 3. Channel Partner Brokerage Workspace
  if (orgType === 'channel_partner') {
    return [
      {
        title: 'BROKERAGE CRM',
        items: [
          { label: 'Overview', href: `/${orgSlug}`, icon: LayoutDashboard, exact: true },
          { label: 'Referred Leads', href: `/${orgSlug}/leads`, icon: Users },
          { label: 'Deals & Commissions', href: `/${orgSlug}/sales`, icon: Briefcase },
        ],
      },
      {
        title: 'ORGANISATION',
        items: [
          { label: 'Agency Team', href: `/${orgSlug}/team`, icon: UserCircle },
          ...(role === 'owner' || role === 'admin'
            ? [{ label: 'Settings', href: `/${orgSlug}/settings`, icon: Settings }]
            : []),
        ],
      },
    ]
  }

  // 4. Developer Sales Manager
  if (role === 'manager') {
    return [
      {
        title: 'SALES & CRM',
        items: [
          { label: 'Overview', href: `/${orgSlug}`, icon: LayoutDashboard, exact: true },
          { label: 'Leads CRM', href: `/${orgSlug}/leads`, icon: Users },
          { label: 'Sales Operations', href: `/${orgSlug}/sales`, icon: Briefcase },
        ],
      },
      {
        title: 'PORTFOLIO',
        items: [
          { label: 'Projects', href: `/${orgSlug}/projects`, icon: FolderOpen },
          { label: 'Inventory Explorer', href: `/${orgSlug}/inventory`, icon: Layers },
        ],
      },
      {
        title: 'PERFORMANCE',
        items: [
          { label: 'Analytics & BI', href: `/${orgSlug}/analytics`, icon: TrendingUp },
          { label: 'Team Directory', href: `/${orgSlug}/team`, icon: UserCircle },
        ],
      },
    ]
  }

  // 5. Developer Administrator / Owner (Full Suite)
  return [
    {
      title: 'SALES & CRM',
      items: [
        { label: 'Overview', href: `/${orgSlug}`, icon: LayoutDashboard, exact: true },
        { label: 'Leads CRM', href: `/${orgSlug}/leads`, icon: Users },
        { label: 'Sales & CPs', href: `/${orgSlug}/sales`, icon: Briefcase },
      ],
    },
    {
      title: 'PORTFOLIO',
      items: [
        { label: 'Projects', href: `/${orgSlug}/projects`, icon: FolderOpen },
        { label: 'Inventory Explorer', href: `/${orgSlug}/inventory`, icon: Layers },
      ],
    },
    {
      title: 'GROWTH & PLATFORM',
      items: [
        { label: 'Integrations', href: `/${orgSlug}/integrations`, icon: Plug },
        { label: 'Analytics & BI', href: `/${orgSlug}/analytics`, icon: TrendingUp },
      ],
    },
    {
      title: 'MANAGEMENT',
      items: [
        { label: 'Team', href: `/${orgSlug}/team`, icon: UserCircle },
        { label: 'Settings', href: `/${orgSlug}/settings`, icon: Settings },
      ],
    },
  ]
}

export function Sidebar({
  orgName,
  orgSlug: propOrgSlug,
  orgType = 'developer',
  role = 'sales_exec',
  profile,
  availableOrgs = [],
}: SidebarProps = {}) {
  const params = useParams()
  const pathname = usePathname()
  const router = useRouter()
  const orgSlug = propOrgSlug || (params?.orgSlug as string) || ''

  const [isSwitcherOpen, setIsSwitcherOpen] = useState(false)
  const switcherRef = useRef<HTMLDivElement>(null)

  // Close switcher when clicking outside
  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (switcherRef.current && !switcherRef.current.contains(event.target as Node)) {
        setIsSwitcherOpen(false)
      }
    }
    if (isSwitcherOpen) {
      document.addEventListener('mousedown', handleClickOutside)
    }
    return () => {
      document.removeEventListener('mousedown', handleClickOutside)
    }
  }, [isSwitcherOpen])

  const navSections = getRoleNavSections(orgSlug, role, orgType)

  function isActive(item: NavItem): boolean {
    if (item.exact) return pathname === item.href
    return pathname.startsWith(item.href)
  }

  const displayName = orgName || (orgSlug ? orgSlug.replace(/-/g, ' ') : 'Workspace')
  const roleName = ROLE_DISPLAY_NAMES[role] ?? 'Member'
  const hasMultipleOrgs = availableOrgs.length > 1

  // Handle switching to a target organization while preserving destination subpath if possible
  const handleSwitchOrg = (targetOrgSlug: string) => {
    setIsSwitcherOpen(false)
    if (targetOrgSlug === orgSlug) return

    // Derive current section, e.g. /leads, /inventory
    const pathParts = (pathname || '').split('/').filter(Boolean)
    const subpathParts = pathParts.filter((p) => p !== orgSlug)
    const baseSubpath = subpathParts.length > 0 ? `/${subpathParts.join('/')}` : ''

    // If current route is a specific subpath that exists across orgs (leads, inventory, sales), preserve it
    const safeSubpaths = ['/leads', '/inventory', '/sales', '/projects']
    const canPreserve = safeSubpaths.some((s) => baseSubpath.startsWith(s))

    const targetUrl = canPreserve ? `/${targetOrgSlug}${baseSubpath}` : `/${targetOrgSlug}`
    router.push(targetUrl)
  }

  return (
    <aside
      style={{ width: 'var(--sidebar-width)' }}
      className="flex-shrink-0 h-full bg-[var(--surface)] border-r border-[var(--border)] flex flex-col relative"
    >
      {/* Brand & Workspace Switcher Header */}
      <div
        ref={switcherRef}
        style={{ height: 'var(--header-height)' }}
        className="flex items-center px-3 border-b border-[var(--border)] flex-shrink-0 relative"
      >
        <button
          onClick={() => hasMultipleOrgs && setIsSwitcherOpen((prev) => !prev)}
          disabled={!hasMultipleOrgs}
          className={cn(
            'w-full flex items-center justify-between p-1.5 rounded-lg text-left transition-colors',
            hasMultipleOrgs
              ? 'hover:bg-[var(--surface-hover)] cursor-pointer'
              : 'cursor-default'
          )}
          title={hasMultipleOrgs ? 'Click to switch workspace' : displayName}
        >
          <div className="flex items-center gap-2.5 min-w-0">
            <div className="w-8 h-8 rounded-lg bg-[var(--brand)] flex items-center justify-center flex-shrink-0 shadow-2xs text-white">
              <Building2 className="w-4 h-4" />
            </div>
            <div className="min-w-0 flex-1">
              <div className="flex items-center gap-1.5">
                <p className="text-[13px] font-bold text-[var(--foreground)] truncate leading-tight">
                  {displayName}
                </p>
              </div>
              <p className="text-[11px] text-[var(--foreground-muted)] truncate leading-tight mt-0.5 flex items-center gap-1">
                <span className="capitalize">{orgType === 'channel_partner' ? 'Channel Partner' : 'Developer'}</span>
                <span>•</span>
                <span className="text-[10px] text-gray-500 font-medium">{roleName}</span>
              </p>
            </div>
          </div>

          {hasMultipleOrgs && (
            <ChevronsUpDown className="w-3.5 h-3.5 text-[var(--foreground-muted)] flex-shrink-0 ml-1" />
          )}
        </button>

        {/* WORKSPACE SWITCHER DROPDOWN POPOVER */}
        {isSwitcherOpen && hasMultipleOrgs && (
          <div className="absolute top-[calc(100%+4px)] left-2 right-2 bg-[var(--surface)] border border-[var(--border)] rounded-xl shadow-lg z-50 p-2 space-y-1 animate-in fade-in slide-in-from-top-1 duration-150">
            <div className="px-2.5 py-1 text-[10px] font-semibold text-[var(--foreground-muted)] uppercase tracking-wider">
              Your Workspaces
            </div>

            <div className="max-h-56 overflow-y-auto space-y-0.5">
              {availableOrgs.map((orgItem) => {
                const isCurrent = orgItem.slug === orgSlug
                return (
                  <button
                    key={orgItem.id}
                    onClick={() => handleSwitchOrg(orgItem.slug)}
                    className={cn(
                      'w-full flex items-center justify-between px-2.5 py-2 rounded-lg text-left text-xs transition-colors cursor-pointer',
                      isCurrent
                        ? 'bg-indigo-50 text-indigo-900 font-medium'
                        : 'text-[var(--foreground)] hover:bg-[var(--surface-hover)]'
                    )}
                  >
                    <div className="min-w-0 pr-2">
                      <p className="font-semibold truncate">{orgItem.name}</p>
                      <p className="text-[10px] text-[var(--foreground-muted)] capitalize">
                        {orgItem.type === 'channel_partner' ? 'Channel Partner' : 'Developer'} · {ROLE_DISPLAY_NAMES[orgItem.role] || orgItem.role}
                      </p>
                    </div>
                    {isCurrent && (
                      <Check className="w-3.5 h-3.5 text-indigo-600 flex-shrink-0" />
                    )}
                  </button>
                )
              })}
            </div>

            <div className="pt-1.5 border-t border-[var(--border)] mt-1 space-y-0.5">
              <Link
                href="/select-org"
                onClick={() => setIsSwitcherOpen(false)}
                className="flex items-center gap-2 px-2.5 py-1.5 rounded-lg text-[11px] text-[var(--foreground-muted)] hover:bg-[var(--surface-hover)] hover:text-[var(--foreground)] transition-colors"
              >
                <Compass className="w-3.5 h-3.5" />
                <span>All Workspaces Directory</span>
              </Link>
              <Link
                href="/create-org"
                onClick={() => setIsSwitcherOpen(false)}
                className="flex items-center gap-2 px-2.5 py-1.5 rounded-lg text-[11px] text-indigo-600 hover:bg-indigo-50 transition-colors font-medium"
              >
                <Plus className="w-3.5 h-3.5" />
                <span>Create New Workspace</span>
              </Link>
            </div>
          </div>
        )}
      </div>

      {/* Role-Aware Navigation Menu */}
      <nav className="flex-1 overflow-y-auto py-3 px-2 space-y-4">
        {navSections.map((section, idx) => (
          <div key={idx} className="space-y-1">
            {section.title && (
              <div className="px-2.5 pb-1 text-[10px] font-bold text-[var(--foreground-subtle)] uppercase tracking-wider">
                {section.title}
              </div>
            )}
            <ul className="space-y-0.5">
              {section.items.map((item) => {
                const Icon = item.icon
                const active = isActive(item)
                return (
                  <li key={item.href}>
                    <Link
                      href={item.href}
                      className={cn(
                        'flex items-center gap-2.5 px-2.5 py-2 rounded-lg text-[13px] font-medium transition-colors',
                        active
                          ? 'bg-[var(--sidebar-active-bg)] text-[var(--sidebar-active-text)] font-semibold shadow-2xs'
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
          </div>
        ))}
      </nav>

      {/* Footer — Profile identity & Brand */}
      <div className="p-3 border-t border-[var(--border)] flex-shrink-0 bg-[var(--surface)]">
        <div className="flex items-center justify-between">
          <div className="min-w-0 pr-1">
            <p className="text-[12px] font-semibold text-[var(--foreground)] truncate">
              {profile?.full_name || 'Team Member'}
            </p>
            <p className="text-[10px] text-[var(--foreground-muted)] truncate">
              Growth OS Enterprise
            </p>
          </div>
          <span className="text-[10px] font-semibold px-2 py-0.5 rounded-full bg-gray-100 text-gray-700 capitalize border border-gray-200">
            {roleName}
          </span>
        </div>
      </div>
    </aside>
  )
}
