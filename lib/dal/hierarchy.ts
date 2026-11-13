// lib/dal/hierarchy.ts
// Data Access Layer for Project Hierarchy Management (Stage 3B)
import { createServiceClient } from '@/lib/supabase/server'
import type { InventoryStatus } from '@/types/inventory'
import type { Json, Database } from '@/types/database'
import type { CreateHierarchyNodeInput, UpdateHierarchyNodeInput } from '@/lib/validations/hierarchy'

type HierarchyNodeUpdate = Database['public']['Tables']['project_hierarchy_nodes']['Update']

export interface InventoryStatusBreakdown {
  available: number
  on_hold: number
  booked: number
  sold: number
  blocked: number
}

export interface HierarchyNodeWithStats {
  id: string
  org_id: string
  project_id: string
  parent_id: string | null
  node_type: string
  name: string
  code: string | null
  sequence_order: number
  metadata: Record<string, unknown>
  created_at: string
  updated_at: string
  direct_units_count: number
  total_units_count: number
  status_breakdown: InventoryStatusBreakdown
  children: HierarchyNodeWithStats[]
}

export interface HierarchyTreeResult {
  nodes: HierarchyNodeWithStats[]
  total_project_nodes: number
  total_project_units: number
  unassigned_units_count: number
  project_status_breakdown: InventoryStatusBreakdown
}

/**
 * Fetch the complete project hierarchy tree with aggregated inventory counts & status breakdowns.
 * Each inventory unit is counted only once in project aggregate totals.
 */
export async function getProjectHierarchyTree(
  projectId: string,
  orgId: string
): Promise<HierarchyTreeResult> {
  const service = createServiceClient()

  // 1. Fetch all hierarchy nodes for this project
  const { data: rawNodes, error: nodesErr } = await service
    .from('project_hierarchy_nodes')
    .select('*')
    .eq('project_id', projectId)
    .eq('org_id', orgId)
    .order('sequence_order', { ascending: true })
    .order('created_at', { ascending: true })

  if (nodesErr) {
    console.error('Error fetching hierarchy nodes:', nodesErr)
    throw new Error('Failed to load project hierarchy')
  }

  // 2. Fetch inventory units for this project (unit ID, hierarchy_node_id, status)
  const { data: rawUnits, error: unitsErr } = await service
    .from('inventory_items')
    .select('id, hierarchy_node_id, status')
    .eq('project_id', projectId)
    .eq('org_id', orgId)

  if (unitsErr) {
    console.error('Error fetching inventory items for hierarchy:', unitsErr)
    throw new Error('Failed to load inventory for hierarchy')
  }

  const nodes = rawNodes ?? []
  const units = rawUnits ?? []

  // 3. Compute Project-level aggregate (each unit counted exactly once)
  const projectBreakdown: InventoryStatusBreakdown = {
    available: 0,
    on_hold: 0,
    booked: 0,
    sold: 0,
    blocked: 0,
  }
  let unassignedUnitsCount = 0

  for (const u of units) {
    const st = u.status as InventoryStatus
    if (projectBreakdown[st] !== undefined) {
      projectBreakdown[st]++
    }
    if (!u.hierarchy_node_id) {
      unassignedUnitsCount++
    }
  }

  // 4. Map direct units and breakdowns per node
  const directBreakdownMap = new Map<string, InventoryStatusBreakdown>()
  const directCountMap = new Map<string, number>()

  for (const n of nodes) {
    directBreakdownMap.set(n.id, {
      available: 0,
      on_hold: 0,
      booked: 0,
      sold: 0,
      blocked: 0,
    })
    directCountMap.set(n.id, 0)
  }

  for (const u of units) {
    if (u.hierarchy_node_id && directBreakdownMap.has(u.hierarchy_node_id)) {
      const breakdown = directBreakdownMap.get(u.hierarchy_node_id)!
      const st = u.status as InventoryStatus
      if (breakdown[st] !== undefined) {
        breakdown[st]++
      }
      directCountMap.set(u.hierarchy_node_id, (directCountMap.get(u.hierarchy_node_id) ?? 0) + 1)
    }
  }

  // 5. Build lookup map and parent -> children relationships
  const nodeMap = new Map<string, HierarchyNodeWithStats>()
  const childrenMap = new Map<string, string[]>()

  for (const n of nodes) {
    const meta = (n.metadata && typeof n.metadata === 'object' && !Array.isArray(n.metadata)
      ? n.metadata
      : {}) as Record<string, unknown>

    nodeMap.set(n.id, {
      id: n.id,
      org_id: n.org_id,
      project_id: n.project_id,
      parent_id: n.parent_id,
      node_type: n.node_type,
      name: n.name,
      code: n.code,
      sequence_order: n.sequence_order,
      metadata: meta,
      created_at: n.created_at,
      updated_at: n.updated_at,
      direct_units_count: directCountMap.get(n.id) ?? 0,
      total_units_count: 0, // will compute with descendants
      status_breakdown: { available: 0, on_hold: 0, booked: 0, sold: 0, blocked: 0 },
      children: [],
    })

    if (n.parent_id) {
      const existing = childrenMap.get(n.parent_id) ?? []
      existing.push(n.id)
      childrenMap.set(n.parent_id, existing)
    }
  }

  // 6. Aggregate descendant counts and status breakdowns for each node
  // Helper to recursively collect descendant node IDs
  function getSubtreeNodeIds(nodeId: string): string[] {
    const result = [nodeId]
    const childIds = childrenMap.get(nodeId) ?? []
    for (const childId of childIds) {
      result.push(...getSubtreeNodeIds(childId))
    }
    return result
  }

  for (const n of nodes) {
    const subtreeIds = getSubtreeNodeIds(n.id)
    const aggregatedBreakdown: InventoryStatusBreakdown = {
      available: 0,
      on_hold: 0,
      booked: 0,
      sold: 0,
      blocked: 0,
    }
    let totalUnits = 0

    for (const subId of subtreeIds) {
      const directBd = directBreakdownMap.get(subId)
      if (directBd) {
        aggregatedBreakdown.available += directBd.available
        aggregatedBreakdown.on_hold += directBd.on_hold
        aggregatedBreakdown.booked += directBd.booked
        aggregatedBreakdown.sold += directBd.sold
        aggregatedBreakdown.blocked += directBd.blocked
        totalUnits += directCountMap.get(subId) ?? 0
      }
    }

    const nodeObj = nodeMap.get(n.id)
    if (nodeObj) {
      nodeObj.total_units_count = totalUnits
      nodeObj.status_breakdown = aggregatedBreakdown
    }
  }

  // 7. Assemble the nested tree (root nodes have parent_id == null or parent_id not in map)
  const rootNodes: HierarchyNodeWithStats[] = []

  for (const n of nodes) {
    const nodeObj = nodeMap.get(n.id)!
    const childIds = childrenMap.get(n.id) ?? []
    nodeObj.children = childIds.map((cid) => nodeMap.get(cid)!).filter(Boolean)

    if (!n.parent_id || !nodeMap.has(n.parent_id)) {
      rootNodes.push(nodeObj)
    }
  }

  return {
    nodes: rootNodes,
    total_project_nodes: nodes.length,
    total_project_units: units.length,
    unassigned_units_count: unassignedUnitsCount,
    project_status_breakdown: projectBreakdown,
  }
}

