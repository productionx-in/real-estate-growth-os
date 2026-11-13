// lib/dal/inventory.ts
// Data Access Layer for Inventory Items, Hierarchy Nodes, and Status Audit History
import { createServiceClient } from '@/lib/supabase/server'
import type {
  InventoryItemFormValues,
  InventoryStatusChangeValues,
  HierarchyNodeFormValues,
} from '@/lib/validations/inventory'
import type { InventoryStatus, ProjectCategory, Database } from '@/types/database'
import { canTransitionStatus, type InventoryItemWithRelations } from '@/types/inventory'

export interface InventoryFilterParams {
  status?: InventoryStatus
  category?: ProjectCategory
  bhk?: string
  search?: string
  tower?: string
  floor?: number
  hierarchyNodeId?: string
  facing?: string
  minPrice?: number
  maxPrice?: number
  minArea?: number
  maxArea?: number
  sortBy?: 'unit_number' | 'total_price' | 'area_value' | 'status' | 'updated_at'
  sortOrder?: 'asc' | 'desc'
  page?: number
  pageSize?: number
}

export interface PaginatedInventoryResult {
  items: (InventoryItemWithRelations & { hierarchy_path?: string })[]
  total: number
  page: number
  pageSize: number
  totalPages: number
}

export async function getInventoryBreadcrumb(
  hierarchyNodeId: string,
  projectId: string
): Promise<string> {
  const service = createServiceClient()
  const { data: nodes } = await service
    .from('project_hierarchy_nodes')
    .select('id, name, parent_id')
    .eq('project_id', projectId)

  if (!nodes) return ''

  const nodeMap = new Map<string, { name: string; parent_id: string | null }>()
  for (const n of nodes) {
    nodeMap.set(n.id, { name: n.name, parent_id: n.parent_id })
  }

  const parts: string[] = []
  let curr: string | null | undefined = hierarchyNodeId
  const visited = new Set<string>()

  while (curr && !visited.has(curr)) {
    visited.add(curr)
    const node = nodeMap.get(curr)
    if (!node) break
    parts.unshift(node.name)
    curr = node.parent_id
  }

  return parts.join(' › ')
}

export async function getInventoryByProject(
  projectId: string,
  filters: InventoryFilterParams = {}
) {
  const result = await getPaginatedInventoryByProject(projectId, filters)
  return result.items
}

