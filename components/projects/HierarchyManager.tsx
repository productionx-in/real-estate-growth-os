'use client'
// components/projects/HierarchyManager.tsx
// Comprehensive Project Hierarchy Tree & Management Interface (Stage 3B)
import { useState, useEffect, useCallback, useMemo } from 'react'
import {
  FolderTree,
  ChevronRight,
  ChevronDown,
  Plus,
  Pencil,
  Trash2,
  Building2,
  Layers,
  Box,
  Network,
  AlertCircle,
  Loader2,
  CheckCircle2,
  ArrowRight,
  RefreshCw,
  X,
  Compass,
} from 'lucide-react'
import { cn } from '@/lib/utils/cn'
import type { ProjectCategory } from '@/types/inventory'
import {
  CATEGORY_NODE_TYPES,
  HIERARCHY_NODE_TYPE_LABELS,
  MIXED_USE_COMPONENT_TYPES,
  type HierarchyNodeType,
} from '@/lib/validations/hierarchy'
import type { HierarchyNodeWithStats, HierarchyTreeResult } from '@/lib/dal/hierarchy'

interface HierarchyManagerProps {
  projectId: string
  orgSlug?: string
  projectCategory: ProjectCategory
  isManager: boolean
  onSelectNodeForInventory?: (nodeId: string, nodeName: string) => void
}

interface NodeFormData {
  name: string
  node_type: string
  code: string
  sequence_order: number
  description: string
  parent_id: string | null
  component_type?: string
}

const DEFAULT_FORM: NodeFormData = {
  name: '',
  node_type: '',
  code: '',
  sequence_order: 0,
  description: '',
  parent_id: null,
  component_type: 'Residential',
}

function getNodeIcon(nodeType: string) {
  const type = nodeType.toLowerCase()
  if (type === 'tower' || type === 'building') return Building2
  if (type === 'floor' || type === 'wing') return Layers
  if (type === 'block' || type === 'sector') return Box
  if (type === 'cluster' || type === 'component') return Network
  if (type === 'street' || type === 'phase') return Compass
  return FolderTree
}

