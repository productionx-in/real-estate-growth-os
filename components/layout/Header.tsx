'use client'
// components/layout/Header.tsx
import { useRouter, usePathname } from 'next/navigation'
import Link from 'next/link'
import { LogOut, Bell, ChevronRight, Building2 } from 'lucide-react'
import { NotificationBell } from '@/components/notifications/NotificationBell'
import { DutyToggle } from '@/components/routing/DutyToggle'
import { createClient } from '@/lib/supabase/client'
import type { MemberRole } from '@/types/database'
import type { AvailableOrgSummary } from '@/lib/dal/workspace'

export interface HeaderProps {
  orgId?: string
  orgName?: string
  orgSlug?: string
  orgType?: 'developer' | 'channel_partner'
  role?: MemberRole
  user?: { id: string; email?: string }
  profile?: { id: string; full_name: string; avatar_url: string | null; phone: string | null }
  availableOrgs?: AvailableOrgSummary[]
}

const ROLE_CONFIG: Record<MemberRole, { label: string; className: string }> = {
  owner: { label: 'Owner', className: 'bg-purple-50 text-purple-700 border-purple-200' },
  admin: { label: 'Admin', className: 'bg-blue-50 text-blue-700 border-blue-200' },
  manager: { label: 'Sales Manager', className: 'bg-indigo-50 text-indigo-700 border-indigo-200' },
  sales_exec: { label: 'Sales Executive', className: 'bg-emerald-50 text-emerald-700 border-emerald-200' },
  readonly: { label: 'Read Only', className: 'bg-gray-100 text-gray-700 border-gray-200' },
}

const SECTION_LABELS: Record<string, string> = {
  leads: 'Leads CRM',
  sales: 'Sales Operations',
  projects: 'Projects',
  inventory: 'Inventory Explorer',
  integrations: 'Integration Centre',
  analytics: 'Analytics & BI',
  team: 'Team Directory',
  settings: 'Workspace Settings',
  routing: 'Lead Routing',
  new: 'Create',
  import: 'Bulk Import',
  edit: 'Edit',
}

export function Header({
  orgId,
  orgName,
  orgSlug,
  role = 'sales_exec',
  profile,
}: HeaderProps) {
  const router = useRouter()
  const pathname = usePathname()
  const supabase = createClient()

  async function handleSignOut() {
    await supabase.auth.signOut()
    router.push('/login')
    router.refresh()
  }

  // Derive breadcrumb from current pathname
  const pathSegments = (pathname || '').split('/').filter(Boolean)
  // Skip the first segment if it matches orgSlug
  const sectionSegments = pathSegments.filter((seg) => seg !== orgSlug)
  const currentSection = sectionSegments[0]
    ? SECTION_LABELS[sectionSegments[0]] || sectionSegments[0].replace(/-/g, ' ')
    : 'Overview'

  const roleBadge = ROLE_CONFIG[role] ?? ROLE_CONFIG.sales_exec
  const initials = profile?.full_name
    ? profile.full_name
        .split(' ')
        .map((p) => p[0])
        .slice(0, 2)
        .join('')
        .toUpperCase()
    : 'U'

  return (
    <header
      style={{ height: 'var(--header-height)' }}
      className="flex-shrink-0 flex items-center justify-between px-6 bg-[var(--surface)] border-b border-[var(--border)] z-10"
    >
      {/* Left — Breadcrumb Navigation */}
      <div className="flex items-center gap-2 text-xs">
        <Link
          href={`/${orgSlug}`}
          className="font-medium text-[var(--foreground-muted)] hover:text-[var(--foreground)] transition-colors flex items-center gap-1.5"
        >
          <Building2 className="w-3.5 h-3.5 text-[var(--foreground-subtle)]" />
          <span>{orgName || 'Workspace'}</span>
        </Link>
        <ChevronRight className="w-3.5 h-3.5 text-[var(--border)] flex-shrink-0" />
        <span className="font-semibold text-[var(--foreground)] capitalize">
          {currentSection}
        </span>
      </div>

      {/* Right — Role context, User profile & Actions */}
      <div className="flex items-center gap-3">
        {orgId && role !== 'readonly' && <DutyToggle orgId={orgId} />}

        {/* Role Pill */}
        <span
          className={`inline-flex items-center px-2 py-0.5 rounded-full text-[11px] font-medium border ${roleBadge.className}`}
          title={`Active Workspace Role: ${roleBadge.label}`}
        >
          {roleBadge.label}
        </span>

        {/* User Profile */}
        <div className="flex items-center gap-2 pl-2 border-l border-[var(--border)]">
          <div className="w-7 h-7 rounded-full bg-[var(--brand)] text-white flex items-center justify-center text-[11px] font-bold shadow-2xs">
            {initials}
          </div>
          <span className="text-xs font-medium text-[var(--foreground)] hidden md:inline-block max-w-[120px] truncate">
            {profile?.full_name || 'User'}
          </span>
        </div>

        {/* Actions */}
        <div className="flex items-center gap-1">
          {orgId && orgSlug ? (
            <NotificationBell orgId={orgId} orgSlug={orgSlug} />
          ) : (
            <span className="w-8 h-8 rounded-md flex items-center justify-center text-[var(--foreground-muted)]" aria-hidden="true">
              <Bell className="w-4 h-4" />
            </span>
          )}
          <button
            onClick={handleSignOut}
            className="w-8 h-8 rounded-md flex items-center justify-center text-[var(--foreground-muted)] hover:bg-red-50 hover:text-red-600 transition-colors"
            title="Sign out"
            aria-label="Sign out"
          >
            <LogOut className="w-4 h-4" />
          </button>
        </div>
      </div>
    </header>
  )
}
