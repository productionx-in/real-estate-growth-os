'use client'
// components/projects/ProjectDetailTabs.tsx
import { useState, type ComponentProps } from 'react'
import {
  Building2,
  Users,
  FileText,
  Calendar,
  ShieldCheck,
  MapPin,
  ExternalLink,
  Sparkles,
} from 'lucide-react'
import { cn } from '@/lib/utils/cn'
import {
  type InventoryItemWithRelations,
  type ProjectCategory,
  PROJECT_CATEGORY_LABELS,
} from '@/types/inventory'
import type { MemberRole } from '@/types/database'
import { InventoryViewManager } from '@/components/inventory/InventoryViewManager'
import { LeadsTable } from '@/components/leads/LeadsTable'
import { EmptyState } from '@/components/shared/EmptyState'
import { formatDate } from '@/lib/utils/format'

interface ProjectDetailTabsProps {
  project: {
    id: string
    name: string
    code: string | null
    slug: string
    category: ProjectCategory
    status: string
    city: string | null
    location: string | null
    description: string | null
    rera_number: string | null
    total_area_value: number | null
    total_area_unit: string | null
    total_units_count: number | null
    approval_authority: string | null
    launch_date: string | null
    completion_date: string | null
    created_at: string
    org_id: string
    brochure_url?: string | null
    amenities?: string[] | null
    specifications?: Record<string, unknown> | null
  }
  inventoryItems: InventoryItemWithRelations[]
  leads: ComponentProps<typeof LeadsTable>['leads']
  orgSlug: string
  viewerRole: MemberRole
  isManager: boolean
}

type TabType = 'inventory' | 'leads' | 'overview'

