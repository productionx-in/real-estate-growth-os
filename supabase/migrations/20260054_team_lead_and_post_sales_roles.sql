-- 20260054_team_lead_and_post_sales_roles.sql
-- Two new member roles (used from 20260055 on; Postgres cannot use a new enum value in the same
-- transaction that adds it):
--   team_lead  — works their own leads and their team's (teams = the routing teams they belong to)
--   post_sales — works booked customers only; never receives new leads
ALTER TYPE public.member_role ADD VALUE IF NOT EXISTS 'team_lead' AFTER 'manager';
ALTER TYPE public.member_role ADD VALUE IF NOT EXISTS 'post_sales' AFTER 'sales_exec';
