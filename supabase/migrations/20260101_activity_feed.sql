-- 20260101_activity_feed.sql
-- Sales activity feed (docs/product/SALES_ECOSYSTEM_AUDIT.md §6). The feed itself is read from what already happened —
-- bookings and targets in the performance ledger (20260094), achievement unlocks, trophies (20260099) and rewards won
-- (20260100) — so it has no second copy that could disagree. This adds only the reactions people leave on an item:
-- one of each kind per person per item. Who sees the feed, whether booking values show and whether reactions are on are
-- workspace settings (org_settings.gamification.feed), checked by the server.
-- Additive. The new table is server-only: RLS on, no client privileges.

BEGIN;

CREATE TABLE IF NOT EXISTS public.feed_reactions (
  org_id      UUID NOT NULL REFERENCES public.organisations(id) ON DELETE CASCADE,
  item_key    TEXT NOT NULL CHECK (item_key ~ '^(deal|unlock|target|trophy|reward|lead):[A-Za-z0-9:_-]{1,180}$'),
  profile_id  UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  kind        TEXT NOT NULL CHECK (kind IN ('clap', 'fire', 'heart', 'trophy')),
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (org_id, item_key, profile_id, kind)
);
CREATE INDEX IF NOT EXISTS idx_feed_reactions_item ON public.feed_reactions (org_id, item_key);
ALTER TABLE public.feed_reactions ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.feed_reactions FROM PUBLIC, anon, authenticated;
GRANT SELECT, INSERT, DELETE ON public.feed_reactions TO service_role;

-- Only members of the workspace react.
CREATE OR REPLACE FUNCTION public.guard_feed_reaction()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER SET search_path = pg_catalog, public, pg_temp AS $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM public.org_members m WHERE m.org_id = NEW.org_id AND m.profile_id = NEW.profile_id AND m.status = 'active') THEN
    RAISE EXCEPTION 'Only active members of this organisation can react' USING ERRCODE = '23514';
  END IF;
  RETURN NEW;
END $$;
REVOKE ALL ON FUNCTION public.guard_feed_reaction() FROM PUBLIC, anon, authenticated;
DROP TRIGGER IF EXISTS trg_guard_feed_reaction ON public.feed_reactions;
CREATE TRIGGER trg_guard_feed_reaction BEFORE INSERT ON public.feed_reactions
  FOR EACH ROW EXECUTE FUNCTION public.guard_feed_reaction();

COMMIT;
