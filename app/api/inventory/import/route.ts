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
  referenceId: z.string().optional(),
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

    const referenceId =
      parsed.data.referenceId ||
      `IMP-${Date.now()}-${Math.random().toString(36).substring(2, 7).toUpperCase()}`

    // 2. Cross-check rows for category consistency and check DB for existing duplicate unit numbers
    const validRowsToInsert: InventoryItemFormValues[] = []
    const validationErrors: Array<{ row: number; unit: string; error: string }> = []
    const previouslyCompletedUnits: string[] = []
    const preExistingUnits: string[] = []

    // Fetch existing units for this project including import_reference_id to distinguish:
    // A: Previously completed by this import reference
    // B: Pre-existing before this import began
    const { data: existingUnits } = await service
      .from('inventory_items')
      .select('unit_number, import_reference_id')
      .eq('project_id', projectId)

    const existingUnitMap = new Map<string, string | null>()
    for (const u of existingUnits || []) {
      existingUnitMap.set(u.unit_number.trim().toLowerCase(), u.import_reference_id || null)
    }

    const fileSeenSet = new Set<string>()

    rows.forEach((r, idx) => {
      const rowItem = r as InventoryItemFormValues
      const uNum = String(rowItem.unit_number || '').trim()
      const uLower = uNum.toLowerCase()

      if (!uNum) {
        validationErrors.push({
          row: idx + 1,
          unit: '—',
          error: 'Missing unit number',
        })
        return
      }

      if (fileSeenSet.has(uLower)) {
        validationErrors.push({
          row: idx + 1,
          unit: uNum,
          error: 'Duplicate unit number in file',
        })
        return
      }
      fileSeenSet.add(uLower)

      // Accurate accounting for retries:
      if (existingUnitMap.has(uLower)) {
        const itemImportRef = existingUnitMap.get(uLower)
        if (itemImportRef && itemImportRef === referenceId) {
          // A: Unit created by this same import reference (previously completed)
          previouslyCompletedUnits.push(uNum)
          return
        } else {
          // B: Unit existed before this import began (pre-existing, skipped without failure)
          preExistingUnits.push(uNum)
          return
        }
      }

      // Check category mismatch if not mixed-use
      if (project.category !== 'mixed_use' && rowItem.category !== project.category) {
        validationErrors.push({
          row: idx + 1,
          unit: uNum,
          error: `Category '${rowItem.category}' does not match project category '${project.category}'`,
        })
        return
      }

      validRowsToInsert.push(rowItem)
    })

    const totalInitialRows =
      validRowsToInsert.length +
      previouslyCompletedUnits.length +
      preExistingUnits.length +
      validationErrors.length +
      failedRows.length

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

    // 4. Execute batch import of validated pending rows
    const { successfulCount, failedCount, errors: batchErrors } = await executeBatchInventoryImport({
      orgId,
      projectId,
      referenceId,
      rows: validRowsToInsert,
      batchSize: 100,
    })

    // Combine genuine error lists (validation + database insertion failures)
    const genuineErrors = [
      ...failedRows,
      ...validationErrors,
      ...batchErrors.map((b) => ({ row: 0, unit: b.unit, error: b.message })),
    ]

    const genuineFailedTotal = validationErrors.length + failedRows.length + failedCount
    const finalStatus =
      successfulCount === 0 && previouslyCompletedUnits.length === 0 && genuineFailedTotal > 0
        ? 'failed'
        : genuineFailedTotal > 0
        ? 'partial'
        : 'completed'

    // 5. Update job status and audit metrics with full retry accounting
    await updateImportJob({
      jobId: job.id,
      status: finalStatus,
      successfulRows: successfulCount + previouslyCompletedUnits.length,
      failedRows: genuineFailedTotal,
      errorSummary: [
        {
          row: 0,
          unit: 'METRICS',
          error: JSON.stringify({
            newly_inserted: successfulCount,
            previously_completed: previouslyCompletedUnits.length,
            pre_existing_skipped: preExistingUnits.length,
            validation_failures: validationErrors.length + failedRows.length,
            database_failures: failedCount,
            total_failed: genuineFailedTotal,
            pending: 0,
          }),
        },
        ...genuineErrors,
      ],
    })

    return NextResponse.json({
      success: true,
      referenceId,
      totalRows: totalInitialRows,
      successfulCount,
      newlyInsertedCount: successfulCount,
      previouslyCompletedCount: previouslyCompletedUnits.length,
      preExistingSkippedCount: preExistingUnits.length,
      failedCount: genuineFailedTotal,
      status: finalStatus,
      errors: genuineErrors,
    })
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : 'Internal server error'
    return NextResponse.json({ error: msg }, { status: 500 })
  }
}
