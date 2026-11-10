-- supabase/migrations/20260001_enums.sql
-- Create all application enums

CREATE TYPE org_type AS ENUM ('developer', 'channel_partner');
CREATE TYPE org_plan AS ENUM ('free', 'growth', 'enterprise');
CREATE TYPE member_role AS ENUM ('owner', 'admin', 'manager', 'sales_exec', 'readonly');
CREATE TYPE project_type AS ENUM ('residential', 'commercial', 'mixed_use', 'plots');
CREATE TYPE project_status AS ENUM ('planning', 'pre_launch', 'launched', 'ongoing', 'completed');
CREATE TYPE lead_source AS ENUM (
  'website', 'meta_ads', 'google_ads', '99acres', 'housing',
  'magicbricks', 'whatsapp', 'referral', 'walk_in', 'csv_import', 'other'
);
CREATE TYPE lead_status AS ENUM (
  'new', 'contacted', 'qualified', 'site_visit_scheduled',
  'site_visited', 'negotiation', 'booked', 'lost', 'junk'
);
CREATE TYPE lead_priority AS ENUM ('low', 'medium', 'high');
CREATE TYPE activity_type AS ENUM (
  'created', 'status_changed', 'assigned', 'note_added',
  'call_logged', 'site_visit_scheduled', 'site_visited'
);
