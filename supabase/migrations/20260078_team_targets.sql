-- 20260078_team_targets.sql
-- Monthly targets per salesperson (Your team → Team members → Targets): site visits completed, bookings and booking
-- value. Set by owners, admins and managers through the API; progress is computed from site_visits and bookings.
-- Server-only like the other settings tables: RLS on, no client privileges. Additive only.

BEGIN;

CREATE TABLE IF NOT EXISTS public.member_targets (
  org_id         UUID NOT NULL REFERENCES public.organisations(id) ON DELETE CASCADE,
  profile_id     UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  month          DATE NOT NULL CHECK (extract(day FROM month) = 1),
  site_visits    INTEGER CHECK (site_visits IS NULL OR site_visits BETWEEN 0 AND 1000),
  bookings       INTEGER CHECK (bookings IS NULL OR bookings BETWEEN 0 AND 1000),
  booking_value  NUMERIC(15, 2) CHECK (booking_value IS NULL OR booking_value BETWEEN 0 AND 1e13),
  updated_by     UUID REFERENCES public.profiles(id) ON DELETE SET NULL,
  updated_at     TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (org_id, profile_id, month)
);
ALTER TABLE public.member_targets ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.member_targets FROM PUBLIC, anon, authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.member_targets TO service_role;

-- A target can only be set for someone who is a member of that organisation.
CREATE OR REPLACE FUNCTION public.guard_member_target()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER SET search_path = pg_catalog, public, pg_temp AS $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM public.org_members m WHERE m.org_id = NEW.org_id AND m.profile_id = NEW.profile_id) THEN
    RAISE EXCEPTION 'member_targets: profile is not a member of this organisation' USING ERRCODE = 'check_violation';
  END IF;
  RETURN NEW;
END $$;
REVOKE ALL ON FUNCTION public.guard_member_target() FROM PUBLIC, anon, authenticated;
DROP TRIGGER IF EXISTS trg_guard_member_target ON public.member_targets;
CREATE TRIGGER trg_guard_member_target BEFORE INSERT OR UPDATE ON public.member_targets
  FOR EACH ROW EXECUTE FUNCTION public.guard_member_target();

COMMIT;