export async function getPaginatedInventoryByProject(
  projectId: string,
  filters: InventoryFilterParams = {}
): Promise<PaginatedInventoryResult> {
  const service = createServiceClient()

  // Base query with count
  let query = service
    .from('inventory_items')
    .select(
      `
      *,
      project:projects(id, name, slug, code, category),
      hierarchy_node:project_hierarchy_nodes(id, name, node_type, code)
    `,
      { count: 'exact' }
    )
    .eq('project_id', projectId)

  if (filters.status) {
    query = query.eq('status', filters.status)
  }
  if (filters.category) {
    query = query.eq('category', filters.category)
  }
  if (filters.bhk) {
    query = query.eq('bhk_config', filters.bhk)
  }
  if (filters.facing) {
    query = query.eq('facing', filters.facing)
  }
  if (filters.tower) {
    query = query.eq('tower_name', filters.tower)
  }
  if (filters.floor !== undefined) {
    query = query.eq('floor_number', filters.floor)
  }
  if (filters.hierarchyNodeId) {
    query = query.eq('hierarchy_node_id', filters.hierarchyNodeId)
  }
  if (filters.minPrice !== undefined) {
    query = query.gte('total_price', filters.minPrice)
  }
  if (filters.maxPrice !== undefined) {
    query = query.lte('total_price', filters.maxPrice)
  }
  if (filters.minArea !== undefined) {
    query = query.gte('area_value', filters.minArea)
  }
  if (filters.maxArea !== undefined) {
    query = query.lte('area_value', filters.maxArea)
  }

  // Sorting
  const sortCol = filters.sortBy || 'unit_number'
  const isAsc = filters.sortOrder !== 'desc'
  query = query.order(sortCol, { ascending: isAsc }).order('id', { ascending: true })

  const { data, error } = await query

  if (error) {
    console.error('Failed to fetch inventory:', error)
    return {
      items: [],
      total: 0,
      page: filters.page || 1,
      pageSize: filters.pageSize || 25,
      totalPages: 0,
    }
  }

  let items = (data ?? []) as (InventoryItemWithRelations & { hierarchy_path?: string })[]

  // Populate hierarchy breadcrumb paths if items have hierarchy_node_id
  const hasHierarchyNodes = items.some((i) => i.hierarchy_node_id)
  if (hasHierarchyNodes) {
    const { data: nodes } = await service
      .from('project_hierarchy_nodes')
      .select('id, name, parent_id')
      .eq('project_id', projectId)

    if (nodes && nodes.length > 0) {
      const nodeMap = new Map<string, { name: string; parent_id: string | null }>()
      for (const n of nodes) {
        nodeMap.set(n.id, { name: n.name, parent_id: n.parent_id })
      }

      for (const item of items) {
        if (item.hierarchy_node_id) {
          const parts: string[] = []
          let curr: string | null | undefined = item.hierarchy_node_id
          const visited = new Set<string>()
          while (curr && !visited.has(curr)) {
            visited.add(curr)
            const node = nodeMap.get(curr)
            if (!node) break
            parts.unshift(node.name)
            curr = node.parent_id
          }
          item.hierarchy_path = parts.join(' › ')
        }
      }
    }
  }

  // Client-side text filter on unit_number if search provided
  if (filters.search && filters.search.trim()) {
    const q = filters.search.trim().toLowerCase()
    items = items.filter(
      (item) =>
        item.unit_number.toLowerCase().includes(q) ||
        (item.tower_name && item.tower_name.toLowerCase().includes(q))
    )
  }

  const total = items.length

  // Pagination
  if (filters.page && filters.pageSize) {
    const p = Math.max(1, filters.page)
    const ps = Math.max(1, filters.pageSize)
    const from = (p - 1) * ps
    const paginatedItems = items.slice(from, from + ps)
    return {
      items: paginatedItems,
      total,
      page: p,
      pageSize: ps,
      totalPages: Math.ceil(total / ps),
    }
  }

  return {
    items,
    total,
    page: 1,
    pageSize: total || 25,
    totalPages: 1,
  }
}

export async function getInventoryById(inventoryId: string) {
  const service = createServiceClient()
  const { data, error } = await service
    .from('inventory_items')
    .select(`
      *,
      project:projects(id, name, slug, code, category, location, city),
      hierarchy_node:project_hierarchy_nodes(id, name, node_type)
    `)
    .eq('id', inventoryId)
    .maybeSingle()

  if (error || !data) return null
  const item = data as (InventoryItemWithRelations & { hierarchy_path?: string })
  if (item.hierarchy_node_id && item.project_id) {
    item.hierarchy_path = await getInventoryBreadcrumb(item.hierarchy_node_id, item.project_id)
  }
  return item
}

export async function getInventoryStatusHistory(inventoryId: string) {
  const service = createServiceClient()
  const { data, error } = await service
    .from('inventory_status_history')
    .select(`
      *,
      actor:profiles!inventory_status_history_changed_by_fkey(id, full_name, avatar_url)
    `)
    .eq('inventory_id', inventoryId)
    .order('created_at', { ascending: false })

  if (error) {
    console.error('Failed to fetch status history:', error)
    return []
  }
  return data ?? []
}

export function escapePostgrestPattern(val: string): string {
  return val.trim().replace(/([%_\\])/g, '\\$1')
}

