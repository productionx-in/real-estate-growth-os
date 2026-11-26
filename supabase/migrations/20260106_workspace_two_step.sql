-- 20260106_workspace_two_step.sql — workspace security settings: a workspace can require two-step verification for
-- every member (lib/auth/two-step.ts enforces it on the server; lib/settings/workspace.ts validates the value).
BEGIN;
ALTER TABLE public.org_settings ADD COLUMN IF NOT EXISTS security JSONB NOT NULL DEFAULT '{}'::jsonb;
COMMIT;
