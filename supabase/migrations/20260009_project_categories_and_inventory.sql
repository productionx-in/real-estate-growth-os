-- supabase/migrations/20260009_project_categories_and_inventory.sql
-- Migration 0009: Standard 5 Project Categories, Flexible Hierarchy Tree,
-- Complete Inventory Item Model, and Immutable Status History with RLS.

-- 1. Create standard project categories enum
CREATE TYPE project_category AS ENUM (
  'apartments',
  'plotted_developments',
  'commercial_sale',
  'villas_gated_communities',
  'mixed_use'
);

-- 2. Create standard inventory availability statuses enum
CREATE TYPE inventory_status AS ENUM (
  'available',
  'on_hold',
  'booked',
  'sold',
  'blocked'
);

-- 3. Extend projects table with category, project code, and rich metadata
ALTER TABLE projects
  ADD COLUMN IF NOT EXISTS code TEXT,
  ADD COLUMN IF NOT EXISTS category project_category DEFAULT 'apartments',
  ADD COLUMN IF NOT EXISTS rera_number TEXT,
  ADD COLUMN IF NOT EXISTS total_area_value NUMERIC,
  ADD COLUMN IF NOT EXISTS total_area_unit TEXT DEFAULT 'acres',
  ADD COLUMN IF NOT EXISTS total_units_count INT DEFAULT 0,
  ADD COLUMN IF NOT EXISTS approval_authority TEXT,
  ADD COLUMN IF NOT EXISTS launch_date DATE,
  ADD COLUMN IF NOT EXISTS completion_date DATE,
  ADD COLUMN IF NOT EXISTS amenities JSONB DEFAULT '[]'::jsonb,
  ADD COLUMN IF NOT EXISTS specifications JSONB DEFAULT '{}'::jsonb;

-- Populate code if missing
UPDATE projects SET code = UPPER(SUBSTRING(slug FROM 1 FOR 4) || '-' || SUBSTRING(id::text FROM 1 FOR 4)) WHERE code IS NULL;

