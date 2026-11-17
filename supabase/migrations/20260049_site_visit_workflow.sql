-- 20260049_site_visit_workflow.sql
-- Site visits that run themselves once booked:
--   * each live visit has one open "site visit" task, so it appears in Today, on the dashboard, in the lead's
--     next step, and in the salesperson's existing 15-minute reminder — rescheduling moves it, completing,
--     cancelling or a no-show closes it;
--   * booking moves the lead to "visit scheduled", completing moves it to "visited" (never backwards);
--   * a no-show creates a call-back task for the next day;
--   * the buyer gets a confirmation now and reminders 24 h and 2 h before (scheduled jobs; the app sends them
--     and skips any that no longer match the visit, so a reschedule never sends a stale time);
--   * GPS check-in is recorded with its distance from the project when the project has coordinates.
-- Everything is driven by triggers on site_visits, so every path (API, imports, future tools) behaves the same.

BEGIN;

ALTER TABLE public.site_visits
  ADD COLUMN IF NOT EXISTS accompanied_by      TEXT CHECK (accompanied_by IS NULL OR char_length(accompanied_by) <= 200),
  ADD COLUMN IF NOT EXISTS meeting_link        TEXT CHECK (meeting_link IS NULL OR meeting_link ~ '^https://[^\s]{4,500}$'),
  ADD COLUMN IF NOT EXISTS cancel_reason       TEXT CHECK (cancel_reason IS NULL OR char_length(cancel_reason) <= 500),
  ADD COLUMN IF NOT EXISTS checkin_lat         DOUBLE PRECISION CHECK (checkin_lat IS NULL OR checkin_lat BETWEEN -90 AND 90),
  ADD COLUMN IF NOT EXISTS checkin_lng         DOUBLE PRECISION CHECK (checkin_lng IS NULL OR checkin_lng BETWEEN -180 AND 180),
  ADD COLUMN IF NOT EXISTS checkin_distance_m  INTEGER CHECK (checkin_distance_m IS NULL OR checkin_distance_m >= 0),
  ADD COLUMN IF NOT EXISTS created_by          UUID REFERENCES public.profiles(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS updated_by          UUID REFERENCES public.profiles(id) ON DELETE SET NULL;

ALTER TABLE public.projects
  ADD COLUMN IF NOT EXISTS latitude  DOUBLE PRECISION CHECK (latitude IS NULL OR latitude BETWEEN -90 AND 90),
  ADD COLUMN IF NOT EXISTS longitude DOUBLE PRECISION CHECK (longitude IS NULL OR longitude BETWEEN -180 AND 180);

ALTER TABLE public.lead_tasks
  ADD COLUMN IF NOT EXISTS site_visit_id UUID REFERENCES public.site_visits(id) ON DELETE CASCADE;
CREATE UNIQUE INDEX IF NOT EXISTS uq_lead_tasks_open_site_visit ON public.lead_tasks (site_visit_id) WHERE status = 'open' AND site_visit_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_site_visits_org_when ON public.site_visits (org_id, scheduled_at);

CREATE OR REPLACE FUNCTION public.site_visit_sync()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER SET search_path = pg_catalog, public, pg_temp AS $$
DECLARE
  v_lead      public.leads%ROWTYPE;
  v_project   TEXT;
  v_owner     UUID;
  v_live      BOOLEAN := NEW.status IN ('scheduled', 'rescheduled', 'checked_in');
  v_moved     BOOLEAN := TG_OP = 'INSERT' OR NEW.scheduled_at IS DISTINCT FROM OLD.scheduled_at;
  v_offset    INTEGER;
  v_actor     UUID;
BEGIN
  SELECT * INTO v_lead FROM public.leads WHERE id = NEW.lead_id;
  SELECT name INTO v_project FROM public.projects WHERE id = NEW.project_id;
  v_owner := coalesce(NEW.assigned_to, v_lead.assigned_to);
  -- Who did it: the member recorded on the change, else the visit's salesperson. Older callers that
  -- record no actor still work; an activity row is written only when someone can be named.
  v_actor := coalesce(NEW.updated_by, NEW.created_by, v_owner);

  IF v_live THEN
    -- One open task per live visit, kept at the visit time and with the visit's owner.
    UPDATE public.lead_tasks SET due_at = NEW.scheduled_at, assigned_to = v_owner,
           reminded_at = CASE WHEN v_moved THEN NULL ELSE reminded_at END,
           overdue_alerted_at = CASE WHEN v_moved THEN NULL ELSE overdue_alerted_at END
     WHERE site_visit_id = NEW.id AND status = 'open';
    IF NOT FOUND THEN
      INSERT INTO public.lead_tasks (org_id, lead_id, assigned_to, kind, due_at, note, created_by, site_visit_id)
      VALUES (NEW.org_id, NEW.lead_id, v_owner, 'site_visit', NEW.scheduled_at,
              left('Site visit · ' || coalesce(v_project, 'project'), 500), v_actor, NEW.id);
    END IF;

    IF v_lead.status IN ('new', 'contacted', 'qualified') THEN
      UPDATE public.leads SET status = 'site_visit_scheduled', updated_at = now() WHERE id = NEW.lead_id;
    END IF;

    IF v_moved AND NEW.status <> 'checked_in' THEN
      IF v_actor IS NOT NULL THEN
        INSERT INTO public.lead_activities (lead_id, actor_id, type, note, metadata)
        VALUES (NEW.lead_id, v_actor, 'site_visit_scheduled',
                CASE WHEN TG_OP = 'INSERT' THEN 'Site visit booked' ELSE 'Site visit rescheduled' END
                  || ' · ' || coalesce(v_project, 'project'),
                jsonb_build_object('site_visit_id', NEW.id, 'scheduled_at', NEW.scheduled_at));
      END IF;
      -- Buyer messages: confirmation now, reminders 24 h and 2 h before (only those still in the future).
      PERFORM public.enqueue_job('site_visit.notify',
        jsonb_build_object('visit_id', NEW.id, 'scheduled_at', NEW.scheduled_at,
                           'kind', CASE WHEN TG_OP = 'INSERT' THEN 'confirmation' ELSE 'rescheduled' END),
        NEW.org_id, now(), 'svn:' || NEW.id || ':' || extract(epoch FROM NEW.scheduled_at)::bigint || ':confirm');
      FOREACH v_offset IN ARRAY ARRAY[1440, 120] LOOP
        IF NEW.scheduled_at - make_interval(mins => v_offset) > now() THEN
          PERFORM public.enqueue_job('site_visit.notify',
            jsonb_build_object('visit_id', NEW.id, 'scheduled_at', NEW.scheduled_at, 'kind', 'reminder', 'minutes_before', v_offset),
            NEW.org_id, NEW.scheduled_at - make_interval(mins => v_offset),
            'svn:' || NEW.id || ':' || extract(epoch FROM NEW.scheduled_at)::bigint || ':' || v_offset);
        END IF;
      END LOOP;
    END IF;

  ELSIF TG_OP = 'UPDATE' AND NEW.status IS DISTINCT FROM OLD.status THEN
    UPDATE public.lead_tasks
       SET status = CASE WHEN NEW.status = 'completed' THEN 'done' ELSE 'cancelled' END, completed_at = now()
     WHERE site_visit_id = NEW.id AND status = 'open';

    IF NEW.status = 'completed' THEN
      IF v_lead.status IN ('new', 'contacted', 'qualified', 'site_visit_scheduled') THEN
        UPDATE public.leads SET status = 'site_visited', updated_at = now() WHERE id = NEW.lead_id;
      END IF;
      INSERT INTO public.lead_activities (lead_id, actor_id, type, note, metadata)
      SELECT NEW.lead_id, v_actor, 'site_visited', 'Visited ' || coalesce(v_project, 'the project'),
              jsonb_build_object('site_visit_id', NEW.id, 'outcome', NEW.outcome, 'rating', NEW.rating)
      WHERE v_actor IS NOT NULL;
    ELSIF NEW.status = 'no_show' THEN
      INSERT INTO public.lead_tasks (org_id, lead_id, assigned_to, kind, due_at, note, created_by)
      VALUES (NEW.org_id, NEW.lead_id, v_owner, 'call',
              greatest(now() + interval '2 hours', date_trunc('day', now() AT TIME ZONE 'Asia/Kolkata' + interval '1 day') AT TIME ZONE 'Asia/Kolkata' + interval '10 hours'),
              'Missed site visit — call to rebook', v_actor);
      INSERT INTO public.lead_activities (lead_id, actor_id, type, note, metadata)
      SELECT NEW.lead_id, v_actor, 'note_added', 'Did not come for the site visit — call-back scheduled',
             jsonb_build_object('site_visit_id', NEW.id)
      WHERE v_actor IS NOT NULL;
    ELSIF NEW.status = 'cancelled' THEN
      INSERT INTO public.lead_activities (lead_id, actor_id, type, note, metadata)
      SELECT NEW.lead_id, v_actor, 'note_added', 'Site visit cancelled' || coalesce(' · ' || NEW.cancel_reason, ''),
             jsonb_build_object('site_visit_id', NEW.id)
      WHERE v_actor IS NOT NULL;
    END IF;
  END IF;
  RETURN NEW;
END;
$$;
REVOKE ALL ON FUNCTION public.site_visit_sync() FROM PUBLIC, anon, authenticated;

DROP TRIGGER IF EXISTS trg_site_visits_sync ON public.site_visits;
CREATE TRIGGER trg_site_visits_sync
  AFTER INSERT OR UPDATE OF scheduled_at, status, assigned_to ON public.site_visits
  FOR EACH ROW EXECUTE FUNCTION public.site_visit_sync();

-- Only sensible moves between visit states; anything else is refused.
CREATE OR REPLACE FUNCTION public.guard_site_visit_status()
RETURNS TRIGGER LANGUAGE plpgsql SET search_path = pg_catalog, public, pg_temp AS $$
BEGIN
  IF NEW.status IS DISTINCT FROM OLD.status AND NOT (
       (OLD.status IN ('scheduled', 'rescheduled') AND NEW.status IN ('rescheduled', 'checked_in', 'completed', 'cancelled', 'no_show'))
    OR (OLD.status = 'checked_in' AND NEW.status IN ('completed', 'cancelled'))
    OR (OLD.status = 'no_show' AND NEW.status = 'rescheduled')
    OR (OLD.status = 'cancelled' AND NEW.status = 'rescheduled')) THEN
    RAISE EXCEPTION 'site visit: cannot change a % visit to %', OLD.status, NEW.status USING ERRCODE = 'check_violation';
  END IF;
  IF NEW.status = 'checked_in' AND OLD.status <> 'checked_in' THEN NEW.checked_in_at := coalesce(NEW.checked_in_at, now()); END IF;
  IF NEW.status = 'completed' AND OLD.status <> 'completed' THEN NEW.completed_at := coalesce(NEW.completed_at, now()); END IF;
  NEW.updated_at := now();
  RETURN NEW;
END;
$$;
DROP TRIGGER IF EXISTS trg_site_visits_guard ON public.site_visits;
CREATE TRIGGER trg_site_visits_guard BEFORE UPDATE ON public.site_visits
  FOR EACH ROW EXECUTE FUNCTION public.guard_site_visit_status();

COMMIT;
