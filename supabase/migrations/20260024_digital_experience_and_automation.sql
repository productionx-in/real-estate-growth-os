-- Migration 20260024_digital_experience_and_automation.sql
-- Stage 6: Digital Experience & Marketing Automation
-- Tables: project_microsites, automation_workflows, automation_workflow_steps, automation_executions, lead_touchpoints

-- 1. Project Microsites / Digital Showrooms
CREATE TABLE IF NOT EXISTS public.project_microsites (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id UUID NOT NULL REFERENCES public.organisations(id) ON DELETE CASCADE,
  project_id UUID NOT NULL REFERENCES public.projects(id) ON DELETE CASCADE,
  slug TEXT NOT NULL,
  custom_domain TEXT,
  title TEXT NOT NULL,
  tagline TEXT,
  description TEXT,
  hero_image_url TEXT,
  virtual_tour_url TEXT,
  master_plan_url TEXT,
  brochure_url TEXT,
  video_url TEXT,
  accent_color TEXT DEFAULT '#4f46e5',
  theme TEXT NOT NULL DEFAULT 'modern' CHECK (theme IN ('modern', 'luxury', 'minimal', 'vibrant')),
  features JSONB DEFAULT '[]'::jsonb,
  faqs JSONB DEFAULT '[]'::jsonb,
  is_published BOOLEAN NOT NULL DEFAULT false,
  published_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc'::text, now()),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc'::text, now()),
  CONSTRAINT uq_microsite_project UNIQUE (project_id),
  CONSTRAINT uq_microsite_slug UNIQUE (slug)
);

CREATE INDEX IF NOT EXISTS idx_microsites_org ON public.project_microsites(org_id);
CREATE INDEX IF NOT EXISTS idx_microsites_slug ON public.project_microsites(slug);

-- 2. Marketing Automation Workflows
CREATE TABLE IF NOT EXISTS public.automation_workflows (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id UUID NOT NULL REFERENCES public.organisations(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  description TEXT,
  trigger_event TEXT NOT NULL CHECK (trigger_event IN (
    'lead_created', 'site_visit_scheduled', 'site_visit_completed',
    'unit_blocked', 'booking_confirmed', 'deal_stage_changed'
  )),
  filter_conditions JSONB DEFAULT '{}'::jsonb,
  is_active BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc'::text, now()),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc'::text, now())
);

CREATE INDEX IF NOT EXISTS idx_workflows_org ON public.automation_workflows(org_id);
CREATE INDEX IF NOT EXISTS idx_workflows_trigger ON public.automation_workflows(trigger_event);

-- 3. Workflow Steps
CREATE TABLE IF NOT EXISTS public.automation_workflow_steps (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  workflow_id UUID NOT NULL REFERENCES public.automation_workflows(id) ON DELETE CASCADE,
  step_order INTEGER NOT NULL,
  action_type TEXT NOT NULL CHECK (action_type IN (
    'send_whatsapp_template', 'send_email', 'create_task',
    'assign_sales_agent', 'delay_hours'
  )),
  action_config JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc'::text, now())
);

CREATE INDEX IF NOT EXISTS idx_workflow_steps_order ON public.automation_workflow_steps(workflow_id, step_order);

-- 4. Workflow Executions Log
CREATE TABLE IF NOT EXISTS public.automation_executions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id UUID NOT NULL REFERENCES public.organisations(id) ON DELETE CASCADE,
  workflow_id UUID NOT NULL REFERENCES public.automation_workflows(id) ON DELETE CASCADE,
  target_id UUID NOT NULL, -- lead_id or booking_id
  target_type TEXT NOT NULL DEFAULT 'lead' CHECK (target_type IN ('lead', 'booking', 'deal', 'site_visit')),
  status TEXT NOT NULL DEFAULT 'running' CHECK (status IN ('running', 'completed', 'failed', 'paused')),
  current_step_order INTEGER NOT NULL DEFAULT 1,
  execution_log JSONB DEFAULT '[]'::jsonb,
  error_message TEXT,
  started_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc'::text, now()),
  completed_at TIMESTAMPTZ
);

CREATE INDEX IF NOT EXISTS idx_workflow_executions_org ON public.automation_executions(org_id);
CREATE INDEX IF NOT EXISTS idx_workflow_executions_target ON public.automation_executions(target_id);

-- 5. Multi-Touch Attribution Touchpoints
CREATE TABLE IF NOT EXISTS public.lead_touchpoints (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id UUID NOT NULL REFERENCES public.organisations(id) ON DELETE CASCADE,
  lead_id UUID NOT NULL REFERENCES public.leads(id) ON DELETE CASCADE,
  project_id UUID REFERENCES public.projects(id) ON DELETE SET NULL,
  channel TEXT NOT NULL, -- 'meta_ads', 'google_ads', 'website_form', '99acres', 'magicbricks', 'housing', 'whatsapp', 'channel_partner', 'direct_walkin'
  touchpoint_type TEXT NOT NULL CHECK (touchpoint_type IN (
    'ad_click', 'form_submission', 'portal_enquiry', 'inbound_message',
    'site_visit', 'cp_walkin', 'call_connected'
  )),
  campaign_name TEXT,
  campaign_id TEXT,
  ad_name TEXT,
  utm_source TEXT,
  utm_medium TEXT,
  utm_campaign TEXT,
  referrer_url TEXT,
  landing_page TEXT,
  channel_partner_id UUID REFERENCES public.channel_partners(id) ON DELETE SET NULL,
  metadata JSONB DEFAULT '{}'::jsonb,
  occurred_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc'::text, now())
);

CREATE INDEX IF NOT EXISTS idx_touchpoints_org ON public.lead_touchpoints(org_id);
CREATE INDEX IF NOT EXISTS idx_touchpoints_lead ON public.lead_touchpoints(lead_id);
CREATE INDEX IF NOT EXISTS idx_touchpoints_channel ON public.lead_touchpoints(channel);
CREATE INDEX IF NOT EXISTS idx_touchpoints_occurred ON public.lead_touchpoints(occurred_at);

-- Enable RLS on all Stage 6 tables
ALTER TABLE public.project_microsites ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.automation_workflows ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.automation_workflow_steps ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.automation_executions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.lead_touchpoints ENABLE ROW LEVEL SECURITY;

-- Tenant Isolation Policies
CREATE POLICY "project_microsites_tenant_isolation" ON public.project_microsites
  USING (org_id IN (SELECT organisation_id FROM public.organisation_members WHERE profile_id = auth.uid()));

CREATE POLICY "automation_workflows_tenant_isolation" ON public.automation_workflows
  USING (org_id IN (SELECT organisation_id FROM public.organisation_members WHERE profile_id = auth.uid()));

CREATE POLICY "automation_workflow_steps_tenant_isolation" ON public.automation_workflow_steps
  USING (workflow_id IN (SELECT id FROM public.automation_workflows WHERE org_id IN (SELECT organisation_id FROM public.organisation_members WHERE profile_id = auth.uid())));

CREATE POLICY "automation_executions_tenant_isolation" ON public.automation_executions
  USING (org_id IN (SELECT organisation_id FROM public.organisation_members WHERE profile_id = auth.uid()));

CREATE POLICY "lead_touchpoints_tenant_isolation" ON public.lead_touchpoints
  USING (org_id IN (SELECT organisation_id FROM public.organisation_members WHERE profile_id = auth.uid()));

-- Public Read Policy for Published Microsites
CREATE POLICY "public_microsite_read" ON public.project_microsites
  FOR SELECT
  USING (is_published = true);
