// lib/dal/inventory.ts
// Data Access Layer for Inventory Items, Hierarchy Nodes, and Status Audit History
import { createServiceClient } from '@/lib/supabase/server'
import type {
  InventoryItemFormValues,
  InventoryStatusChangeValues,
  HierarchyNodeFormValues,
} from '@/lib/validations/inventory'
import type { InventoryStatus, ProjectCategory, Database } from '@/types/database'
import { canTransitionStatus } from '@/types/inventory'

export interface InventoryFilterParams {
  status?: InventoryStatus
  category?: ProjectCategory
  bhk?: string
  search?: string
  tower?: string
  floor?: number
  minPrice?: number
  maxPrice?: number
}

export async function getInventoryByProject(
  projectId: string,
  filters: InventoryFilterParams = {}
) {
  const service = createServiceClient()

  let query = service
    .from('inventory_items')
    .select(`
      *,
      project:projects(id, name, slug, code, category),
      hierarchy_node:project_hierarchy_nodes(id, name, node_type)
    `)
    .eq('project_id', projectId)
    .order('unit_number', { ascending: true })

  if (filters.status) {
    query = query.eq('status', filters.status)
  }
  if (filters.category) {
    query = query.eq('category', filters.category)
  }
  if (filters.bhk) {
    query = query.eq('bhk_config', filters.bhk)
  }
  if (filters.tower) {
    query = query.eq('tower_name', filters.tower)
  }
  if (filters.floor !== undefined) {
    query = query.eq('floor_number', filters.floor)
  }
  if (filters.minPrice !== undefined) {
    query = query.gte('total_price', filters.minPrice)
  }
  if (filters.maxPrice !== undefined) {
    query = query.lte('total_price', filters.maxPrice)
  }

  const { data, error } = await query

  if (error) {
    console.error('Failed to fetch inventory:', error)
    return []
  }

  // Client-side text filter on unit_number if search provided
  if (filters.search) {
    const q = filters.search.toLowerCase()
    return (data ?? []).filter((item) =>
      item.unit_number.toLowerCase().includes(q)
    )
  }

  return data ?? []
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

  if (error) return null
  return data
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

  // 4. Duplicate identifier check: prevent duplicate unit numbers within the project
  const { data: existingUnit } = await service
    .from('inventory_items')
    .select('id')
    .eq('project_id', values.project_id)
    .eq('unit_number', values.unit_number.trim())
    .maybeSingle()

  if (existingUnit) {
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

  // 4. Update inventory item status with optimistic concurrency guard
  const { data: updated, error: updateErr } = await service
    .from('inventory_items')
    .update({ status: targetStatus, updated_at: new Date().toISOString() })
    .eq('id', inventoryId)
    .eq('status', currentStatus)
    .select('id, org_id, project_id, status')
    .maybeSingle()

  if (updateErr) {
    return { success: false, error: updateErr.message }
  }

  if (!updated) {
    return {
      success: false,
      error: `Status conflict: The unit was concurrently modified (current status is no longer '${currentStatus}'). Please refresh and try again.`,
      isConflict: true,
    }
  }

  // 5. Append immutable audit history with error verification and atomic rollback
  const { error: historyErr } = await service.from('inventory_status_history').insert({
    org_id: item.org_id,
    inventory_id: item.id,
    previous_status: currentStatus,
    new_status: targetStatus,
    reason: values.reason,
    changed_by: profile.id,
  })

  if (historyErr) {
    console.error('Failed to append status audit history, rolling back inventory status:', historyErr)
    // Roll back status update to maintain atomicity!
    await service
      .from('inventory_items')
      .update({ status: currentStatus })
      .eq('id', inventoryId)

    return {
      success: false,
      error: 'Failed to record audit history. Status transition rolled back for data integrity.',
    }
  }

  return { success: true, item: { ...item, status: targetStatus } }
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