/**
 * Create a new hierarchy node (at root or as child).
 */
export async function createHierarchyNode(
  projectId: string,
  orgId: string,
  input: CreateHierarchyNodeInput
) {
  const service = createServiceClient()

  // Validate parent if provided
  if (input.parent_id) {
    const { data: parent } = await service
      .from('project_hierarchy_nodes')
      .select('id, project_id, org_id')
      .eq('id', input.parent_id)
      .maybeSingle()

    if (!parent) {
      return { node: null, error: 'Parent hierarchy node does not exist' }
    }
    if (parent.project_id !== projectId || parent.org_id !== orgId) {
      return {
        node: null,
        error: 'Parent hierarchy node must belong to the same project and organisation',
      }
    }
  }

  const metadata = {
    ...(input.metadata ?? {}),
    ...(input.description ? { description: input.description } : {}),
  }

  const { data: node, error } = await service
    .from('project_hierarchy_nodes')
    .insert({
      org_id: orgId,
      project_id: projectId,
      parent_id: input.parent_id || null,
      node_type: input.node_type.toLowerCase().trim(),
      name: input.name.trim(),
      code: input.code?.trim() || null,
      sequence_order: input.sequence_order ?? 0,
      metadata,
    })
    .select()
    .single()

  if (error) {
    return { node: null, error: error.message }
  }

  return { node, error: null }
}

/**
 * Check if setting newParentId creates a circular dependency for nodeId.
 */
export async function isCircularParentRelationship(
  nodeId: string,
  newParentId: string,
  projectId: string
): Promise<boolean> {
  if (nodeId === newParentId) return true

  const service = createServiceClient()
  const { data: allNodes } = await service
    .from('project_hierarchy_nodes')
    .select('id, parent_id')
    .eq('project_id', projectId)

  if (!allNodes) return false

  const parentMap = new Map<string, string | null>()
  for (const n of allNodes) {
    parentMap.set(n.id, n.parent_id)
  }

  let curr: string | null | undefined = newParentId
  const visited = new Set<string>()

  while (curr) {
    if (curr === nodeId) return true
    if (visited.has(curr)) break
    visited.add(curr)
    curr = parentMap.get(curr)
  }

  return false
}