export async function createInventoryItem(
  orgId: string,
  values: InventoryItemFormValues
) {
  const service = createServiceClient()

  // 1. Verify project exists and belongs to this organisation
  const { data: project, error: projErr } = await service
    .from('projects')
    .select('id, org_id, category')
    .eq('id', values.project_id)
    .maybeSingle()

  if (projErr || !project) {
    return { item: null, error: 'Project not found.' }
  }

  if (project.org_id !== orgId) {
    return { item: null, error: 'Inventory item organisation does not match project organisation.' }
  }

  // 2. Validate category consistency: single-category projects cannot have mismatching unit categories
  if (project.category !== 'mixed_use' && values.category !== project.category) {
    return {
      item: null,
      error: `Inventory category '${values.category}' does not match project category '${project.category}'.`,
    }
  }

  // 3. Hierarchy node consistency: verify node belongs to this project & organisation
  if (values.hierarchy_node_id) {
    const { data: node } = await service
      .from('project_hierarchy_nodes')
      .select('id, project_id, org_id')
      .eq('id', values.hierarchy_node_id)
      .maybeSingle()

    if (!node || node.project_id !== values.project_id || node.org_id !== orgId) {
      return {
        item: null,
        error: 'Hierarchy node does not belong to this project and organisation.',
      }
    }
  }

  // 4. Duplicate identifier check: prevent duplicate unit numbers within the project (literal case-insensitive & trimmed)
  const safePattern = escapePostgrestPattern(values.unit_number)
  const { data: existingUnit } = await service
    .from('inventory_items')
    .select('id, unit_number')
    .eq('project_id', values.project_id)
    .ilike('unit_number', safePattern)
    .maybeSingle()

  if (existingUnit && existingUnit.unit_number.trim().toLowerCase() === values.unit_number.trim().toLowerCase()) {
    return {
      item: null,
      error: `Unit or Plot number '${values.unit_number}' already exists in this project.`,
      isDuplicate: true,
    }
  }

  const payload: Database['public']['Tables']['inventory_items']['Insert'] = {
    org_id: orgId,
    project_id: values.project_id,
    unit_number: values.unit_number.trim(),
    category: values.category,
    status: values.status,
    area_value: values.area_value,
    area_unit: values.area_unit,
    base_rate: values.base_rate ?? null,
    total_price: values.total_price ?? null,
    facing: values.facing || null,
    internal_notes: values.internal_notes || null,
    hierarchy_node_id: values.hierarchy_node_id || null,
  }

  if (values.category === 'apartments') {
    payload.bhk_config = values.bhk_config || null
    payload.carpet_area = values.carpet_area ?? null
    payload.built_up_area = values.built_up_area ?? null
    payload.floor_number = values.floor_number ?? null
    payload.tower_name = values.tower_name || null
    payload.balconies = values.balconies ?? null
    payload.parking_spaces = values.parking_spaces ?? null
  } else if (values.category === 'plotted_developments') {
    payload.plot_area = values.plot_area ?? values.area_value
    payload.plot_dimensions = values.plot_dimensions || null
    payload.road_width_ft = values.road_width_ft ?? null
    payload.is_corner_plot = values.is_corner_plot ?? false
  } else if (values.category === 'commercial_sale') {
    payload.commercial_asset_type = values.commercial_asset_type || null
    payload.floor_number = values.floor_number ?? null
    payload.tower_name = values.tower_name || null
  } else if (values.category === 'villas_gated_communities') {
    payload.bedrooms = values.bedrooms ?? null
    payload.built_up_area = values.built_up_area ?? null
    payload.plot_area = values.plot_area ?? null
    payload.floor_number = values.floor_number ?? null
    payload.parking_spaces = values.parking_spaces ?? null
  }

  const { data, error } = await service
    .from('inventory_items')
    .insert(payload)
    .select()
    .single()

  if (error) {
    if (error.code === '23505') {
      return {
        item: null,
        error: `Unit or Plot number '${values.unit_number}' already exists in this project.`,
        isDuplicate: true,
      }
    }
    return { item: null, error: error.message }
  }

  return { item: data, error: null }
}

