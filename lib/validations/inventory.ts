// lib/validations/inventory.ts
import { z } from 'zod'

export const InventoryItemSchema = z.object({
  unit_number: z.string().min(1, 'Unit or Plot number is required').max(80),
  project_id: z.string().uuid('Valid project is required'),
  hierarchy_node_id: z.string().uuid().optional().nullable(),
  category: z.enum([
    'apartments',
    'plotted_developments',
    'commercial_sale',
    'villas_gated_communities',
    'mixed_use',
  ]),
  status: z.enum(['available', 'on_hold', 'booked', 'sold', 'blocked']).default('available'),
  
  // Area & measurements
  area_value: z.coerce.number().positive('Area must be a positive number'),
  area_unit: z.enum(['sqft', 'sqyd', 'acres', 'guntas', 'cents']).default('sqft'),
  carpet_area: z.coerce.number().min(0).optional().nullable(),
  built_up_area: z.coerce.number().min(0).optional().nullable(),
  super_built_up_area: z.coerce.number().min(0).optional().nullable(),
  plot_area: z.coerce.number().min(0).optional().nullable(),
  plot_dimensions: z.string().max(80).optional().nullable(),
  road_width_ft: z.coerce.number().min(0).optional().nullable(),
  is_corner_plot: z.boolean().default(false),

  // Configuration & location
  facing: z.string().max(50).optional().nullable(),
  bhk_config: z.string().max(50).optional().nullable(),
  floor_number: z.coerce.number().int().optional().nullable(),
  tower_name: z.string().max(80).optional().nullable(),
  commercial_asset_type: z.string().max(80).optional().nullable(),
  bedrooms: z.coerce.number().int().min(0).optional().nullable(),
  bathrooms: z.coerce.number().int().min(0).optional().nullable(),
  balconies: z.coerce.number().int().min(0).optional().nullable(),
  parking_spaces: z.coerce.number().int().min(0).default(0),
  furnishing_status: z.string().max(50).default('unfurnished'),

  // Modular pricing
  base_rate: z.coerce.number().min(0).optional().nullable(),
  total_price: z.coerce.number().min(0).optional().nullable(),
  pricing_breakup: z.record(z.string(), z.unknown()).default({}),

  internal_notes: z.string().max(2000).optional().nullable(),
  custom_attributes: z.record(z.string(), z.unknown()).default({}),
})

export type InventoryItemFormValues = z.infer<typeof InventoryItemSchema>

export const InventoryStatusChangeSchema = z.object({
  new_status: z.enum(['available', 'on_hold', 'booked', 'sold', 'blocked']),
  reason: z.string().min(2, 'Reason is mandatory for status changes').max(500),
  note: z.string().max(1000).optional(),
})

export type InventoryStatusChangeValues = z.infer<typeof InventoryStatusChangeSchema>

export const HierarchyNodeSchema = z.object({
  project_id: z.string().uuid(),
  parent_id: z.string().uuid().optional().nullable(),
  node_type: z.string().min(2).max(50), // 'tower', 'floor', 'block', 'phase', etc.
  name: z.string().min(1).max(100),
  code: z.string().max(50).optional().nullable(),
  sequence_order: z.coerce.number().int().default(0),
})

export type HierarchyNodeFormValues = z.infer<typeof HierarchyNodeSchema>
