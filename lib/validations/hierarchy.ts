// lib/validations/hierarchy.ts
// Validation schemas for Project Hierarchy Management (Stage 3B)
import { z } from 'zod'

export const HIERARCHY_NODE_TYPES = [
  'phase',
  'tower',
  'wing',
  'floor',
  'block',
  'sector',
  'cluster',
  'street',
  'building',
  'component',
] as const

export type HierarchyNodeType = (typeof HIERARCHY_NODE_TYPES)[number]

export const HIERARCHY_NODE_TYPE_LABELS: Record<HierarchyNodeType, string> = {
  phase: 'Phase',
  tower: 'Tower',
  wing: 'Wing',
  floor: 'Floor',
  block: 'Block',
  sector: 'Sector',
  cluster: 'Cluster',
  street: 'Street',
  building: 'Building',
  component: 'Component',
}

// Category-recommended node types
export const CATEGORY_NODE_TYPES: Record<string, HierarchyNodeType[]> = {
  apartments: ['phase', 'tower', 'wing', 'floor'],
  plotted_developments: ['phase', 'sector', 'block', 'street'],
  commercial_sale: ['phase', 'building', 'block', 'wing', 'floor'],
  villas_gated_communities: ['phase', 'sector', 'cluster', 'street'],
  mixed_use: ['component', 'phase', 'building', 'block', 'wing', 'floor'],
}

// Allowed component types for mixed-use projects
export const MIXED_USE_COMPONENT_TYPES = [
  'Residential',
  'Commercial',
  'Retail',
  'Office',
  'Hospitality',
  'Recreational',
  'Other',
] as const

export const CreateHierarchyNodeSchema = z.object({
  name: z.string().trim().min(1, 'Node name is required').max(100),
  node_type: z.string().trim().min(1, 'Node type is required').max(50),
  code: z.string().trim().max(50).optional().nullable(),
  parent_id: z.string().uuid('Invalid parent node ID').optional().nullable(),
  sequence_order: z.coerce.number().int().default(0),
  description: z.string().trim().max(500).optional().nullable(),
  metadata: z.record(z.string(), z.unknown()).default({}),
})

export type CreateHierarchyNodeInput = z.infer<typeof CreateHierarchyNodeSchema>

export const UpdateHierarchyNodeSchema = z.object({
  name: z.string().trim().min(1, 'Node name is required').max(100).optional(),
  node_type: z.string().trim().min(1, 'Node type is required').max(50).optional(),
  code: z.string().trim().max(50).optional().nullable(),
  parent_id: z.string().uuid('Invalid parent node ID').optional().nullable(),
  sequence_order: z.coerce.number().int().optional(),
  description: z.string().trim().max(500).optional().nullable(),
  metadata: z.record(z.string(), z.unknown()).optional(),
})

export type UpdateHierarchyNodeInput = z.infer<typeof UpdateHierarchyNodeSchema>