export function ProjectDetailTabs({
  project,
  inventoryItems,
  leads,
  orgSlug,
  viewerRole,
  isManager,
}: ProjectDetailTabsProps) {
  const [activeTab, setActiveTab] = useState<TabType>('inventory')

  return (
    <div className="space-y-6">
      {/* Tab Navigation */}
      <div className="border-b border-[var(--border)]">
        <nav className="flex space-x-6">
          <button
            onClick={() => setActiveTab('inventory')}
            className={cn(
              'pb-3 text-[13px] font-medium border-b-2 flex items-center gap-2 transition-colors',
              activeTab === 'inventory'
                ? 'border-[var(--brand)] text-[var(--brand)] font-semibold'
                : 'border-transparent text-[var(--foreground-muted)] hover:text-[var(--foreground)]'
            )}
          >
            <Building2 className="w-4 h-4" />
            Inventory ({inventoryItems.length})
          </button>

          <button
            onClick={() => setActiveTab('leads')}
            className={cn(
              'pb-3 text-[13px] font-medium border-b-2 flex items-center gap-2 transition-colors',
              activeTab === 'leads'
                ? 'border-[var(--brand)] text-[var(--brand)] font-semibold'
                : 'border-transparent text-[var(--foreground-muted)] hover:text-[var(--foreground)]'
            )}
          >
            <Users className="w-4 h-4" />
            Leads ({leads.length})
          </button>

          <button
            onClick={() => setActiveTab('overview')}
            className={cn(
              'pb-3 text-[13px] font-medium border-b-2 flex items-center gap-2 transition-colors',
              activeTab === 'overview'
                ? 'border-[var(--brand)] text-[var(--brand)] font-semibold'
                : 'border-transparent text-[var(--foreground-muted)] hover:text-[var(--foreground)]'
            )}
          >
            <FileText className="w-4 h-4" />
            Project Specifications
          </button>
        </nav>
      </div>

      {/* Tab 1: Inventory View */}
      {activeTab === 'inventory' && (
        <div>
          <InventoryViewManager
            projectId={project.id}
            projectCategory={project.category}
            initialItems={inventoryItems}
            isManager={isManager}
          />
        </div>
      )}

      {/* Tab 2: Leads View */}
      {activeTab === 'leads' && (
        <div className="space-y-4">
          {leads && leads.length > 0 ? (
            <LeadsTable
              leads={leads}
              orgSlug={orgSlug}
              orgId={project.org_id}
              viewerRole={viewerRole}
            />
          ) : (
            <EmptyState
              icon={Users}
              title="No leads for this project"
              description="Leads linked to this project will appear here for assignment and status tracking."
            />
          )}
        </div>
      )}

      {/* Tab 3: Project Specifications & Overview */}
      {activeTab === 'overview' && (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
          {/* Card 1: Core Specifications */}
          <div className="bg-[var(--surface)] border border-[var(--border)] rounded-lg p-5 space-y-4">
            <h3 className="text-[14px] font-semibold text-[var(--foreground)] flex items-center gap-2 border-b border-[var(--border)] pb-2.5">
              <Building2 className="w-4 h-4 text-[var(--brand)]" />
              General Details
            </h3>

            <dl className="space-y-2.5 text-[13px]">
              <div>
                <dt className="text-[var(--foreground-muted)] text-[11px] uppercase tracking-wide">
                  Category
                </dt>
                <dd className="font-medium text-[var(--foreground)] mt-0.5">
                  {PROJECT_CATEGORY_LABELS[project.category] ?? project.category}
                </dd>
              </div>

              <div>
                <dt className="text-[var(--foreground-muted)] text-[11px] uppercase tracking-wide">
                  Project Code
                </dt>
                <dd className="font-mono text-xs font-semibold text-blue-700 bg-blue-50 px-2 py-0.5 rounded inline-block mt-0.5">
                  {project.code || 'N/A'}
                </dd>
              </div>

              <div>
                <dt className="text-[var(--foreground-muted)] text-[11px] uppercase tracking-wide">
                  Location / Micro-market
                </dt>
                <dd className="font-medium text-[var(--foreground)] mt-0.5 flex items-center gap-1">
                  <MapPin className="w-3.5 h-3.5 text-gray-400" />
                  {project.location || 'N/A'}, {project.city || 'Hyderabad'}
                </dd>
              </div>

              <div>
                <dt className="text-[var(--foreground-muted)] text-[11px] uppercase tracking-wide">
                  Total Planned Units / Plots
                </dt>
                <dd className="font-medium text-[var(--foreground)] mt-0.5">
                  {project.total_units_count ?? 0} units
                </dd>
              </div>

              <div>
                <dt className="text-[var(--foreground-muted)] text-[11px] uppercase tracking-wide">
                  Project Extent / Land Area
                </dt>
                <dd className="font-medium text-[var(--foreground)] mt-0.5">
                  {project.total_area_value
                    ? `${project.total_area_value} ${project.total_area_unit ?? 'acres'}`
                    : 'N/A'}
                </dd>
              </div>
            </dl>
          </div>

          {/* Card 2: Regulatory & Timeline */}
          <div className="bg-[var(--surface)] border border-[var(--border)] rounded-lg p-5 space-y-4">
            <h3 className="text-[14px] font-semibold text-[var(--foreground)] flex items-center gap-2 border-b border-[var(--border)] pb-2.5">
              <ShieldCheck className="w-4 h-4 text-emerald-600" />
              RERA & Approvals
            </h3>

            <dl className="space-y-2.5 text-[13px]">
              <div>
                <dt className="text-[var(--foreground-muted)] text-[11px] uppercase tracking-wide">
                  RERA Registration
                </dt>
                <dd className="font-mono text-xs font-semibold text-emerald-700 bg-emerald-50 px-2 py-0.5 rounded inline-block mt-0.5">
                  {project.rera_number || 'Awaiting RERA'}
                </dd>
              </div>

              <div>
                <dt className="text-[var(--foreground-muted)] text-[11px] uppercase tracking-wide">
                  Sanctioning Authority
                </dt>
                <dd className="font-medium text-[var(--foreground)] mt-0.5">
                  {project.approval_authority || 'HMDA / GHMC'}
                </dd>
              </div>

              <div>
                <dt className="text-[var(--foreground-muted)] text-[11px] uppercase tracking-wide">
                  Launch Date
                </dt>
                <dd className="font-medium text-[var(--foreground)] mt-0.5 flex items-center gap-1.5">
                  <Calendar className="w-3.5 h-3.5 text-gray-400" />
                  {project.launch_date ? formatDate(project.launch_date) : 'N/A'}
                </dd>
              </div>

              <div>
                <dt className="text-[var(--foreground-muted)] text-[11px] uppercase tracking-wide">
                  Expected Completion
                </dt>
                <dd className="font-medium text-[var(--foreground)] mt-0.5 flex items-center gap-1.5">
                  <Calendar className="w-3.5 h-3.5 text-gray-400" />
                  {project.completion_date ? formatDate(project.completion_date) : 'N/A'}
                </dd>
              </div>

              <div>
                <dt className="text-[var(--foreground-muted)] text-[11px] uppercase tracking-wide">
                  Record Created
                </dt>
                <dd className="font-medium text-[var(--foreground)] mt-0.5">
                  {formatDate(project.created_at)}
                </dd>
              </div>
            </dl>
          </div>

          {/* Card 3: Narrative & Description */}
          <div className="bg-[var(--surface)] border border-[var(--border)] rounded-lg p-5 space-y-4">
            <h3 className="text-[14px] font-semibold text-[var(--foreground)] flex items-center gap-2 border-b border-[var(--border)] pb-2.5">
              <FileText className="w-4 h-4 text-blue-600" />
              Project Description
            </h3>

            {project.description ? (
              <p className="text-[13px] text-[var(--foreground-muted)] leading-relaxed whitespace-pre-line">
                {project.description}
              </p>
            ) : (
              <p className="text-[13px] text-[var(--foreground-subtle)] italic">
                No description provided for this project.
              </p>
            )}

            {project.brochure_url && (
              <div className="pt-2 border-t border-[var(--border)]">
                <a
                  href={project.brochure_url}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="inline-flex items-center gap-1.5 text-[12px] font-medium text-[var(--brand)] hover:underline"
                >
                  <ExternalLink className="w-3.5 h-3.5" />
                  View Project Brochure / Collateral
                </a>
              </div>
            )}
          </div>

          {/* Card 4: Amenities (if present) */}
          {Array.isArray(project.amenities) && project.amenities.length > 0 && (
            <div className="bg-[var(--surface)] border border-[var(--border)] rounded-lg p-5 space-y-4 md:col-span-2 lg:col-span-3">
              <h3 className="text-[14px] font-semibold text-[var(--foreground)] flex items-center gap-2 border-b border-[var(--border)] pb-2.5">
                <Sparkles className="w-4 h-4 text-amber-500" />
                Featured Amenities & Highlights
              </h3>
              <div className="flex flex-wrap gap-2">
                {project.amenities.map((amenity, idx) => (
                  <span
                    key={idx}
                    className="inline-flex items-center px-3 py-1 rounded-full text-[12px] font-medium bg-emerald-50 text-emerald-800 border border-emerald-200"
                  >
                    ✓ {amenity}
                  </span>
                ))}
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  )
}