-- 4. Create flexible project hierarchy tree (Phases, Towers, Floors, Blocks, Clusters)
CREATE TABLE project_hierarchy_nodes (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id          UUID NOT NULL REFERENCES organisations(id) ON DELETE RESTRICT,
  project_id      UUID NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  parent_id       UUID REFERENCES project_hierarchy_nodes(id) ON DELETE CASCADE,
  node_type       TEXT NOT NULL, -- 'phase', 'tower', 'floor', 'block', 'cluster', 'street', 'building', 'component'
  name            TEXT NOT NULL, -- e.g. 'Phase 1', 'Tower A', '4th Floor', 'Block C'
  code            TEXT,          -- e.g. 'T-A', 'FL-04'
  sequence_order  INT NOT NULL DEFAULT 0,
  metadata        JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_proj_hierarchy_project ON project_hierarchy_nodes(project_id);
CREATE INDEX idx_proj_hierarchy_parent ON project_hierarchy_nodes(parent_id);
CREATE INDEX idx_proj_hierarchy_org ON project_hierarchy_nodes(org_id);

CREATE TRIGGER project_hierarchy_nodes_updated_at
  BEFORE UPDATE ON project_hierarchy_nodes
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- 5. Create inventory items table
CREATE TABLE inventory_items (
  id                    UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id                UUID NOT NULL REFERENCES organisations(id) ON DELETE RESTRICT,
  project_id            UUID NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  hierarchy_node_id     UUID REFERENCES project_hierarchy_nodes(id) ON DELETE SET NULL,
  unit_number           TEXT NOT NULL,
  category              project_category NOT NULL,
  status                inventory_status NOT NULL DEFAULT 'available',
  
  -- Area and dimensions
  area_value            NUMERIC NOT NULL,
  area_unit             TEXT NOT NULL DEFAULT 'sqft', -- 'sqft', 'sqyd', 'acres'
  carpet_area           NUMERIC,
  built_up_area         NUMERIC,
  super_built_up_area   NUMERIC,
  plot_area             NUMERIC,
  plot_dimensions       TEXT,
  road_width_ft         NUMERIC,
  is_corner_plot        BOOLEAN NOT NULL DEFAULT false,
  
  -- Facing and configuration
  facing                TEXT, -- 'East', 'West', 'North', 'South', 'North-East', 'South-East', 'North-West', 'South-West'
  bhk_config            TEXT, -- '1BHK', '2BHK', '2.5BHK', '3BHK', '4BHK', '5BHK+'
  floor_number          INT,
  tower_name            TEXT,
  commercial_asset_type TEXT, -- 'Office', 'Retail', 'Showroom', 'Warehouse'
  bedrooms              INT,
  bathrooms             INT,
  balconies             INT,
  parking_spaces        INT DEFAULT 0,
  furnishing_status     TEXT DEFAULT 'unfurnished',

  -- Modular pricing (not hardcoded)
  base_rate             NUMERIC,
  total_price           NUMERIC,
  pricing_breakup       JSONB NOT NULL DEFAULT '{}'::jsonb,

  -- Metadata and history
  images                JSONB NOT NULL DEFAULT '[]'::jsonb,
  documents             JSONB NOT NULL DEFAULT '[]'::jsonb,
  internal_notes        TEXT,
  custom_attributes     JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at            TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at            TIMESTAMPTZ NOT NULL DEFAULT now(),

  UNIQUE (project_id, unit_number)
);

CREATE INDEX idx_inventory_org ON inventory_items(org_id);
CREATE INDEX idx_inventory_project ON inventory_items(project_id);
CREATE INDEX idx_inventory_hierarchy ON inventory_items(hierarchy_node_id);
CREATE INDEX idx_inventory_status ON inventory_items(project_id, status);
CREATE INDEX idx_inventory_category ON inventory_items(project_id, category);

CREATE TRIGGER inventory_items_updated_at
  BEFORE UPDATE ON inventory_items
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- 6. Create immutable inventory status change audit history
CREATE TABLE inventory_status_history (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  inventory_id    UUID NOT NULL REFERENCES inventory_items(id) ON DELETE CASCADE,
  org_id          UUID NOT NULL REFERENCES organisations(id) ON DELETE RESTRICT,
  previous_status inventory_status,
  new_status      inventory_status NOT NULL,
  changed_by      UUID NOT NULL REFERENCES profiles(id) ON DELETE RESTRICT,
  reason          TEXT,
  metadata        JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_inv_status_hist_item ON inventory_status_history(inventory_id, created_at DESC);
CREATE INDEX idx_inv_status_hist_org ON inventory_status_history(org_id);

-- 7. Row Level Security Policies
ALTER TABLE project_hierarchy_nodes ENABLE ROW LEVEL SECURITY;
ALTER TABLE inventory_items ENABLE ROW LEVEL SECURITY;
ALTER TABLE inventory_status_history ENABLE ROW LEVEL SECURITY;

-- project_hierarchy_nodes
CREATE POLICY "members_can_read_hierarchy_nodes" ON project_hierarchy_nodes
  FOR SELECT USING (org_id = auth_org_id());

CREATE POLICY "managers_can_insert_hierarchy_nodes" ON project_hierarchy_nodes
  FOR INSERT WITH CHECK (org_id = auth_org_id() AND is_manager());

CREATE POLICY "managers_can_update_hierarchy_nodes" ON project_hierarchy_nodes
  FOR UPDATE USING (org_id = auth_org_id() AND is_manager());

CREATE POLICY "admins_can_delete_hierarchy_nodes" ON project_hierarchy_nodes
  FOR DELETE USING (org_id = auth_org_id() AND is_admin());

-- inventory_items
CREATE POLICY "members_can_read_inventory" ON inventory_items
  FOR SELECT USING (org_id = auth_org_id());

CREATE POLICY "managers_can_insert_inventory" ON inventory_items
  FOR INSERT WITH CHECK (org_id = auth_org_id() AND is_manager());

CREATE POLICY "managers_can_update_inventory" ON inventory_items
  FOR UPDATE USING (org_id = auth_org_id() AND is_manager());

CREATE POLICY "admins_can_delete_inventory" ON inventory_items
  FOR DELETE USING (org_id = auth_org_id() AND is_admin());

-- inventory_status_history (immutable audit log: select + insert only)
CREATE POLICY "members_can_read_inventory_history" ON inventory_status_history
  FOR SELECT USING (org_id = auth_org_id());

CREATE POLICY "members_can_insert_inventory_history" ON inventory_status_history
  FOR INSERT WITH CHECK (org_id = auth_org_id() AND auth_app_role() NOT IN ('readonly'));
