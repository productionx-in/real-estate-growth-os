// app/api/automation/workflows/route.ts
import { NextResponse, type NextRequest } from 'next/server'
import { authorizeSalesRequest } from '@/lib/sales/auth'
import { processTriggerEvent } from '@/lib/automation/workflow-engine'
import { createServiceClient } from '@/lib/supabase/server'
import type { WorkflowTriggerEvent, WorkflowStep } from '@/lib/automation/types'

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url)
    const orgId = searchParams.get('orgId')
    const auth = await authorizeSalesRequest(orgId)
    if (!auth.success) return auth.response

    const service = createServiceClient()
    const { data: workflows } = await service
      .from('automation_workflows')
      .select('*')
      .eq('org_id', auth.context.orgId)
      .order('created_at', { ascending: false })

    return NextResponse.json({ data: workflows || [], count: workflows?.length || 0 })
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err)
    return NextResponse.json({ error: msg }, { status: 500 })
  }
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json()
    const auth = await authorizeSalesRequest(body.orgId)
    if (!auth.success) return auth.response

    const service = createServiceClient()

    // 1. Create Workflow definition
    const { data: wf, error: wfErr } = await service
      .from('automation_workflows')
      .insert({
        org_id: auth.context.orgId,
        name: body.name,
        description: body.description || null,
        trigger_event: body.triggerEvent,
        filter_conditions: (body.filterConditions || {}) as unknown as import('@/types/database').Json,
        is_active: body.isActive ?? true,
      })
      .select('*')
      .single()

    if (wfErr || !wf) {
      return NextResponse.json({ error: wfErr?.message || 'Failed to create workflow' }, { status: 400 })
    }

    // 2. Insert Steps if provided
    if (body.steps && Array.isArray(body.steps)) {
      const stepsToInsert = body.steps.map((s: Partial<WorkflowStep>, idx: number) => ({
        workflow_id: wf.id,
        step_order: s.step_order || idx + 1,
        action_type: s.action_type || 'send_whatsapp_template',
        action_config: (s.action_config || {}) as unknown as import('@/types/database').Json,
      }))

      await service.from('automation_workflow_steps').insert(stepsToInsert)
    }

    return NextResponse.json({ data: wf }, { status: 201 })
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err)
    return NextResponse.json({ error: msg }, { status: 500 })
  }
}

// Manual trigger test route
export async function PUT(request: NextRequest) {
  try {
    const body = await request.json()
    const auth = await authorizeSalesRequest(body.orgId)
    if (!auth.success) return auth.response

    const result = await processTriggerEvent({
      orgId: auth.context.orgId,
      triggerEvent: body.triggerEvent as WorkflowTriggerEvent,
      targetId: body.targetId,
      targetType: body.targetType || 'lead',
      data: body.data || {},
    })

    return NextResponse.json({ data: result })
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err)
    return NextResponse.json({ error: msg }, { status: 500 })
  }
}
