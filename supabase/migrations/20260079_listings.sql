-- 20260079_listings.sql
-- Resale and rental listings for agencies (channel-partner workspaces): properties owned by individuals that the
-- agency sells or lets — separate from developers' project inventory.
--   * listings: one row per property. The owner's contact details are private to the agency's managers, the
--     listing's agent and whoever added it (the API filters); they are never part of a share message.
--     Server-only like the other business tables added recently: RLS on, no client privileges.
--   * leads_all: what a buyer or tenant wants, beyond 20053's columns — buy or rent, the most rent they will pay,
--     and property types for commercial needs (office, shop, warehouse…). The view is recreated (20260073 rule).
-- Additive only.

BEGIN;

CREATE TABLE IF NOT EXISTS public.listings (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id          UUID NOT NULL REFERENCES public.organisations(id) ON DELETE CASCADE,
  kind            TEXT NOT NULL CHECK (kind IN ('sale', 'rent')),
  property_type   TEXT NOT NULL CHECK (property_type IN ('apartment', 'villa', 'independent_house', 'plot', 'office', 'shop', 'showroom', 'warehouse', 'co_working', 'land')),
  title           TEXT NOT NULL CHECK (char_length(btrim(title)) BETWEEN 3 AND 120),
  locality        TEXT NOT NULL CHECK (char_length(btrim(locality)) BETWEEN 2 AND 80),
  city            TEXT NOT NULL CHECK (char_length(btrim(city)) BETWEEN 2 AND 60),
  address         TEXT CHECK (address IS NULL OR char_length(address) <= 300),
  bhk             TEXT CHECK (bhk IS NULL OR char_length(bhk) <= 10),
  area            NUMERIC CHECK (area IS NULL OR area > 0 AND area < 1e7),
  area_unit       TEXT NOT NULL DEFAULT 'sqft' CHECK (area_unit IN ('sqft', 'sqyd', 'acres', 'guntas', 'cents')),
  floor           TEXT CHECK (floor IS NULL OR char_length(floor) <= 20),
  furnishing      TEXT CHECK (furnishing IS NULL OR furnishing IN ('unfurnished', 'semi', 'full')),
  facing          TEXT CHECK (facing IS NULL OR char_length(facing) <= 20),
  price           NUMERIC CHECK (price IS NULL OR price > 0 AND price < 1e11),
  monthly_rent    NUMERIC CHECK (monthly_rent IS NULL OR monthly_rent > 0 AND monthly_rent < 1e9),
  deposit         NUMERIC CHECK (deposit IS NULL OR deposit >= 0 AND deposit < 1e10),
  maintenance     NUMERIC CHECK (maintenance IS NULL OR maintenance >= 0 AND maintenance < 1e8),
  available_from  DATE,
  description     TEXT CHECK (description IS NULL OR char_length(description) <= 2000),
  owner_name      TEXT CHECK (owner_name IS NULL OR char_length(owner_name) <= 120),
  owner_phone     TEXT CHECK (owner_phone IS NULL OR owner_phone ~ '^\+?[0-9 ()-]{6,24}$'),
  owner_email     TEXT CHECK (owner_email IS NULL OR owner_email ~ '^[^@\s]+@[^@\s]+\.[^@\s]+$'),
  status          TEXT NOT NULL DEFAULT 'available' CHECK (status IN ('available', 'on_hold', 'closed', 'withdrawn')),
  assigned_to     UUID REFERENCES public.profiles(id) ON DELETE SET NULL,
  created_by      UUID REFERENCES public.profiles(id) ON DELETE SET NULL,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
  -- A sale has a price, a rental a monthly rent (either may still be blank while the owner decides).
  CHECK (kind = 'sale' OR price IS NULL),
  CHECK (kind = 'rent' OR (monthly_rent IS NULL AND deposit IS NULL))
);
CREATE INDEX IF NOT EXISTS idx_listings_org_status ON public.listings (org_id, status, kind);
ALTER TABLE public.listings ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.listings FROM PUBLIC, anon, authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.listings TO service_role;

-- The agent must be a member of the same organisation.
CREATE OR REPLACE FUNCTION public.guard_listing()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER SET search_path = pg_catalog, public, pg_temp AS $$
BEGIN
  IF NEW.assigned_to IS NOT NULL AND NOT EXISTS (SELECT 1 FROM public.org_members m WHERE m.org_id = NEW.org_id AND m.profile_id = NEW.assigned_to) THEN
    RAISE EXCEPTION 'listings: the agent is not a member of this organisation' USING ERRCODE = 'check_violation';
  END IF;
  NEW.updated_at := now();
  RETURN NEW;
END $$;
REVOKE ALL ON FUNCTION public.guard_listing() FROM PUBLIC, anon, authenticated;
DROP TRIGGER IF EXISTS trg_guard_listing ON public.listings;
CREATE TRIGGER trg_guard_listing BEFORE INSERT OR UPDATE ON public.listings FOR EACH ROW EXECUTE FUNCTION public.guard_listing();

-- Buyer / tenant requirements for listings.
ALTER TABLE public.leads_all
  ADD COLUMN IF NOT EXISTS req_purpose TEXT CHECK (req_purpose IS NULL OR req_purpose IN ('buy', 'rent')),
  ADD COLUMN IF NOT EXISTS req_rent_max NUMERIC CHECK (req_rent_max IS NULL OR req_rent_max > 0 AND req_rent_max < 1e9),
  ADD COLUMN IF NOT EXISTS req_property_types TEXT[] NOT NULL DEFAULT '{}' CHECK (cardinality(req_property_types) <= 10);
CREATE OR REPLACE VIEW public.leads WITH (security_invoker = true) AS
  SELECT * FROM public.leads_all WHERE deleted_at IS NULL;

-- The agency's share-message template (Settings → Listing share message).
ALTER TABLE public.org_settings
  ADD COLUMN IF NOT EXISTS listings JSONB NOT NULL DEFAULT '{}'::jsonb CHECK (jsonb_typeof(listings) = 'object' AND pg_column_size(listings) < 8192);

COMMIT;
