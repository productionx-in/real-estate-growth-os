// types/inventory.ts
// Inventory domain models, helpers, and status transition rules
import type { Database, InventoryStatus, ProjectCategory } from './database'

export type InventoryItem = Database['public']['Tables']['inventory_items']['Row']
export type InsertInventoryItem = Database['public']['Tables']['inventory_items']['Insert']
export type UpdateInventoryItem = Database['public']['Tables']['inventory_items']['Update']

export type ProjectHierarchyNode = Database['public']['Tables']['project_hierarchy_nodes']['Row']
export type InsertHierarchyNode = Database['public']['Tables']['project_hierarchy_nodes']['Insert']

export type InventoryStatusHistory = Database['public']['Tables']['inventory_status_history']['Row']

export type { InventoryStatus, ProjectCategory }

export interface InventoryItemWithRelations extends InventoryItem {
  project?: {
    id: string
    name: string
    slug: string
    code: string | null
    category: ProjectCategory
  } | null
  hierarchy_node?: {
    id: string
    name: string
    node_type: string
  } | null
}

export const PROJECT_CATEGORY_LABELS: Record<ProjectCategory, string> = {
  apartments: 'Apartments',
  plotted_developments: 'Plotted Developments',
  commercial_sale: 'Commercial Sale',
  villas_gated_communities: 'Villas & Gated Communities',
  mixed_use: 'Mixed-Use Developments',
}

export const INVENTORY_STATUS_LABELS: Record<InventoryStatus, string> = {
  available: 'Available',
  on_hold: 'On Hold',
  booked: 'Booked',
  sold: 'Sold',
  blocked: 'Blocked',
}

export const INVENTORY_STATUS_COLORS: Record<
  InventoryStatus,
  { bg: string; text: string; border: string; dot: string }
> = {
  available: {
    bg: 'bg-emerald-50',
    text: 'text-emerald-700',
    border: 'border-emerald-200',
    dot: 'bg-emerald-500',
  },
  on_hold: {
    bg: 'bg-amber-50',
    text: 'text-amber-700',
    border: 'border-amber-200',
    dot: 'bg-amber-500',
  },
  booked: {
    bg: 'bg-blue-50',
    text: 'text-blue-700',
    border: 'border-blue-200',
    dot: 'bg-blue-500',
  },
  sold: {
    bg: 'bg-purple-50',
    text: 'text-purple-700',
    border: 'border-purple-200',
    dot: 'bg-purple-500',
  },
  blocked: {
    bg: 'bg-gray-100',
    text: 'text-gray-600',
    border: 'border-gray-200',
    dot: 'bg-gray-400',
  },
}

// Confirmed status workflow transition state machine
export const ALLOWED_STATUS_TRANSITIONS: Record<InventoryStatus, InventoryStatus[]> = {
  available: ['on_hold', 'booked', 'blocked'],
  on_hold: ['available', 'booked'],
  booked: ['available', 'sold'], // 'available' allowed following authorized cancellation
  sold: [],                      // terminal state unless authorized override
  blocked: ['available'],
}

export function canTransitionStatus(
  currentStatus: InventoryStatus,
  targetStatus: InventoryStatus
): boolean {
  if (currentStatus === targetStatus) return false
  const allowed = ALLOWED_STATUS_TRANSITIONS[currentStatus] || []
  return allowed.includes(targetStatus)
}
