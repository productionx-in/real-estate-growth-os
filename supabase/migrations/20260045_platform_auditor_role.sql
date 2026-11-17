-- 20260045_platform_auditor_role.sql
-- Read-only platform role: sees the console and the platform audit trail, changes nothing.
-- (Its own migration: a new enum value cannot be used in the transaction that adds it.)
ALTER TYPE public.platform_role ADD VALUE IF NOT EXISTS 'auditor';