/**
 * Update an existing hierarchy node with circular relationship & parent validation.
 */
export async function updateHierarchyNode(
  nodeId: string,
  projectId: string,
  orgId: string,
  input: UpdateHierarchyNodeInput
) {
  const service = createServiceClient()

  // Verify node exists and belongs to this project & org
  const { data: existingNode } = await service
    .from('project_hierarchy_nodes')
    .select('*')
    .eq('id', nodeId)
    .eq('project_id', projectId)
    .eq('org_id', orgId)
    .maybeSingle()

  if (!existingNode) {
    return { node: null, error: 'Hierarchy node not found' }
  }

  // If changing parent_id
  if (input.parent_id !== undefined && input.parent_id !== existingNode.parent_id) {
    if (input.parent_id !== null) {
      // 1. Verify parent belongs to same project & org
      const { data: parent } = await service
        .from('project_hierarchy_nodes')
        .select('id, project_id, org_id')
        .eq('id', input.parent_id)
        .maybeSingle()

      if (!parent) {
        return { node: null, error: 'Target parent node does not exist' }
      }
      if (parent.project_id !== projectId || parent.org_id !== orgId) {
        return {
          node: null,
          error: 'Target parent node belongs to a different project or organisation',
        }
      }

      // 2. Prevent circular reference
      const isCircular = await isCircularParentRelationship(nodeId, input.parent_id, projectId)
      if (isCircular) {
        return {
          node: null,
          error: 'Cannot move node inside itself or into one of its own descendants (circular dependency)',
        }
      }
    }
  }

  const existingMeta = (existingNode.metadata && typeof existingNode.metadata === 'object'
    ? existingNode.metadata
    : {}) as Record<string, unknown>

  const metadata = {
    ...existingMeta,
    ...(input.metadata ?? {}),
    ...(input.description !== undefined ? { description: input.description } : {}),
  }

  const updates: HierarchyNodeUpdate = {
    metadata: metadata as unknown as Json,
    updated_at: new Date().toISOString(),
  }

  if (input.name !== undefined) updates.name = input.name.trim()
  if (input.node_type !== undefined) updates.node_type = input.node_type.toLowerCase().trim()
  if (input.code !== undefined) updates.code = input.code ? input.code.trim() : null
  if (input.parent_id !== undefined) updates.parent_id = input.parent_id || null
  if (input.sequence_order !== undefined) updates.sequence_order = input.sequence_order

  const { data: updated, error } = await service
    .from('project_hierarchy_nodes')
    .update(updates)
    .eq('id', nodeId)
    .eq('project_id', projectId)
    .eq('org_id', orgId)
    .select()
    .single()

  if (error) {
    return { node: null, error: error.message }
  }

  return { node: updated, error: null }
}

/**
 * Safely delete a hierarchy node:
 * Strictly prevents deletion if node has children OR has linked inventory items.
 */
export async function safeDeleteHierarchyNode(
  nodeId: string,
  projectId: string,
  orgId: string
): Promise<{ success: boolean; error: string | null }> {
  const service = createServiceClient()

  // Verify node exists
  const { data: node } = await service
    .from('project_hierarchy_nodes')
    .select('id, name')
    .eq('id', nodeId)
    .eq('project_id', projectId)
    .eq('org_id', orgId)
    .maybeSingle()

  if (!node) {
    return { success: false, error: 'Hierarchy node not found' }
  }

  // 1. Check for child nodes
  const { count: childCount, error: childErr } = await service
    .from('project_hierarchy_nodes')
    .select('*', { count: 'exact', head: true })
    .eq('parent_id', nodeId)

  if (childErr) {
    return { success: false, error: 'Failed to verify child nodes' }
  }

  if (childCount && childCount > 0) {
    return {
      success: false,
      error: `Cannot delete "${node.name}" because it contains ${childCount} child node(s). Please move or delete child nodes first.`,
    }
  }

  // 2. Check for associated inventory items
  const { count: inventoryCount, error: invErr } = await service
    .from('inventory_items')
    .select('*', { count: 'exact', head: true })
    .eq('hierarchy_node_id', nodeId)

  if (invErr) {
    return { success: false, error: 'Failed to verify associated inventory' }
  }

  if (inventoryCount && inventoryCount > 0) {
    return {
      success: false,
      error: `Cannot delete "${node.name}" because ${inventoryCount} inventory unit(s) are assigned to it. Please reassign or remove units first.`,
    }
  }

  // 3. Node is completely empty — safe to delete
  const { error: deleteErr } = await service
    .from('project_hierarchy_nodes')
    .delete()
    .eq('id', nodeId)
    .eq('project_id', projectId)
    .eq('org_id', orgId)

  if (deleteErr) {
    return { success: false, error: deleteErr.message }
  }

  return { success: true, error: null }
}
