-- 20260109_perf_indexes_rls.sql — performance clean-up from the Supabase performance advisor (no behaviour change).
-- 1. Indexes for foreign keys that pages filter or join on, and that cascades scan on delete. Audit-only "*_by"
--    columns are left unindexed on purpose: they are never filtered on and every index costs writes.
-- 2. Six RLS policies called auth.uid() / auth_org_id() once per row; wrapping them in (select …) makes Postgres
--    evaluate them once per statement. Same rules, same roles, same commands (ALTER POLICY keeps both).
-- 3. organisations.slug had two identical indexes; the unique constraint's index stays.

CREATE INDEX IF NOT EXISTS idx_leads_all_duplicate_of_id ON public.leads_all (duplicate_of_id);
CREATE INDEX IF NOT EXISTS idx_lead_assignments_assigned_to ON public.lead_assignments (assigned_to);
CREATE INDEX IF NOT EXISTS idx_site_visits_assigned_to ON public.site_visits (assigned_to);
CREATE INDEX IF NOT EXISTS idx_inventory_blockings_lead_id ON public.inventory_blockings (lead_id);
CREATE INDEX IF NOT EXISTS idx_inventory_blockings_project_id ON public.inventory_blockings (project_id);
CREATE INDEX IF NOT EXISTS idx_bookings_blocking_id ON public.bookings (blocking_id);
CREATE INDEX IF NOT EXISTS idx_deals_assigned_to ON public.deals (assigned_to);
CREATE INDEX IF NOT EXISTS idx_deals_channel_partner_id ON public.deals (channel_partner_id);
CREATE INDEX IF NOT EXISTS idx_deals_inventory_id ON public.deals (inventory_id);
CREATE INDEX IF NOT EXISTS idx_deals_lead_id ON public.deals (lead_id);
CREATE INDEX IF NOT EXISTS idx_team_members_profile_id ON public.team_members (profile_id);
CREATE INDEX IF NOT EXISTS idx_notifications_lead_id ON public.notifications (lead_id);
CREATE INDEX IF NOT EXISTS idx_lead_tasks_assigned_to ON public.lead_tasks (assigned_to);
CREATE INDEX IF NOT EXISTS idx_lead_documents_lead_id ON public.lead_documents (lead_id);
CREATE INDEX IF NOT EXISTS idx_lead_documents_unit_id ON public.lead_documents (unit_id);
CREATE INDEX IF NOT EXISTS idx_org_partnerships_channel_partner_id ON public.org_partnerships (channel_partner_id);
CREATE INDEX IF NOT EXISTS idx_partnership_projects_developer_org_id ON public.partnership_projects (developer_org_id);
CREATE INDEX IF NOT EXISTS idx_partnership_projects_project_id ON public.partnership_projects (project_id);
CREATE INDEX IF NOT EXISTS idx_deal_registrations_partnership_id ON public.deal_registrations (partnership_id);
CREATE INDEX IF NOT EXISTS idx_deal_registrations_project_id ON public.deal_registrations (project_id);
CREATE INDEX IF NOT EXISTS idx_partner_unit_requests_blocking_id ON public.partner_unit_requests (blocking_id);
CREATE INDEX IF NOT EXISTS idx_partner_unit_requests_inventory_id ON public.partner_unit_requests (inventory_id);
CREATE INDEX IF NOT EXISTS idx_partner_unit_requests_partnership_id ON public.partner_unit_requests (partnership_id);
CREATE INDEX IF NOT EXISTS idx_partner_unit_requests_project_id ON public.partner_unit_requests (project_id);
CREATE INDEX IF NOT EXISTS idx_campaigns_segment_id ON public.campaigns (segment_id);

ALTER POLICY org_members_can_read_profiles ON public.profiles
  USING ((id IN (SELECT org_members.profile_id FROM public.org_members WHERE org_members.org_id = (SELECT public.auth_org_id())))
         OR (auth_user_id = (SELECT auth.uid())));
ALTER POLICY users_can_update_own_profile ON public.profiles
  USING (auth_user_id = (SELECT auth.uid()));
ALTER POLICY platform_users_read_self ON public.platform_users
  USING (user_id = (SELECT auth.uid()));
ALTER POLICY sales_reps_read_own_requests ON public.customer_onboarding_requests
  USING (requested_by = (SELECT auth.uid()));
ALTER POLICY sales_reps_create_draft_requests ON public.customer_onboarding_requests
  WITH CHECK ((requested_by = (SELECT auth.uid())) AND (status = 'draft'::public.onboarding_request_status));
ALTER POLICY sales_reps_update_draft_requests ON public.customer_onboarding_requests
  USING ((requested_by = (SELECT auth.uid())) AND (status = 'draft'::public.onboarding_request_status))
  WITH CHECK ((requested_by = (SELECT auth.uid())) AND (status = ANY (ARRAY['draft'::public.onboarding_request_status, 'pending_approval'::public.onboarding_request_status])));

DROP INDEX IF EXISTS public.idx_organisations_slug;
