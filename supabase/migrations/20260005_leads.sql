-- supabase/migrations/20260005_leads.sql

CREATE TABLE leads (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id          UUID NOT NULL REFERENCES organisations(id) ON DELETE RESTRICT,
  project_id      UUID REFERENCES projects(id) ON DELETE SET NULL,
  assigned_to     UUID REFERENCES profiles(id) ON DELETE SET NULL,
  name            TEXT NOT NULL,
  email           TEXT,
  phone           TEXT NOT NULL,
  source          lead_source NOT NULL DEFAULT 'other',
  status          lead_status NOT NULL DEFAULT 'new',
  priority        lead_priority NOT NULL DEFAULT 'medium',
  budget_min      NUMERIC,
  budget_max      NUMERIC,
  notes           TEXT,
  custom_fields   JSONB NOT NULL DEFAULT '{}',
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_leads_org ON leads (org_id);
CREATE INDEX idx_leads_assigned_to ON leads (assigned_to);
CREATE INDEX idx_leads_project ON leads (project_id);
CREATE INDEX idx_leads_status ON leads (org_id, status);
CREATE INDEX idx_leads_created_at ON leads (org_id, created_at DESC);

CREATE TRIGGER leads_updated_at
  BEFORE UPDATE ON leads
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- lead_activities: immutable audit log
CREATE TABLE lead_activities (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  lead_id     UUID NOT NULL REFERENCES leads(id) ON DELETE CASCADE,
  actor_id    UUID NOT NULL REFERENCES profiles(id) ON DELETE RESTRICT,
  type        activity_type NOT NULL,
  note        TEXT,
  metadata    JSONB NOT NULL DEFAULT '{}',
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_lead_activities_lead ON lead_activities (lead_id, created_at DESC);

-- lead_assignments: assignment history log
CREATE TABLE lead_assignments (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  lead_id       UUID NOT NULL REFERENCES leads(id) ON DELETE CASCADE,
  assigned_to   UUID NOT NULL REFERENCES profiles(id) ON DELETE RESTRICT,
  assigned_by   UUID NOT NULL REFERENCES profiles(id) ON DELETE RESTRICT,
  assigned_at   TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_lead_assignments_lead ON lead_assignments (lead_id);