export async function transitionInventoryStatus(
  inventoryId: string,
  values: InventoryStatusChangeValues,
  userId: string
) {
  const service = createServiceClient()

  // 1. Fetch current item
  const { data: item, error: fetchErr } = await service
    .from('inventory_items')
    .select('id, org_id, project_id, status')
    .eq('id', inventoryId)
    .single()

  if (fetchErr || !item) {
    return { success: false, error: 'Inventory unit not found' }
  }

  const currentStatus = item.status as InventoryStatus
  const targetStatus = values.new_status

  // 2. Validate state machine transition
  if (!canTransitionStatus(currentStatus, targetStatus)) {
    return {
      success: false,
      error: `Illegal status transition: cannot move from ${currentStatus} to ${targetStatus}`,
    }
  }

  // 3. Resolve user's profile ID
  const { data: profile } = await service
    .from('profiles')
    .select('id')
    .eq('auth_user_id', userId)
    .maybeSingle()

  if (!profile) {
    return { success: false, error: 'Profile not found' }
  }

  // 4. ATOMIC DATABASE TRANSACTION: execute status change and audit history via PostgreSQL RPC
  // Enforces row locking (FOR UPDATE), state machine validation, optimistic concurrency, and audit logging in a single ACID transaction.
  const { data: rawRpcData, error: rpcErr } = await service.rpc(
    'transition_inventory_status_atomic' as never,
    {
      p_inventory_id: inventoryId,
      p_expected_status: currentStatus,
      p_new_status: targetStatus,
      p_changed_by: profile.id,
      p_reason: values.reason,
    } as never
  )

  if (rpcErr) {
    const isConflict =
      rpcErr.message.includes('Concurrent modification conflict') ||
      rpcErr.code === 'P0001'

    return {
      success: false,
      error: rpcErr.message,
      isConflict,
    }
  }

  const rpcRows = rawRpcData as unknown as { id: string; status: InventoryStatus }[] | null
  const updatedItem = Array.isArray(rpcRows) && rpcRows.length > 0 ? rpcRows[0] : null

  return {
    success: true,
    item: {
      ...item,
      status: (updatedItem?.status as InventoryStatus) ?? targetStatus,
    },
  }
}

export async function createHierarchyNode(
  orgId: string,
  values: HierarchyNodeFormValues
) {
  const service = createServiceClient()

  // Verify project belongs to org
  const { data: project } = await service
    .from('projects')
    .select('id, org_id')
    .eq('id', values.project_id)
    .maybeSingle()

  if (!project || project.org_id !== orgId) {
    return { node: null, error: 'Project not found or organisation mismatch' }
  }

  // If parent_id provided, verify parent belongs to same project & org and is not self
  if (values.parent_id) {
    const { data: parent } = await service
      .from('project_hierarchy_nodes')
      .select('id, project_id, org_id')
      .eq('id', values.parent_id)
      .maybeSingle()

    if (!parent || parent.project_id !== values.project_id || parent.org_id !== orgId) {
      return {
        node: null,
        error: 'Parent hierarchy node must belong to the same project and organisation.',
      }
    }
  }

  const { data: node, error } = await service
    .from('project_hierarchy_nodes')
    .insert({
      org_id: orgId,
      project_id: values.project_id,
      parent_id: values.parent_id || null,
      node_type: values.node_type,
      name: values.name.trim(),
      code: values.code?.trim() || null,
      sequence_order: values.sequence_order,
    })
    .select()
    .single()

  return { node, error: error?.message ?? null }
}

export async function getHierarchyByProject(projectId: string) {
  const service = createServiceClient()
  const { data, error } = await service
    .from('project_hierarchy_nodes')
    .select('*')
    .eq('project_id', projectId)
    .order('sequence_order', { ascending: true })

  if (error) {
    console.error('Failed to fetch hierarchy:', error)
    return []
  }
  return data ?? []
}

export async function getInventoryMetrics(projectId: string) {
  const service = createServiceClient()
  const { data, error } = await service
    .from('inventory_items')
    .select('status')
    .eq('project_id', projectId)

  if (error || !data) {
    return {
      total: 0,
      available: 0,
      on_hold: 0,
      booked: 0,
      sold: 0,
      blocked: 0,
    }
  }

  const counts = {
    total: data.length,
    available: 0,
    on_hold: 0,
    booked: 0,
    sold: 0,
    blocked: 0,
  }

  data.forEach((row) => {
    const s = row.status as InventoryStatus
    if (counts[s] !== undefined) {
      counts[s]++
    }
  })

  return counts
}
