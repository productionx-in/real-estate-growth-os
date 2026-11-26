-- 20260102_profile_photos.sql
-- Profile photos: everyone can set their own display picture (Settings → Profile).
--   * Storage bucket "avatars": PUBLIC to read (a photo is shown wherever the person appears — header, team, leaderboard,
--     feed), so images load without signing. No storage policies are created: only the server (service role) writes,
--     after checking who is signed in, that the file really is a JPEG, PNG or WebP image, and its size. Files live at
--     <profile id>/<random id>.<ext>, so nobody can guess or overwrite another person's photo; the old file is deleted
--     when a new one is set or the photo is removed.
--   * profiles.avatar_url keeps the photo's address; nothing else changes.
-- Additive.

BEGIN;

INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES ('avatars', 'avatars', true, 2097152, ARRAY['image/jpeg', 'image/png', 'image/webp'])
ON CONFLICT (id) DO UPDATE SET public = true, file_size_limit = 2097152, allowed_mime_types = ARRAY['image/jpeg', 'image/png', 'image/webp'];

COMMIT;