export function HierarchyManager({
  projectId,
  projectCategory,
  isManager,
  onSelectNodeForInventory,
}: HierarchyManagerProps) {
  const [data, setData] = useState<HierarchyTreeResult | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [actionSuccess, setActionSuccess] = useState<string | null>(null)

  // Expand / collapse state
  const [expandedNodes, setExpandedNodes] = useState<Set<string>>(new Set())

  // Modal State
  const [isModalOpen, setIsModalOpen] = useState(false)
  const [modalMode, setModalMode] = useState<'create_root' | 'create_child' | 'edit'>('create_root')
  const [selectedParentNode, setSelectedParentNode] = useState<{ id: string; name: string } | null>(null)
  const [editingNodeId, setEditingNodeId] = useState<string | null>(null)
  const [formData, setFormData] = useState<NodeFormData>(DEFAULT_FORM)
  const [formSubmitting, setFormSubmitting] = useState(false)
  const [formError, setFormError] = useState<string | null>(null)

  // Delete State
  const [deleteConfirmNode, setDeleteConfirmNode] = useState<{ id: string; name: string } | null>(null)
  const [deleting, setDeleting] = useState(false)
  const [deleteError, setDeleteError] = useState<string | null>(null)

  // Suggested node types for this project category
  const suggestedTypes = useMemo(() => {
    return CATEGORY_NODE_TYPES[projectCategory] ?? ['phase', 'tower', 'floor', 'block']
  }, [projectCategory])

  // Initial fetch using asynchronous promise resolution to avoid synchronous setState in effect
  useEffect(() => {
    let ignore = false
    fetch(`/api/projects/${projectId}/hierarchy`)
      .then((res) => {
        if (!res.ok) throw new Error(`Failed to fetch hierarchy (${res.status})`)
        return res.json()
      })
      .then((json: HierarchyTreeResult) => {
        if (!ignore) {
          setData(json)
          setLoading(false)
          setExpandedNodes((prev) => {
            if (prev.size > 0) return prev
            const next = new Set<string>()
            json.nodes.forEach((r) => {
              next.add(r.id)
              r.children.forEach((c) => next.add(c.id))
            })
            return next
          })
        }
      })
      .catch((err: unknown) => {
        if (!ignore) {
          setError(err instanceof Error ? err.message : 'Failed to load project hierarchy')
          setLoading(false)
        }
      })

    return () => {
      ignore = true
    }
  }, [projectId])

  const refreshHierarchy = useCallback(async () => {
    setLoading(true)
    setError(null)
    try {
      const res = await fetch(`/api/projects/${projectId}/hierarchy`)
      if (!res.ok) {
        const json = await res.json().catch(() => ({}))
        throw new Error(json.error || `Failed to fetch hierarchy (${res.status})`)
      }
      const json: HierarchyTreeResult = await res.json()
      setData(json)
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Failed to load project hierarchy')
    } finally {
      setLoading(false)
    }
  }, [projectId])

  // Clear toast notifications after 4 seconds
  useEffect(() => {
    if (actionSuccess) {
      const timer = setTimeout(() => setActionSuccess(null), 4000)
      return () => clearTimeout(timer)
    }
  }, [actionSuccess])

  const toggleExpand = (nodeId: string) => {
    setExpandedNodes((prev) => {
      const next = new Set(prev)
      if (next.has(nodeId)) next.delete(nodeId)
      else next.add(nodeId)
      return next
    })
  }

  const expandAll = () => {
    if (!data) return
    const all = new Set<string>()
    function collect(nodes: HierarchyNodeWithStats[]) {
      for (const n of nodes) {
        all.add(n.id)
        if (n.children.length > 0) collect(n.children)
      }
    }
    collect(data.nodes)
    setExpandedNodes(all)
  }

  const collapseAll = () => {
    setExpandedNodes(new Set())
  }

  // Open Modal Helpers
  const openCreateRoot = () => {
    setModalMode('create_root')
    setSelectedParentNode(null)
    setEditingNodeId(null)
    setFormData({
      ...DEFAULT_FORM,
      node_type: suggestedTypes[0] || 'phase',
    })
    setFormError(null)
    setIsModalOpen(true)
  }

  const openCreateChild = (parent: { id: string; name: string; node_type: string }) => {
    setModalMode('create_child')
    setSelectedParentNode({ id: parent.id, name: parent.name })
    setEditingNodeId(null)

    // Suggest next sensible child type in hierarchy chain
    const parentTypeIdx = suggestedTypes.indexOf(parent.node_type.toLowerCase() as HierarchyNodeType)
    const nextType =
      parentTypeIdx >= 0 && parentTypeIdx < suggestedTypes.length - 1
        ? suggestedTypes[parentTypeIdx + 1]
        : suggestedTypes[suggestedTypes.length - 1] || 'floor'

    setFormData({
      ...DEFAULT_FORM,
      node_type: nextType,
      parent_id: parent.id,
    })
    setFormError(null)
    setIsModalOpen(true)
  }

  const openEdit = (node: HierarchyNodeWithStats) => {
    setModalMode('edit')
    setEditingNodeId(node.id)
    setSelectedParentNode(
      node.parent_id ? { id: node.parent_id, name: 'Parent Node' } : null
    )
    const desc = typeof node.metadata?.description === 'string' ? node.metadata.description : ''
    const compType =
      typeof node.metadata?.component_type === 'string' ? node.metadata.component_type : 'Residential'

    setFormData({
      name: node.name,
      node_type: node.node_type,
      code: node.code || '',
      sequence_order: node.sequence_order,
      description: desc,
      parent_id: node.parent_id,
      component_type: compType,
    })
    setFormError(null)
    setIsModalOpen(true)
  }

  // Save Modal Action (Create or Update)
  const handleSubmitForm = async (e: React.FormEvent) => {
    e.preventDefault()
    setFormSubmitting(true)
    setFormError(null)

    if (!formData.name.trim()) {
      setFormError('Node name is required')
      setFormSubmitting(false)
      return
    }

    try {
      const metadataPayload: Record<string, unknown> = {}
      if (formData.description.trim()) {
        metadataPayload.description = formData.description.trim()
      }
      if (formData.node_type.toLowerCase() === 'component' && formData.component_type) {
        metadataPayload.component_type = formData.component_type
      }

      if (modalMode === 'edit' && editingNodeId) {
        // PATCH
        const res = await fetch(`/api/projects/${projectId}/hierarchy/${editingNodeId}`, {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            name: formData.name.trim(),
            node_type: formData.node_type.trim(),
            code: formData.code.trim() || null,
            sequence_order: formData.sequence_order,
            description: formData.description.trim() || null,
            metadata: metadataPayload,
          }),
        })

        const json = await res.json().catch(() => ({}))
        if (!res.ok) {
          throw new Error(json.error || `Failed to update node (${res.status})`)
        }
        setActionSuccess(`Updated node "${formData.name.trim()}" successfully`)
      } else {
        // POST
        const res = await fetch(`/api/projects/${projectId}/hierarchy`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            name: formData.name.trim(),
            node_type: formData.node_type.trim(),
            code: formData.code.trim() || null,
            parent_id: formData.parent_id || null,
            sequence_order: formData.sequence_order,
            description: formData.description.trim() || null,
            metadata: metadataPayload,
          }),
        })

        const json = await res.json().catch(() => ({}))
        if (!res.ok) {
          throw new Error(json.error || `Failed to create node (${res.status})`)
        }
        setActionSuccess(`Created node "${formData.name.trim()}" successfully`)
        if (formData.parent_id) {
          setExpandedNodes((prev) => new Set(prev).add(formData.parent_id!))
        }
      }

      setIsModalOpen(false)
      await refreshHierarchy()
    } catch (err: unknown) {
      setFormError(err instanceof Error ? err.message : 'An error occurred while saving')
    } finally {
      setFormSubmitting(false)
    }
  }

  // Handle Safe Deletion
  const handleDeleteNode = async () => {
    if (!deleteConfirmNode) return
    setDeleting(true)
    setDeleteError(null)

    try {
      const res = await fetch(`/api/projects/${projectId}/hierarchy/${deleteConfirmNode.id}`, {
        method: 'DELETE',
      })
      const json = await res.json().catch(() => ({}))

      if (!res.ok) {
        throw new Error(json.error || `Cannot delete node (${res.status})`)
      }

      setActionSuccess(`Deleted node "${deleteConfirmNode.name}" successfully`)
      setDeleteConfirmNode(null)
      await refreshHierarchy()
    } catch (err: unknown) {
      setDeleteError(err instanceof Error ? err.message : 'Failed to delete node')
    } finally {
      setDeleting(false)
    }
  }

  // Recursive Tree Node Renderer
  const renderTreeNode = (node: HierarchyNodeWithStats, depth = 0) => {
    const hasChildren = node.children && node.children.length > 0
    const isExpanded = expandedNodes.has(node.id)
    const Icon = getNodeIcon(node.node_type)
    const totalUnits = node.total_units_count
    const bd = node.status_breakdown

    return (
      <div key={node.id} className="relative group">
        <div
          className={cn(
            'flex flex-wrap items-center justify-between gap-2 p-2.5 rounded-lg border transition-all my-1.5',
            'bg-[var(--surface)] hover:bg-[var(--surface-muted)] border-[var(--border)]',
            depth === 0 ? 'shadow-2xs font-medium' : 'text-[13px]'
          )}
          style={{ marginLeft: `${Math.min(depth * 20, 100)}px` }}
        >
          {/* Left: Expander & Node Identity */}
          <div className="flex items-center gap-2 min-w-0 flex-1">
            {hasChildren ? (
              <button
                type="button"
                onClick={() => toggleExpand(node.id)}
                className="p-1 rounded hover:bg-[var(--surface-hover)] text-[var(--foreground-muted)] transition-colors"
                aria-label={isExpanded ? 'Collapse' : 'Expand'}
              >
                {isExpanded ? (
                  <ChevronDown className="w-4 h-4 text-[var(--brand)]" />
                ) : (
                  <ChevronRight className="w-4 h-4" />
                )}
              </button>
            ) : (
              <span className="w-6 inline-block" />
            )}

            <div className="p-1.5 rounded-md bg-blue-50 text-[var(--brand)] border border-blue-100 flex-shrink-0">
              <Icon className="w-4 h-4" />
            </div>

            <div className="min-w-0">
              <div className="flex items-center gap-2">
                <span className="font-semibold text-[var(--foreground)] truncate text-xs sm:text-sm">
                  {node.name}
                </span>
                {node.code && (
                  <span className="font-mono text-[10px] px-1.5 py-0.5 rounded bg-gray-100 text-gray-700 border border-gray-200">
                    {node.code}
                  </span>
                )}
                <span className="text-[10px] uppercase font-semibold tracking-wider text-[var(--foreground-subtle)] bg-[var(--surface-muted)] px-1.5 py-0.5 rounded">
                  {node.node_type}
                </span>
              </div>
              {typeof node.metadata?.description === 'string' && node.metadata.description && (
                <p className="text-[11px] text-[var(--foreground-muted)] truncate max-w-md mt-0.5">
                  {node.metadata.description}
                </p>
              )}
            </div>
          </div>

          {/* Center: Inventory Statistics Badges */}
          <div className="flex items-center gap-1.5 flex-wrap">
            {totalUnits > 0 ? (
              <div className="flex items-center gap-1 text-[11px]">
                <span className="font-medium text-[var(--foreground)] bg-[var(--surface-muted)] border border-[var(--border)] px-2 py-0.5 rounded-full">
                  {totalUnits} {totalUnits === 1 ? 'unit' : 'units'}
                </span>
                {bd.available > 0 && (
                  <span className="px-1.5 py-0.5 rounded-full bg-emerald-50 text-emerald-700 border border-emerald-200 font-medium">
                    {bd.available} avail
                  </span>
                )}
                {bd.booked > 0 && (
                  <span className="px-1.5 py-0.5 rounded-full bg-blue-50 text-blue-700 border border-blue-200 font-medium">
                    {bd.booked} booked
                  </span>
                )}
                {bd.sold > 0 && (
                  <span className="px-1.5 py-0.5 rounded-full bg-purple-50 text-purple-700 border border-purple-200 font-medium">
                    {bd.sold} sold
                  </span>
                )}
                {bd.on_hold > 0 && (
                  <span className="px-1.5 py-0.5 rounded-full bg-amber-50 text-amber-700 border border-amber-200 font-medium">
                    {bd.on_hold} hold
                  </span>
                )}
                {bd.blocked > 0 && (
                  <span className="px-1.5 py-0.5 rounded-full bg-red-50 text-red-700 border border-red-200 font-medium">
                    {bd.blocked} blocked
                  </span>
                )}
              </div>
            ) : (
              <span className="text-[11px] text-[var(--foreground-subtle)] italic">
                0 units
              </span>
            )}
          </div>

          {/* Right: Actions */}
          <div className="flex items-center gap-1">
            {onSelectNodeForInventory && totalUnits > 0 && (
              <button
                type="button"
                onClick={() => onSelectNodeForInventory(node.id, node.name)}
                className="text-[11px] inline-flex items-center gap-1 px-2 py-1 rounded text-[var(--brand)] hover:bg-blue-50 transition-colors"
                title="Filter Inventory tab by this node"
              >
                <span>View Units</span>
                <ArrowRight className="w-3 h-3" />
              </button>
            )}

            {isManager && (
              <>
                <button
                  type="button"
                  onClick={() => openCreateChild(node)}
                  className="p-1 rounded text-[var(--foreground-muted)] hover:text-[var(--brand)] hover:bg-blue-50 transition-colors"
                  title={`Add child node under ${node.name}`}
                >
                  <Plus className="w-3.5 h-3.5" />
                </button>

                <button
                  type="button"
                  onClick={() => openEdit(node)}
                  className="p-1 rounded text-[var(--foreground-muted)] hover:text-[var(--foreground)] hover:bg-[var(--surface-hover)] transition-colors"
                  title={`Edit ${node.name}`}
                >
                  <Pencil className="w-3.5 h-3.5" />
                </button>

                <button
                  type="button"
                  onClick={() => {
                    setDeleteConfirmNode({ id: node.id, name: node.name })
                    setDeleteError(null)
                  }}
                  className="p-1 rounded text-[var(--foreground-muted)] hover:text-red-600 hover:bg-red-50 transition-colors"
                  title={`Delete ${node.name}`}
                >
                  <Trash2 className="w-3.5 h-3.5" />
                </button>
              </>
            )}
          </div>
        </div>

        {/* Render Children Recursively */}
        {hasChildren && isExpanded && (
          <div className="pl-2 border-l border-[var(--border)] ml-4">
            {node.children.map((child) => renderTreeNode(child, depth + 1))}
          </div>
        )}
      </div>
    )
  }

  return (
    <div className="space-y-4">
      {/* Toast Alert Banner */}
      {actionSuccess && (
        <div className="p-3 rounded-lg bg-emerald-50 border border-emerald-200 text-emerald-800 text-xs flex items-center justify-between">
          <div className="flex items-center gap-2">
            <CheckCircle2 className="w-4 h-4 text-emerald-600" />
            <span>{actionSuccess}</span>
          </div>
          <button
            onClick={() => setActionSuccess(null)}
            className="text-emerald-600 hover:text-emerald-900"
          >
            <X className="w-3.5 h-3.5" />
          </button>
        </div>
      )}

      {/* Top Header & Overview Bar */}
      <div className="flex flex-wrap items-center justify-between gap-3 p-4 rounded-xl bg-[var(--surface)] border border-[var(--border)]">
        <div>
          <div className="flex items-center gap-2">
            <FolderTree className="w-4 h-4 text-[var(--brand)]" />
            <h2 className="text-sm font-semibold text-[var(--foreground)]">
              Project Structure & Hierarchy
            </h2>
          </div>
          <p className="text-xs text-[var(--foreground-muted)] mt-0.5">
            Organise phases, towers, blocks, sectors, and floors. Hierarchy levels are completely optional.
          </p>
        </div>

        {/* Global Control Buttons */}
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={expandAll}
            className="px-2.5 py-1 text-xs rounded border border-[var(--border)] bg-[var(--surface)] text-[var(--foreground)] hover:bg-[var(--surface-muted)] transition-colors"
          >
            Expand All
          </button>
          <button
            type="button"
            onClick={collapseAll}
            className="px-2.5 py-1 text-xs rounded border border-[var(--border)] bg-[var(--surface)] text-[var(--foreground)] hover:bg-[var(--surface-muted)] transition-colors"
          >
            Collapse All
          </button>
          <button
            type="button"
            onClick={refreshHierarchy}
            className="p-1.5 rounded border border-[var(--border)] bg-[var(--surface)] text-[var(--foreground-muted)] hover:text-[var(--foreground)] transition-colors"
            title="Refresh Hierarchy"
          >
            <RefreshCw className={cn('w-3.5 h-3.5', loading && 'animate-spin')} />
          </button>

          {isManager && (
            <button
              type="button"
              onClick={openCreateRoot}
              className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium bg-[var(--brand)] text-white hover:bg-[var(--brand-dark)] transition-colors shadow-2xs"
            >
              <Plus className="w-3.5 h-3.5" />
              Add Root Node
            </button>
          )}
        </div>
      </div>

      {/* Summary KPI Strip */}
      {data && (
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 text-xs">
          <div className="p-3 rounded-lg bg-[var(--surface)] border border-[var(--border)]">
            <span className="text-[var(--foreground-muted)] block text-[11px]">Total Hierarchy Nodes</span>
            <span className="text-base font-semibold text-[var(--foreground)] mt-0.5 block">
              {data.total_project_nodes}
            </span>
          </div>

          <div className="p-3 rounded-lg bg-[var(--surface)] border border-[var(--border)]">
            <span className="text-[var(--foreground-muted)] block text-[11px]">Total Assigned Units</span>
            <span className="text-base font-semibold text-emerald-700 mt-0.5 block">
              {data.total_project_units - data.unassigned_units_count}
            </span>
          </div>

          <div className="p-3 rounded-lg bg-[var(--surface)] border border-[var(--border)]">
            <span className="text-[var(--foreground-muted)] block text-[11px]">Unassigned Units</span>
            <span className="text-base font-semibold text-amber-600 mt-0.5 block">
              {data.unassigned_units_count}
            </span>
          </div>

          <div className="p-3 rounded-lg bg-[var(--surface)] border border-[var(--border)]">
            <span className="text-[var(--foreground-muted)] block text-[11px]">Total Project Inventory</span>
            <span className="text-base font-semibold text-[var(--foreground)] mt-0.5 block">
              {data.total_project_units}
            </span>
          </div>
        </div>
      )}

      {/* Main Hierarchy Tree Content */}
      {loading ? (
        <div className="p-12 text-center rounded-xl bg-[var(--surface)] border border-[var(--border)] space-y-3">
          <Loader2 className="w-6 h-6 animate-spin text-[var(--brand)] mx-auto" />
          <p className="text-xs text-[var(--foreground-muted)]">Loading hierarchy structure...</p>
        </div>
      ) : error ? (
        <div className="p-6 rounded-xl bg-red-50 border border-red-200 text-red-800 text-xs space-y-3">
          <div className="flex items-center gap-2">
            <AlertCircle className="w-4 h-4 text-red-600" />
            <span className="font-semibold">Unable to load hierarchy</span>
          </div>
          <p>{error}</p>
          <button
            onClick={refreshHierarchy}
            className="px-3 py-1 rounded bg-red-600 text-white font-medium hover:bg-red-700 transition-colors"
          >
            Retry
          </button>
        </div>
      ) : data?.nodes && data.nodes.length > 0 ? (
        <div className="p-4 rounded-xl bg-[var(--surface)] border border-[var(--border)]">
          {data.nodes.map((node) => renderTreeNode(node, 0))}
        </div>
      ) : (
        <div className="p-12 text-center rounded-xl bg-[var(--surface)] border border-[var(--border)] space-y-4">
          <div className="w-12 h-12 rounded-full bg-blue-50 text-[var(--brand)] flex items-center justify-center mx-auto">
            <FolderTree className="w-6 h-6" />
          </div>
          <div className="max-w-sm mx-auto space-y-1">
            <h3 className="text-sm font-semibold text-[var(--foreground)]">No Hierarchy Nodes Defined</h3>
            <p className="text-xs text-[var(--foreground-muted)]">
              Build your project structure by creating root nodes such as Towers, Blocks, Phases, or Sectors.
            </p>
          </div>
          {isManager && (
            <button
              type="button"
              onClick={openCreateRoot}
              className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-lg text-xs font-medium bg-[var(--brand)] text-white hover:bg-[var(--brand-dark)] transition-colors shadow-2xs"
            >
              <Plus className="w-4 h-4" />
              Create First Node
            </button>
          )}
        </div>
      )}

      {/* MODAL: Add / Edit Hierarchy Node */}
      {isModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
          <div className="w-full max-w-md bg-[var(--surface)] border border-[var(--border)] rounded-2xl shadow-xl overflow-hidden animate-in fade-in zoom-in-95 duration-150">
            {/* Modal Header */}
            <div className="flex items-center justify-between px-5 py-4 border-b border-[var(--border)] bg-[var(--surface-muted)]">
              <div>
                <h3 className="text-sm font-semibold text-[var(--foreground)]">
                  {modalMode === 'edit'
                    ? 'Edit Hierarchy Node'
                    : modalMode === 'create_child'
                    ? `Add Child Node under "${selectedParentNode?.name}"`
                    : 'Add Root Hierarchy Node'}
                </h3>
                <p className="text-[11px] text-[var(--foreground-muted)]">
                  {modalMode === 'edit'
                    ? 'Update node name, code or specifications.'
                    : 'Configure node details for project inventory groupings.'}
                </p>
              </div>
              <button
                type="button"
                onClick={() => setIsModalOpen(false)}
                className="text-[var(--foreground-muted)] hover:text-[var(--foreground)] p-1 rounded-md"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            {/* Modal Body / Form */}
            <form onSubmit={handleSubmitForm} className="p-5 space-y-4 text-xs">
              {formError && (
                <div className="p-3 rounded-lg bg-red-50 border border-red-200 text-red-800 text-[11px] flex items-center gap-2">
                  <AlertCircle className="w-4 h-4 text-red-600 flex-shrink-0" />
                  <span>{formError}</span>
                </div>
              )}

              {/* Node Name */}
              <div className="space-y-1">
                <label className="font-medium text-[var(--foreground)]">
                  Node Name <span className="text-red-500">*</span>
                </label>
                <input
                  type="text"
                  required
                  value={formData.name}
                  onChange={(e) => setFormData((p) => ({ ...p, name: e.target.value }))}
                  className="w-full px-3 py-2 text-xs rounded-md border border-[var(--border)] bg-[var(--surface)] outline-none focus:border-[var(--brand)]"
                  placeholder="e.g. Tower A, Block 3, Phase 1, 4th Floor"
                />
              </div>

              {/* Node Type Selection */}
              <div className="space-y-1">
                <label className="font-medium text-[var(--foreground)]">
                  Node Type <span className="text-red-500">*</span>
                </label>
                <div className="flex gap-2">
                  <select
                    value={formData.node_type}
                    onChange={(e) => setFormData((p) => ({ ...p, node_type: e.target.value }))}
                    className="flex-1 px-3 py-2 text-xs rounded-md border border-[var(--border)] bg-[var(--surface)] outline-none focus:border-[var(--brand)] capitalize"
                  >
                    {suggestedTypes.map((t) => (
                      <option key={t} value={t}>
                        {HIERARCHY_NODE_TYPE_LABELS[t] || t}
                      </option>
                    ))}
                    <option value="building">Building</option>
                    <option value="wing">Wing</option>
                    <option value="cluster">Cluster</option>
                    <option value="street">Street</option>
                    <option value="component">Component (Mixed-use)</option>
                  </select>
                </div>
              </div>

              {/* Mixed-Use Component Category Selector */}
              {formData.node_type.toLowerCase() === 'component' && (
                <div className="space-y-1 p-2.5 rounded-lg bg-blue-50/50 border border-blue-100">
                  <label className="font-medium text-[var(--brand)]">Component Classification</label>
                  <select
                    value={formData.component_type}
                    onChange={(e) => setFormData((p) => ({ ...p, component_type: e.target.value }))}
                    className="w-full px-3 py-1.5 text-xs rounded-md border border-[var(--border)] bg-[var(--surface)] outline-none focus:border-[var(--brand)]"
                  >
                    {MIXED_USE_COMPONENT_TYPES.map((c) => (
                      <option key={c} value={c}>
                        {c} Component
                      </option>
                    ))}
                  </select>
                </div>
              )}

              {/* Code & Sequence Order */}
              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1">
                  <label className="font-medium text-[var(--foreground)]">Code / Identifier</label>
                  <input
                    type="text"
                    value={formData.code}
                    onChange={(e) => setFormData((p) => ({ ...p, code: e.target.value }))}
                    className="w-full px-3 py-2 text-xs rounded-md border border-[var(--border)] bg-[var(--surface)] outline-none focus:border-[var(--brand)] font-mono"
                    placeholder="e.g. TWR-A"
                  />
                </div>

                <div className="space-y-1">
                  <label className="font-medium text-[var(--foreground)]">Display Order</label>
                  <input
                    type="number"
                    value={formData.sequence_order}
                    onChange={(e) =>
                      setFormData((p) => ({ ...p, sequence_order: Number(e.target.value) }))
                    }
                    className="w-full px-3 py-2 text-xs rounded-md border border-[var(--border)] bg-[var(--surface)] outline-none focus:border-[var(--brand)]"
                    placeholder="0"
                  />
                </div>
              </div>

              {/* Description */}
              <div className="space-y-1">
                <label className="font-medium text-[var(--foreground)]">Description (Optional)</label>
                <textarea
                  rows={2}
                  value={formData.description}
                  onChange={(e) => setFormData((p) => ({ ...p, description: e.target.value }))}
                  className="w-full px-3 py-2 text-xs rounded-md border border-[var(--border)] bg-[var(--surface)] outline-none focus:border-[var(--brand)]"
                  placeholder="Notes, floor specifications, or phase release dates..."
                />
              </div>

              {/* Modal Actions */}
              <div className="flex items-center justify-end gap-2 pt-2 border-t border-[var(--border)]">
                <button
                  type="button"
                  onClick={() => setIsModalOpen(false)}
                  className="px-3 py-1.5 rounded-lg border border-[var(--border)] text-[var(--foreground-muted)] hover:bg-[var(--surface-muted)] transition-colors"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={formSubmitting}
                  className="inline-flex items-center gap-1.5 px-4 py-1.5 rounded-lg bg-[var(--brand)] text-white font-medium hover:bg-[var(--brand-dark)] transition-colors disabled:opacity-50"
                >
                  {formSubmitting && <Loader2 className="w-3.5 h-3.5 animate-spin" />}
                  {modalMode === 'edit' ? 'Update Node' : 'Create Node'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* CONFIRMATION DIALOG: Safe Delete Node */}
      {deleteConfirmNode && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
          <div className="w-full max-w-sm bg-[var(--surface)] border border-[var(--border)] rounded-2xl shadow-xl overflow-hidden p-5 space-y-4">
            <div className="w-10 h-10 rounded-full bg-red-50 text-red-600 flex items-center justify-center mx-auto">
              <Trash2 className="w-5 h-5" />
            </div>

            <div className="text-center space-y-1">
              <h3 className="text-sm font-semibold text-[var(--foreground)]">
                Delete &quot;{deleteConfirmNode.name}&quot;?
              </h3>
              <p className="text-xs text-[var(--foreground-muted)]">
                This operation is permanent. Only empty nodes without child nodes or assigned inventory can be removed.
              </p>
            </div>

            {deleteError && (
              <div className="p-3 rounded-lg bg-red-50 border border-red-200 text-red-800 text-[11px] flex items-center gap-2">
                <AlertCircle className="w-4 h-4 text-red-600 flex-shrink-0" />
                <span>{deleteError}</span>
              </div>
            )}

            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={() => setDeleteConfirmNode(null)}
                className="flex-1 px-3 py-1.5 text-xs rounded-lg border border-[var(--border)] text-[var(--foreground-muted)] hover:bg-[var(--surface-muted)] transition-colors"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={handleDeleteNode}
                disabled={deleting}
                className="flex-1 px-3 py-1.5 text-xs rounded-lg bg-red-600 text-white font-medium hover:bg-red-700 transition-colors disabled:opacity-50 flex items-center justify-center gap-1.5"
              >
                {deleting && <Loader2 className="w-3.5 h-3.5 animate-spin" />}
                Delete Node
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
