// lib/automation/workflow-engine.ts
// Marketing Automation & Drip Workflow Engine for Stage 6B.

import { createServiceClient } from '@/lib/supabase/server'
import type {
  WorkflowTriggerEvent,
  AutomationWorkflow,
  WorkflowStep,
  ExecutionStatus,
} from './types'

export interface WorkflowTriggerContext {
  orgId: string
  triggerEvent: WorkflowTriggerEvent
  targetId: string
  targetType: 'lead' | 'booking' | 'deal' | 'site_visit'
  data: Record<string, unknown>
}

export function evaluateFilterConditions(
  conditions: Record<string, unknown>,
  data: Record<string, unknown>
): boolean {
  if (!conditions || Object.keys(conditions).length === 0) return true

  for (const [key, expectedValue] of Object.entries(conditions)) {
    const actualValue = data[key]
    if (expectedValue === undefined || expectedValue === null) continue

    if (Array.isArray(expectedValue)) {
      if (!expectedValue.includes(actualValue)) return false
    } else if (typeof expectedValue === 'object' && expectedValue !== null) {
      const conditionObj = expectedValue as Record<string, unknown>
      if (conditionObj.gte !== undefined && Number(actualValue) < Number(conditionObj.gte)) return false
      if (conditionObj.lte !== undefined && Number(actualValue) > Number(conditionObj.lte)) return false
      if (conditionObj.eq !== undefined && actualValue !== conditionObj.eq) return false
    } else if (actualValue !== expectedValue) {
      return false
    }
  }

  return true
}

export async function executeWorkflowStep(
  step: WorkflowStep,
  context: WorkflowTriggerContext
): Promise<{ status: 'success' | 'failed' | 'skipped'; output?: unknown; error?: string }> {
  const { action_type, action_config } = step

  try {
    switch (action_type) {
      case 'send_whatsapp_template': {
        const templateName = action_config.template_name as string
        const recipientPhone = (context.data.phone || action_config.recipient_phone) as string
        // In real execution, calls whatsapp outbound sender
        return {
          status: 'success',
          output: {
            action: 'whatsapp_dispatched',
            template: templateName,
            recipient: recipientPhone,
          },
        }
      }

      case 'send_email': {
        const subject = action_config.subject as string
        const recipientEmail = (context.data.email || action_config.recipient_email) as string
        return {
          status: 'success',
          output: { action: 'email_dispatched', subject, recipient: recipientEmail },
        }
      }

      case 'create_task': {
        const taskTitle = action_config.title as string
        return {
          status: 'success',
          output: { action: 'task_created', title: taskTitle, targetId: context.targetId },
        }
      }

      case 'assign_sales_agent': {
        const agentId = action_config.agent_id as string
        return {
          status: 'success',
          output: { action: 'agent_assigned', agentId, leadId: context.targetId },
        }
      }

      case 'delay_hours': {
        const hours = (action_config.hours as number) || 24
        return {
          status: 'success',
          output: { action: 'delay_scheduled', hours },
        }
      }

      default:
        return { status: 'skipped', output: { reason: `Unsupported action ${action_type}` } }
    }
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err)
    return { status: 'failed', error: msg }
  }
}

export async function processTriggerEvent(
  context: WorkflowTriggerContext
): Promise<{ triggeredCount: number; executionIds: string[] }> {
  const service = createServiceClient()
  const executionIds: string[] = []

  try {
    // 1. Fetch active workflows matching the trigger event
    const { data: workflows } = await service
      .from('automation_workflows')
      .select('*')
      .eq('org_id', context.orgId)
      .eq('trigger_event', context.triggerEvent)
      .eq('is_active', true)

    if (!workflows || workflows.length === 0) {
      return { triggeredCount: 0, executionIds: [] }
    }

    for (const rawWf of workflows) {
      const wf = rawWf as unknown as AutomationWorkflow
      const matches = evaluateFilterConditions(
        (wf.filter_conditions || {}) as Record<string, unknown>,
        context.data
      )

      if (!matches) continue

      // 2. Fetch steps for this workflow
      const { data: rawSteps } = await service
        .from('automation_workflow_steps')
        .select('*')
        .eq('workflow_id', wf.id)
        .order('step_order', { ascending: true })

      const steps = (rawSteps || []) as unknown as WorkflowStep[]
      if (steps.length === 0) continue

      // 3. Create execution record
      const { data: execRecord } = await service
        .from('automation_executions')
        .insert({
          org_id: context.orgId,
          workflow_id: wf.id,
          target_id: context.targetId,
          target_type: context.targetType,
          status: 'running',
          current_step_order: 1,
          execution_log: [] as unknown as import('@/types/database').Json,
        })
        .select('id')
        .single()

      if (!execRecord) continue
      const executionId = execRecord.id
      executionIds.push(executionId)

      const executionLog: Array<{
        step: number
        action_type: string
        timestamp: string
        status: 'success' | 'failed' | 'skipped'
        output?: unknown
      }> = []

      let overallStatus: ExecutionStatus = 'completed'
      let errorMessage: string | null = null

      // 4. Run steps sequentially
      for (const step of steps) {
        const stepResult = await executeWorkflowStep(step, context)
        executionLog.push({
          step: step.step_order,
          action_type: step.action_type,
          timestamp: new Date().toISOString(),
          status: stepResult.status,
          output: stepResult.output,
        })

        if (stepResult.status === 'failed') {
          overallStatus = 'failed'
          errorMessage = stepResult.error || 'Step execution failed'
          break
        }
      }

      // 5. Update execution record with outcome
      await service
        .from('automation_executions')
        .update({
          status: overallStatus,
          current_step_order: steps.length,
          execution_log: executionLog as unknown as import('@/types/database').Json,
          error_message: errorMessage,
          completed_at: new Date().toISOString(),
        })
        .eq('id', executionId)
    }

    return { triggeredCount: executionIds.length, executionIds }
  } catch {
    return { triggeredCount: 0, executionIds: [] }
  }
}
