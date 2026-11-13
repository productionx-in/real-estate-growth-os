'use client'
// components/inventory/HierarchyNodeSelector.tsx
// Interactive hierarchy node selector with parent-child pathing & visual nesting
import { useState, useEffect, useMemo } from 'react'
import { FolderTree, Building2, Layers, Box, Network, Compass, AlertCircle, Loader2 } from 'lucide-react'
import type { HierarchyNodeWithStats, HierarchyTreeResult } from '@/lib/dal/hierarchy'

export interface FlatHierarchyNode {
  id: string
  name: string
  code: string | null
  node_type: string
  path: string
  depth: number
  parent_id: string | null
}

interface HierarchyNodeSelectorProps {
  projectId: string
  value: string | null | undefined
  onChange: (nodeId: string | null, node: FlatHierarchyNode | null) => void
  disabled?: boolean
  className?: string
}

function NodeIcon({ nodeType, className }: { nodeType?: string | null; className?: string }) {
  const type = (nodeType || '').toLowerCase()
  if (type === 'tower' || type === 'building') return <Building2 className={className} />
  if (type === 'floor' || type === 'wing') return <Layers className={className} />
  if (type === 'block' || type === 'sector') return <Box className={className} />
  if (type === 'cluster' || type === 'component') return <Network className={className} />
  if (type === 'street' || type === 'phase') return <Compass className={className} />
  return <FolderTree className={className} />
}

export function HierarchyNodeSelector({
  projectId,
  value,
  onChange,
  disabled = false,
  className,
}: HierarchyNodeSelectorProps) {
  const [treeData, setTreeData] = useState<HierarchyTreeResult | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    let ignore = false

    fetch(`/api/projects/${projectId}/hierarchy`)
      .then((res) => {
        if (!res.ok) throw new Error(`HTTP ${res.status}`)
        return res.json()
      })
      .then((data: HierarchyTreeResult) => {
        if (!ignore) {
          setTreeData(data)
          setLoading(false)
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

  // Flatten the tree into an array preserving hierarchy order and breadcrumb path
  const flatNodes = useMemo(() => {
    if (!treeData?.nodes) return []

    const result: FlatHierarchyNode[] = []

    function traverse(nodes: HierarchyNodeWithStats[], parentPath: string, depth: number) {
      for (const n of nodes) {
        const currentPath = parentPath ? `${parentPath} › ${n.name}` : n.name
        result.push({
          id: n.id,
          name: n.name,
          code: n.code,
          node_type: n.node_type,
          path: currentPath,
          depth,
          parent_id: n.parent_id,
        })
        if (n.children && n.children.length > 0) {
          traverse(n.children, currentPath, depth + 1)
        }
      }
    }

    traverse(treeData.nodes, '', 0)
    return result
  }, [treeData])

  const selectedNode = useMemo(() => {
    return flatNodes.find((n) => n.id === value) || null
  }, [flatNodes, value])

  const handleSelect = (e: React.ChangeEvent<HTMLSelectElement>) => {
    const val = e.target.value
    if (!val) {
      onChange(null, null)
    } else {
      const node = flatNodes.find((n) => n.id === val) || null
      onChange(val, node)
    }
  }

  if (loading) {
    return (
      <div className="flex items-center gap-2 px-3 py-2 text-xs rounded-lg border border-[var(--border)] bg-[var(--surface-muted)] text-[var(--foreground-muted)]">
        <Loader2 className="w-3.5 h-3.5 animate-spin text-[var(--brand)]" />
        <span>Loading project hierarchy...</span>
      </div>
    )
  }

  if (error) {
    return (
      <div className="flex items-center gap-2 px-3 py-2 text-xs rounded-lg border border-red-200 bg-red-50 text-red-700">
        <AlertCircle className="w-3.5 h-3.5 flex-shrink-0" />
        <span>Hierarchy unavailable</span>
      </div>
    )
  }

  return (
    <div className={className}>
      <div className="relative">
        <div className="absolute left-3 top-2.5 text-[var(--foreground-muted)] pointer-events-none">
          <NodeIcon nodeType={selectedNode?.node_type} className="w-3.5 h-3.5" />
        </div>
        <select
          value={value ?? ''}
          onChange={handleSelect}
          disabled={disabled || flatNodes.length === 0}
          className="w-full pl-8 pr-3 py-2 text-xs bg-[var(--surface)] border border-[var(--border)] rounded-lg outline-none focus:border-[var(--brand)] disabled:opacity-60 transition-colors"
        >
          <option value="">
            {flatNodes.length === 0
              ? 'No hierarchy defined (Project Root)'
              : 'None / Project Root (Optional)'}
          </option>
          {flatNodes.map((node) => {
            const indent = '\u00A0\u00A0\u00A0\u00A0'.repeat(node.depth)
            const prefix = node.depth > 0 ? '└ ' : ''
            const codeSuffix = node.code ? ` (${node.code})` : ''
            return (
              <option key={node.id} value={node.id}>
                {indent}
                {prefix}
                {node.name}
                {codeSuffix} — [{node.node_type.toUpperCase()}]
              </option>
            )
          })}
        </select>
      </div>

      {selectedNode && (
        <p className="mt-1 text-[11px] text-[var(--foreground-muted)] flex items-center gap-1">
          <span className="font-semibold text-[var(--foreground)]">Assigned location:</span>
          <span>{selectedNode.path}</span>
        </p>
      )}
    </div>
  )
}
