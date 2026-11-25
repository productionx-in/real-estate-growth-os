'use client'
// components/inventory/OrgInventoryExplorer.tsx
import { useStatusLabels } from '@/components/settings/WorkspacePrefs'
import { Input, Select } from '@/components/ui'
import { useState, useMemo } from 'react'
import Link from 'next/link'
import {
  Search,
  Building2,
  Layers,
  ArrowRight,
} from 'lucide-react'
import {
  type InventoryItemWithRelations,
  type InventoryStatus,
  type ProjectCategory,
} from '@/types/inventory'
import { InventoryTable } from './InventoryTable'
import { EmptyState } from '@/components/shared/EmptyState'

interface OrgInventoryExplorerProps {
  projects: {
    id: string
    name: string
    slug: string
    code: string | null
    category: ProjectCategory
  }[]
  initialItems: InventoryItemWithRelations[]
  orgSlug: string
  isManager?: boolean
}

export function OrgInventoryExplorer({
  projects,
  initialItems,
  orgSlug,
}: OrgInventoryExplorerProps) {
  const statusLabels = useStatusLabels()
  const [items] = useState<InventoryItemWithRelations[]>(initialItems)
  const [searchQuery, setSearchQuery] = useState('')
  const [selectedProject, setSelectedProject] = useState<string>('all')
  const [selectedCategory, setSelectedCategory] = useState<string>('all')
  const [selectedStatus, setSelectedStatus] = useState<string>('all')
  const [selectedBhk, setSelectedBhk] = useState<string>('all')

  // Overall metrics
  const metrics = useMemo(() => {
    const counts: Record<InventoryStatus, number> = {
      available: 0,
      on_hold: 0,
      booked: 0,
      sold: 0,
      blocked: 0,
    }
    items.forEach((item) => {
      if (counts[item.status] !== undefined) {
        counts[item.status] += 1
      }
    })
    return counts
  }, [items])

  // Filtered items
  const filteredItems = useMemo(() => {
    return items.filter((item) => {
      if (selectedProject !== 'all' && item.project_id !== selectedProject) return false
      if (selectedCategory !== 'all' && item.category !== selectedCategory) return false
      if (selectedStatus !== 'all' && item.status !== selectedStatus) return false
      if (selectedBhk !== 'all' && item.bhk_config !== selectedBhk) return false
      if (searchQuery.trim()) {
        const q = searchQuery.toLowerCase()
        const unitMatch = item.unit_number.toLowerCase().includes(q)
        const towerMatch = item.tower_name?.toLowerCase().includes(q) ?? false
        const projMatch = item.project?.name?.toLowerCase().includes(q) ?? false
        if (!unitMatch && !towerMatch && !projMatch) return false
      }
      return true
    })
  }, [items, selectedProject, selectedCategory, selectedStatus, selectedBhk, searchQuery])

  return (
    <div className="space-y-6">
      {/* Counts by status: one neutral strip; colour only marks the status, the label says it. */}
      <dl className="surface-raised grid grid-cols-3 overflow-hidden rounded-2xl border border-default bg-surface sm:grid-cols-6">
        {([
          ['Total units', items.length, null],
          [statusLabels.available, metrics.available, 'bg-success'],
          [statusLabels.on_hold, metrics.on_hold, 'bg-warning'],
          [statusLabels.booked, metrics.booked, 'bg-brand'],
          [statusLabels.sold, metrics.sold, 'bg-foreground'],
          [statusLabels.blocked, metrics.blocked, 'bg-danger'],
        ] as const).map(([label, value, dot], i) => (
          <div key={label} className={`px-4 py-3 ${i % 3 ? 'border-l border-default' : ''} ${i >= 3 ? 'border-t border-default sm:border-t-0' : ''} ${i === 3 ? 'sm:border-l' : ''}`}>
            <dt className="flex items-center gap-1.5 text-[12px] text-muted">
              {dot && <span aria-hidden className={`size-2 rounded-full ${dot}`} />}
              {label}
            </dt>
            <dd className="tabular mt-0.5 text-[20px] font-semibold text-foreground">{value}</dd>
          </div>
        ))}
      </dl>

      {/* Filter and Search Bar */}
      <div className="bg-[var(--surface)] border border-[var(--border)] rounded-xl p-3.5 flex flex-wrap items-center gap-3 shadow-2xs">
        {/* Search */}
        <div className="relative flex-1 min-w-[220px]">
          <Search className="w-3.5 h-3.5 absolute left-3 top-1/2 -translate-y-1/2 text-[var(--foreground-muted)]" />
          <Input
            type="text"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="Search by unit number, tower, project..."
            className="pl-8 pr-3"
          />
        </div>

        {/* Project Selector */}
        <div className="flex items-center gap-1.5">
          <span className="text-xs text-[var(--foreground-muted)] font-medium">Project:</span>
          <Select
            value={selectedProject}
            onChange={(e) => setSelectedProject(e.target.value)}>
            <option value="all">All Projects ({projects.length})</option>
            {projects.map((p) => (
              <option key={p.id} value={p.id}>
                {p.name} {p.code ? `(${p.code})` : ''}
              </option>
            ))}
          </Select>
        </div>

        {/* Category Selector */}
        <div className="flex items-center gap-1.5">
          <span className="text-xs text-[var(--foreground-muted)] font-medium">Category:</span>
          <Select
            value={selectedCategory}
            onChange={(e) => setSelectedCategory(e.target.value)}>
            <option value="all">All Categories</option>
            <option value="apartments">Apartments</option>
            <option value="plotted_developments">Plotted Developments</option>
            <option value="commercial_sale">Commercial Sale</option>
            <option value="villas_gated_communities">Villas & Communities</option>
            <option value="mixed_use">Mixed-Use</option>
          </Select>
        </div>

        {/* Status Selector */}
        <div className="flex items-center gap-1.5">
          <span className="text-xs text-[var(--foreground-muted)] font-medium">Status:</span>
          <Select
            value={selectedStatus}
            onChange={(e) => setSelectedStatus(e.target.value)}>
            <option value="all">All Statuses</option>
            {(Object.keys(statusLabels) as (keyof typeof statusLabels)[]).map((k) => <option key={k} value={k}>{statusLabels[k]}</option>)}
          </Select>
        </div>

        {/* BHK Selector */}
        <div className="flex items-center gap-1.5">
          <span className="text-xs text-[var(--foreground-muted)] font-medium">BHK:</span>
          <Select
            value={selectedBhk}
            onChange={(e) => setSelectedBhk(e.target.value)}>
            <option value="all">All BHK</option>
            <option value="1 BHK">1 BHK</option>
            <option value="2 BHK">2 BHK</option>
            <option value="2.5 BHK">2.5 BHK</option>
            <option value="3 BHK">3 BHK</option>
            <option value="3.5 BHK">3.5 BHK</option>
            <option value="4 BHK">4 BHK</option>
            <option value="5+ BHK">5+ BHK</option>
          </Select>
        </div>
      </div>

      {/* Project Jump Shortcuts */}
      {selectedProject === 'all' && projects.length > 0 && (
        <div className="bg-[var(--surface)] border border-[var(--border)] rounded-xl p-4 shadow-2xs">
          <div className="text-xs font-semibold text-[var(--foreground)] mb-3 flex items-center justify-between">
            <span className="flex items-center gap-1.5">
              <Building2 className="w-4 h-4 text-[var(--brand)]" />
              Quick Project Inventory Matrices
            </span>
            <span className="text-[11px] text-[var(--foreground-muted)] font-normal">
              Click to open interactive visual tower/plot matrix
            </span>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-2.5">
            {projects.map((p) => {
              const projectUnits = items.filter((i) => i.project_id === p.id)
              const available = projectUnits.filter((i) => i.status === 'available').length

              return (
                <Link
                  key={p.id}
                  href={`/${orgSlug}/projects/${p.id}`}
                  className="flex items-center justify-between p-2.5 rounded-lg border border-[var(--border)] bg-[var(--surface-muted)] hover:bg-[var(--surface-hover)] hover:border-[var(--brand)] transition-all group"
                >
                  <div className="min-w-0 pr-2">
                    <div className="text-xs font-medium text-[var(--foreground)] truncate group-hover:text-[var(--brand)]">
                      {p.name}
                    </div>
                    <div className="text-[11px] text-[var(--foreground-muted)] flex items-center gap-1 mt-0.5">
                      <span>{projectUnits.length} units</span>
                      <span>·</span>
                      <span className="text-success font-medium">{available} avail</span>
                    </div>
                  </div>
                  <ArrowRight className="w-3.5 h-3.5 text-subtle group-hover:text-[var(--brand)] group-hover:translate-x-0.5 transition-all flex-shrink-0" />
                </Link>
              )
            })}
          </div>
        </div>
      )}

      {/* Main Inventory Table */}
      {filteredItems.length > 0 ? (
        <InventoryTable
          items={filteredItems}
          onItemUpdated={() => {
            // refresh data
            window.location.reload()
          }}
        />
      ) : (
        <EmptyState
          icon={Layers}
          title="No inventory units found"
          description={
            searchQuery || selectedProject !== 'all' || selectedStatus !== 'all'
              ? 'Try adjusting your filters or search query.'
              : 'Add inventory units to your projects to manage availability, tower matrices, and bookings.'
          }
        />
      )}
    </div>
  )
}
