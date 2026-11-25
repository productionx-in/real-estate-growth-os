-- 20260097_team_structure.sql
-- Team structure (Settings → Sales structure → Team structure; org_settings.sales.teamsEnabled from 20260096).
-- Teams are the existing routing teams (20260038): one definition for who shares leads, who a team lead oversees and
-- how a team's performance is counted. This adds:
--   * teams.leader_profile_id — who leads the team. Must be an active member of the same organisation in a role that
--     can lead (owner, admin, manager, team lead). Leading does not put someone in the routing pool: membership
--     (team_members) still decides who receives leads.
--   * teams.project_ids — the projects the team sells (a dedicated team per project, or several). Must belong to the
--     same organisation. Informational for routing (rules still choose the team) and used to group performance.
--   * auth_shares_team(org, a, b) now also treats a team's leader as sharing the team with each member, so a team
--     lead who leads without selling sees and manages that team's leads exactly as a member-lead does.
-- Additive. Existing teams have no leader and no projects until someone sets them.

BEGIN;

ALTER TABLE public.teams
  ADD COLUMN IF NOT EXISTS leader_profile_id UUID REFERENCES public.profiles(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS project_ids UUID[] NOT NULL DEFAULT '{}' CHECK (cardinality(project_ids) <= 50);
CREATE INDEX IF NOT EXISTS idx_teams_leader ON public.teams (org_id, leader_profile_id) WHERE leader_profile_id IS NOT NULL;

CREATE OR REPLACE FUNCTION public.guard_team_structure()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER SET search_path = pg_catalog, public, pg_temp AS $$
DECLARE v_role public.member_role;
BEGIN
  IF NEW.leader_profile_id IS NOT NULL AND (TG_OP = 'INSERT' OR NEW.leader_profile_id IS DISTINCT FROM OLD.leader_profile_id) THEN
    SELECT om.role INTO v_role FROM public.org_members om WHERE om.org_id = NEW.org_id AND om.profile_id = NEW.leader_profile_id AND om.status = 'active';
    IF v_role IS NULL THEN
      RAISE EXCEPTION 'teams: the leader is not an active member of this organisation' USING ERRCODE = 'check_violation';
    END IF;
    IF v_role NOT IN ('owner', 'admin', 'manager', 'team_lead') THEN
      RAISE EXCEPTION 'teams: a % cannot lead a team (make them a team lead first)', v_role USING ERRCODE = 'check_violation';
    END IF;
  END IF;
  IF cardinality(NEW.project_ids) > 0 AND (TG_OP = 'INSERT' OR NEW.project_ids IS DISTINCT FROM OLD.project_ids) THEN
    IF EXISTS (SELECT 1 FROM unnest(NEW.project_ids) pid WHERE NOT EXISTS (SELECT 1 FROM public.projects p WHERE p.id = pid AND p.org_id = NEW.org_id)) THEN
      RAISE EXCEPTION 'teams: every project must belong to this organisation' USING ERRCODE = 'check_violation';
    END IF;
  END IF;
  RETURN NEW;
END $$;
REVOKE ALL ON FUNCTION public.guard_team_structure() FROM PUBLIC, anon, authenticated;
DROP TRIGGER IF EXISTS trg_guard_team_structure ON public.teams;
CREATE TRIGGER trg_guard_team_structure BEFORE INSERT OR UPDATE OF leader_profile_id, project_ids ON public.teams
  FOR EACH ROW EXECUTE FUNCTION public.guard_team_structure();

-- Same signature and checks as 20260056, plus: a team's leader shares the team with each of its members (both ways).
CREATE OR REPLACE FUNCTION public.auth_shares_team(p_org UUID, p_a UUID, p_b UUID)
RETURNS BOOLEAN
LANGUAGE sql STABLE SECURITY DEFINER
SET search_path = pg_catalog, public, pg_temp
AS $$
  SELECT p_a IS NOT NULL AND p_b IS NOT NULL
    AND (auth.uid() IS NULL OR public.auth_is_member_of_org(p_org))
    AND (
      EXISTS (
        SELECT 1
        FROM public.team_members a
        JOIN public.team_members b ON b.team_id = a.team_id AND b.org_id = a.org_id
        JOIN public.teams t ON t.id = a.team_id AND t.is_active
        WHERE a.org_id = p_org AND a.profile_id = p_a AND b.profile_id = p_b
      )
      OR EXISTS (
        SELECT 1
        FROM public.teams t
        JOIN public.team_members m ON m.team_id = t.id AND m.org_id = t.org_id
        WHERE t.org_id = p_org AND t.is_active
          AND ((t.leader_profile_id = p_a AND m.profile_id = p_b) OR (t.leader_profile_id = p_b AND m.profile_id = p_a))
      )
    );
$$;

COMMIT;
