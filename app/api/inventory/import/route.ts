// app/api/inventory/import/route.ts
// Secure bulk inventory import endpoint with batch processing and tenant isolation
import { NextResponse, type NextRequest } from 'next/server'
import { authorizeProjectAccess } from '@/lib/auth/tenant'
import { createServiceClient } from '@/lib/supabase/server'
import { createImportJob, updateImportJob, executeBatchInventoryImport } from '@/lib/dal/import'
import type { InventoryItemFormValues } from '@/lib/validations/inventory'
import { z } from 'zod'

const ImportRequestSchema = z.object({
  projectId: z.string().uuid(),
  fileName: z.string().min(1).max(255),
  fileType: z.enum(['csv', 'xlsx']),
  rows: z.array(z.any()).min(1, 'At least one valid row is required').max(5000, 'Maximum 5,000 rows per batch'),
  failedRows: z
    .array(
      z.object({
        row: z.number(),
        unit: z.string(),
        error: z.string(),
      })
    )
    .optional()
    .default([]),
})

export async function POST(request: NextRequest) {
  try {
    const body = await request.json()
    const parsed = ImportRequestSchema.safeParse(body)
    if (!parsed.success) {
      return NextResponse.json(
        { error: 'Invalid import payload', details: parsed.error.flatten() },
        { status: 400 }
      )
    }

    const { projectId, fileName, fileType, rows, failedRows } = parsed.data

    // RBAC: Require manager, admin, or owner in this project's organisation
    const authResult = await authorizeProjectAccess(projectId, ['owner', 'admin', 'manager'])
    if (!authResult.success) {
      return authResult.response
    }

    const { orgId, profile } = authResult.context
    const profileId = profile.id
    const service = createServiceClient()

    // 1. Verify project category
    const { data: project } = await service
      .from('projects')
      .select('id, category')
      .eq('id', projectId)
      .single()

    if (!project) {
      return NextResponse.json({ error: 'Project not found' }, { status: 404 })
    }

    // 2. Cross-check rows for category consistency and check DB for existing duplicate unit numbers
    const validRowsToInsert: InventoryItemFormValues[] = []
    const duplicateErrors: Array<{ row: number; unit: string; error: string }> = []

    // Fetch existing units for this project
    const { data: existingUnits } = await service
      .from('inventory_items')
      .select('unit_number')
      .eq('project_id', projectId)

    const existingSet = new Set((existingUnits || []).map((u) => u.unit_number.toLowerCase()))
    const fileSeenSet = new Set<string>()

    rows.forEach((r, idx) => {
      const rowItem = r as InventoryItemFormValues
      const uNum = String(rowItem.unit_number || '').trim()
      const uLower = uNum.toLowerCase()

      if (!uNum) {
        duplicateErrors.push({
          row: idx + 1,
          unit: '—',
          error: 'Missing unit number',
        })
        return
      }

      if (fileSeenSet.has(uLower)) {
        duplicateErrors.push({
          row: idx + 1,
          unit: uNum,
          error: 'Duplicate unit number in file',
        })
        return
      }
      fileSeenSet.add(uLower)

      if (existingSet.has(uLower)) {
        duplicateErrors.push({
          row: idx + 1,
          unit: uNum,
          error: `Unit '${uNum}' already exists in this project`,
        })
        return
      }

      // Check category mismatch if not mixed-use
      if (project.category !== 'mixed_use' && rowItem.category !== project.category) {
        duplicateErrors.push({
          row: idx + 1,
          unit: uNum,
          error: `Category '${rowItem.category}' does not match project category '${project.category}'`,
        })
        return
      }

      validRowsToInsert.push(rowItem)
    })

    const referenceId = `IMP-${Date.now()}-${Math.random().toString(36).substring(2, 7).toUpperCase()}`
    const totalInitialRows = validRowsToInsert.length + duplicateErrors.length + failedRows.length

    // 3. Create initial import job in history
    const job = await createImportJob({
      orgId,
      projectId,
      referenceId,
      fileName,
      fileType,
      initiatedBy: profileId,
      totalRows: totalInitialRows,
    })

    if (!job) {
      return NextResponse.json({ error: 'Failed to initialize import record' }, { status: 500 })
    }

    // 4. Execute batch import of validated rows
    const { successfulCount, failedCount, errors: batchErrors } = await executeBatchInventoryImport({
      orgId,
      projectId,
      rows: validRowsToInsert,
      batchSize: 100,
    })

    // Combine all errors
    const allErrors = [
      ...failedRows,
      ...duplicateErrors,
      ...batchErrors.map((b) => ({ row: 0, unit: b.unit, error: b.message })),
    ]

    const finalFailedTotal = duplicateErrors.length + failedRows.length + failedCount
    const finalStatus =
      successfulCount === 0 && finalFailedTotal > 0
        ? 'failed'
        : finalFailedTotal > 0
        ? 'partial'
        : 'completed'

    // 5. Update job status and audit metrics
    await updateImportJob({
      jobId: job.id,
      status: finalStatus,
      successfulRows: successfulCount,
      failedRows: finalFailedTotal,
      errorSummary: allErrors,
    })

    return NextResponse.json({
      success: true,
      referenceId,
      totalRows: totalInitialRows,
      successfulCount,
      failedCount: finalFailedTotal,
      status: finalStatus,
      errors: allErrors,
    })
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : 'Internal server error'
    return NextResponse.json({ error: msg }, { status: 500 })
  }
}
