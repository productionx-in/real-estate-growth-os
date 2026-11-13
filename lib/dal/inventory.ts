// lib/dal/inventory.ts
// Data Access Layer for Inventory Items, Hierarchy Nodes, and Status Audit History
import { createClient } from '@/lib/supabase/server'
import type {
  InventoryItemFormValues,
  InventoryStatusChangeValues,
  HierarchyNodeFormValues,
} from '@/lib/validations/inventory'
import type { InventoryStatus, ProjectCategory } from '@/types/database'
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
  const supabase = await createClient()

  let query = supabase
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
  const supabase = await createClient()
  const { data, error } = await supabase
    .from('inventory_items')
    .select(`
      *,
      project:projects(id, name, slug, code, category, location, city),
      hierarchy_node:project_hierarchy_nodes(id, name, node_type)
    `)
    .eq('id', inventoryId)
    .single()

  if (error) return null
  return data
}

export async function getInventoryStatusHistory(inventoryId: string) {
  const supabase = await createClient()
  const { data, error } = await supabase
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
  values: InventoryItemFormValues,
  actorProfileId: string
) {
  const supabase = await createClient()

  const { data: item, error: insertError } = await supabase
    .from('inventory_items')
    .insert({
      org_id: orgId,
      project_id: values.project_id,
      hierarchy_node_id: values.hierarchy_node_id || null,
      unit_number: values.unit_number.trim(),
      category: values.category,
      status: values.status || 'available',
      area_value: values.area_value,
      area_unit: values.area_unit || 'sqft',
      carpet_area: values.carpet_area ?? null,
      built_up_area: values.built_up_area ?? null,
      super_built_up_area: values.super_built_up_area ?? null,
      plot_area: values.plot_area ?? null,
      plot_dimensions: values.plot_dimensions || null,
      road_width_ft: values.road_width_ft ?? null,
      is_corner_plot: values.is_corner_plot || false,
      facing: values.facing || null,
      bhk_config: values.bhk_config || null,
      floor_number: values.floor_number ?? null,
      tower_name: values.tower_name || null,
      commercial_asset_type: values.commercial_asset_type || null,
      bedrooms: values.bedrooms ?? null,
      bathrooms: values.bathrooms ?? null,
      balconies: values.balconies ?? null,
      parking_spaces: values.parking_spaces ?? 0,
      furnishing_status: values.furnishing_status || 'unfurnished',
      base_rate: values.base_rate ?? null,
      total_price: values.total_price ?? null,
      pricing_breakup: values.pricing_breakup || {},
      internal_notes: values.internal_notes || null,
      custom_attributes: values.custom_attributes || {},
      images: [],
      documents: [],
    })
    .select()
    .single()

  if (insertError || !item) {
    return { item: null, error: insertError?.message ?? 'Failed to create inventory item' }
  }

  // Record initial status creation in audit history
  await supabase.from('inventory_status_history').insert({
    inventory_id: item.id,
    org_id: orgId,
    previous_status: null,
    new_status: item.status,
    changed_by: actorProfileId,
    reason: 'Initial creation',
    metadata: {},
  })

  return { item, error: null }
}

export async function transitionInventoryStatus(
  inventoryId: string,
  payload: InventoryStatusChangeValues,
  actorProfileId: string
) {
  const supabase = await createClient()

  // 1. Fetch current status
  const { data: current, error: fetchErr } = await supabase
    .from('inventory_items')
    .select('id, org_id, status, unit_number')
    .eq('id', inventoryId)
    .single()

  if (fetchErr || !current) {
    return { error: 'Inventory item not found' }
  }

  // 2. Validate state machine transition
  if (!canTransitionStatus(current.status, payload.new_status)) {
    return {
      error: `Invalid transition from '${current.status}' to '${payload.new_status}'.`,
    }
  }

  // 3. Update status
  const { data: updated, error: updateErr } = await supabase
    .from('inventory_items')
    .update({ status: payload.new_status })
    .eq('id', inventoryId)
    .select()
    .single()

  if (updateErr || !updated) {
    return { error: updateErr?.message ?? 'Status update failed' }
  }

  // 4. Record mandatory audit log
  await supabase.from('inventory_status_history').insert({
    inventory_id: inventoryId,
    org_id: current.org_id,
    previous_status: current.status,
    new_status: payload.new_status,
    changed_by: actorProfileId,
    reason: payload.reason,
    metadata: {
      note: payload.note || null,
      timestamp: new Date().toISOString(),
    },
  })

  return { item: updated, error: null }
}

export async function getHierarchyByProject(projectId: string) {
  const supabase = await createClient()
  const { data, error } = await supabase
    .from('project_hierarchy_nodes')
    .select('*')
    .eq('project_id', projectId)
    .order('sequence_order', { ascending: true })

  if (error) return []
  return data ?? []
}

export async function getInventoryMetrics(projectId: string) {
  const supabase = await createClient()

  const { data: items } = await supabase
    .from('inventory_items')
    .select('status, total_price, area_value')
    .eq('project_id', projectId)

  const counts: Record<InventoryStatus, number> = {
    available: 0,
    on_hold: 0,
    booked: 0,
    sold: 0,
    blocked: 0,
  }

  let totalValue = 0

  ;(items ?? []).forEach((item) => {
    if (counts[item.status] !== undefined) {
      counts[item.status]++
    }
    if (item.total_price) {
      totalValue += Number(item.total_price)
    }
  })

  return {
    totalUnits: (items ?? []).length,
    counts,
    totalValue,
  }
}
