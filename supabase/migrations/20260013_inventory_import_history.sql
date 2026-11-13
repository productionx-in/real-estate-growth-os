-- supabase/migrations/20260013_inventory_import_history.sql
-- Migration 0013: Inventory bulk import history tracking with strict multi-tenant RLS.

CREATE TABLE IF NOT EXISTS public.inventory_import_history (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id uuid NOT NULL REFERENCES public.organisations(id) ON DELETE CASCADE,
  project_id uuid NOT NULL REFERENCES public.projects(id) ON DELETE CASCADE,
  reference_id text NOT NULL UNIQUE,
  file_name text NOT NULL,
  file_type text NOT NULL CHECK (file_type IN ('csv', 'xlsx')),
  initiated_by uuid REFERENCES public.profiles(id) ON DELETE SET NULL,
  total_rows integer NOT NULL DEFAULT 0,
  successful_rows integer NOT NULL DEFAULT 0,
  failed_rows integer NOT NULL DEFAULT 0,
  status text NOT NULL CHECK (status IN ('pending', 'processing', 'completed', 'partial', 'failed')),
  error_summary jsonb DEFAULT '[]'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);

-- Index for efficient project-scoped and org-scoped history queries
CREATE INDEX IF NOT EXISTS idx_import_history_project ON public.inventory_import_history(project_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_import_history_org ON public.inventory_import_history(org_id, created_at DESC);

-- Enable RLS
ALTER TABLE public.inventory_import_history ENABLE ROW LEVEL SECURITY;

-- Select policy: Organisation members can view their project import history
DROP POLICY IF EXISTS "org_members_can_read_import_history" ON public.inventory_import_history;
CREATE POLICY "org_members_can_read_import_history" ON public.inventory_import_history
  FOR SELECT USING (
    auth_is_member_of_org(org_id)
  );

-- Insert policy: Managers, Admins, and Owners can record imports
DROP POLICY IF EXISTS "managers_can_insert_import_history" ON public.inventory_import_history;
CREATE POLICY "managers_can_insert_import_history" ON public.inventory_import_history
  FOR INSERT WITH CHECK (
    auth_has_role_in_org(org_id, ARRAY['owner', 'admin', 'manager'])
  );

-- Update policy: System/Managers can update import job status
DROP POLICY IF EXISTS "managers_can_update_import_history" ON public.inventory_import_history;
CREATE POLICY "managers_can_update_import_history" ON public.inventory_import_history
  FOR UPDATE USING (
    auth_has_role_in_org(org_id, ARRAY['owner', 'admin', 'manager'])
  );
