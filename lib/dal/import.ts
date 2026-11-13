// lib/dal/import.ts
// Data Access Layer for Inventory Import History and Batch Insertion
import { createServiceClient } from '@/lib/supabase/server'
import type { InventoryItemFormValues } from '@/lib/validations/inventory'
import type { Json } from '@/types/database'

export interface ImportHistoryRecord {
  id: string
  org_id: string
  project_id: string
  reference_id: string
  file_name: string
  file_type: 'csv' | 'xlsx'
  initiated_by?: string | null
  total_rows: number
  successful_rows: number
  failed_rows: number
  status: 'pending' | 'processing' | 'completed' | 'partial' | 'failed'
  error_summary: Array<{ row: number; unit: string; error: string }>
  created_at: string
  initiator?: {
    full_name: string
    avatar_url?: string | null
  } | null
}

/**
 * Fetch past import records for a project
 */
export async function getProjectImportHistory(
  projectId: string,
  orgId: string
): Promise<ImportHistoryRecord[]> {
  const service = createServiceClient()

  const { data, error } = await service
    .from('inventory_import_history')
    .select(
      `
      *,
      initiator:profiles!inventory_import_history_initiated_by_fkey(full_name, avatar_url)
    `
    )
    .eq('project_id', projectId)
    .eq('org_id', orgId)
    .order('created_at', { ascending: false })
    .limit(20)

  if (error) {
    console.error('Failed to fetch import history:', error)
    return []
  }

  return (data || []) as unknown as ImportHistoryRecord[]
}

/**
 * Record a new import job
 */
export async function createImportJob({
  orgId,
  projectId,
  referenceId,
  fileName,
  fileType,
  initiatedBy,
  totalRows,
}: {
  orgId: string
  projectId: string
  referenceId: string
  fileName: string
  fileType: 'csv' | 'xlsx'
  initiatedBy?: string | null
  totalRows: number
}) {
  const service = createServiceClient()

  const { data, error } = await service
    .from('inventory_import_history')
    .insert({
      org_id: orgId,
      project_id: projectId,
      reference_id: referenceId,
      file_name: fileName,
      file_type: fileType,
      initiated_by: initiatedBy || null,
      total_rows: totalRows,
      successful_rows: 0,
      failed_rows: 0,
      status: 'processing',
      error_summary: [],
    })
    .select()
    .single()

  if (error) {
    console.error('Failed to create import job:', error)
    return null
  }

  return data
}

/**
 * Update import job status and metrics
 */
export async function updateImportJob({
  jobId,
  status,
  successfulRows,
  failedRows,
  errorSummary,
}: {
  jobId: string
  status: 'completed' | 'partial' | 'failed'
  successfulRows: number
  failedRows: number
  errorSummary: Array<{ row: number; unit: string; error: string }>
}) {
  const service = createServiceClient()

  const { error } = await service
    .from('inventory_import_history')
    .update({
      status,
      successful_rows: successfulRows,
      failed_rows: failedRows,
      error_summary: errorSummary as unknown as Json,
    })
    .eq('id', jobId)

  if (error) {
    console.error('Failed to update import job:', error)
  }
}

/**
 * Execute batch insertion of validated inventory rows
 * Uses batch chunking (100 rows per batch) to prevent network and timeout issues.
 */
export async function executeBatchInventoryImport({
  orgId,
  projectId,
  rows,
  batchSize = 100,
}: {
  orgId: string
  projectId: string
  rows: InventoryItemFormValues[]
  batchSize?: number
}): Promise<{
  successfulCount: number
  failedCount: number
  errors: Array<{ unit: string; message: string }>
}> {
  const service = createServiceClient()
  let successfulCount = 0
  let failedCount = 0
  const errors: Array<{ unit: string; message: string }> = []

  // Process in chunks of batchSize
  for (let i = 0; i < rows.length; i += batchSize) {
    const chunk = rows.slice(i, i + batchSize)

    const insertPayload = chunk.map((item) => ({
      org_id: orgId,
      project_id: projectId,
      unit_number: item.unit_number.trim(),
      category: item.category,
      area_value: item.area_value,
      area_unit: item.area_unit,
      carpet_area: item.carpet_area ?? null,
      built_up_area: item.built_up_area ?? null,
      super_built_up_area: item.super_built_up_area ?? null,
      plot_area: item.plot_area ?? null,
      plot_dimensions: item.plot_dimensions || null,
      road_width_ft: item.road_width_ft ?? null,
      is_corner_plot: item.is_corner_plot ?? false,
      facing: item.facing || null,
      bhk_config: item.bhk_config || null,
      floor_number: item.floor_number ?? null,
      tower_name: item.tower_name || null,
      commercial_asset_type: item.commercial_asset_type || null,
      bedrooms: item.bedrooms ?? null,
      bathrooms: item.bathrooms ?? null,
      balconies: item.balconies ?? null,
      parking_spaces: item.parking_spaces ?? 0,
      furnishing_status: item.furnishing_status || 'unfurnished',
      base_rate: item.base_rate ?? null,
      total_price: item.total_price ?? null,
      pricing_breakup: (item.pricing_breakup ?? {}) as unknown as Json,
      internal_notes: item.internal_notes || null,
      custom_attributes: (item.custom_attributes ?? {}) as unknown as Json,
      hierarchy_node_id: item.hierarchy_node_id || null,
      status: 'available' as const, // New records default to available
    }))

    const { data: inserted, error } = await service
      .from('inventory_items')
      .insert(insertPayload)
      .select('id, unit_number')

    if (error) {
      // If batch fails (e.g. duplicate constraint), retry row-by-row in this chunk
      console.warn('Batch insert had error, falling back to individual inserts:', error.message)

      for (const row of insertPayload) {
        const { error: singleError } = await service.from('inventory_items').insert(row)
        if (singleError) {
          failedCount++
          errors.push({
            unit: row.unit_number,
            message: singleError.message,
          })
        } else {
          successfulCount++
        }
      }
    } else {
      successfulCount += (inserted || []).length
    }
  }

  return {
    successfulCount,
    failedCount,
    errors,
  }
}
