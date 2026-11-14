// lib/automation/types.ts
// Domain types for Stage 6: Digital Experience & Marketing Automation

export type MicrositeTheme = 'modern' | 'luxury' | 'minimal' | 'vibrant'

export interface ProjectMicrosite {
  id: string
  org_id: string
  project_id: string
  slug: string
  custom_domain: string | null
  title: string
  tagline: string | null
  description: string | null
  hero_image_url: string | null
  virtual_tour_url: string | null
  master_plan_url: string | null
  brochure_url: string | null
  video_url: string | null
  accent_color: string
  theme: MicrositeTheme
  features: string[]
  faqs: Array<{ question: string; answer: string }>
  is_published: boolean
  published_at: string | null
  created_at: string
  updated_at: string
}

export type WorkflowTriggerEvent =
  | 'lead_created'
  | 'site_visit_scheduled'
  | 'site_visit_completed'
  | 'unit_blocked'
  | 'booking_confirmed'
  | 'deal_stage_changed'

export type WorkflowActionType =
  | 'send_whatsapp_template'
  | 'send_email'
  | 'create_task'
  | 'assign_sales_agent'
  | 'delay_hours'

export interface WorkflowStep {
  id: string
  workflow_id: string
  step_order: number
  action_type: WorkflowActionType
  action_config: Record<string, unknown>
  created_at: string
}

export interface AutomationWorkflow {
  id: string
  org_id: string
  name: string
  description: string | null
  trigger_event: WorkflowTriggerEvent
  filter_conditions: Record<string, unknown>
  is_active: boolean
  steps?: WorkflowStep[]
  created_at: string
  updated_at: string
}

export type ExecutionStatus = 'running' | 'completed' | 'failed' | 'paused'

export interface AutomationExecution {
  id: string
  org_id: string
  workflow_id: string
  target_id: string
  target_type: 'lead' | 'booking' | 'deal' | 'site_visit'
  status: ExecutionStatus
  current_step_order: number
  execution_log: Array<{
    step: number
    action_type: string
    timestamp: string
    status: 'success' | 'failed' | 'skipped'
    output?: unknown
  }>
  error_message: string | null
  started_at: string
  completed_at: string | null
}

export type TouchpointType =
  | 'ad_click'
  | 'form_submission'
  | 'portal_enquiry'
  | 'inbound_message'
  | 'site_visit'
  | 'cp_walkin'
  | 'call_connected'

export interface LeadTouchpoint {
  id: string
  org_id: string
  lead_id: string
  project_id: string | null
  channel: string
  touchpoint_type: TouchpointType
  campaign_name: string | null
  campaign_id: string | null
  ad_name: string | null
  utm_source: string | null
  utm_medium: string | null
  utm_campaign: string | null
  referrer_url: string | null
  landing_page: string | null
  channel_partner_id: string | null
  metadata?: Record<string, unknown>
  occurred_at: string
}

export type AttributionModel =
  | 'first_touch'
  | 'last_touch'
  | 'linear'
  | 'position_based'
  | 'time_decay'

export interface ChannelAttributionResult {
  channel: string
  creditPercentage: number
  attributedValue: number
  touchpointCount: number
}
