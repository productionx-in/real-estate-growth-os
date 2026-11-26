# Backups and recovery

All RE data is in the production Supabase project: database, sign-in accounts and stored files. The application
code is in GitHub and is rebuilt from `main` by Vercel.

## What to confirm (owner, once)

The backups you have depend on the Supabase plan and add-ons. They could not be read with the access available to
the automation account. Check in Supabase → Database → Backups:

| Question | Where | Recommended for production |
|---|---|---|
| Daily backups enabled, and for how many days? | Database → Backups → Scheduled backups | Pro plan or higher (daily, 7+ days) |
| Point-in-time recovery? | Database → Backups → Point in time | Turn it on once there are paying customers. It restores to any second within the window. |
| Stored files (documents, brochures) | Storage | **Database backups do not include Storage objects.** Export them on a schedule, or accept the risk. |

Write the answers here when confirmed.

## Before every risky change

Merging a PR that contains a migration applies it to production. Before merging:

1. Check that the latest scheduled backup completed (Database → Backups).
2. Read the migration. Every RE migration so far is additive; new ones should be too.
3. After the merge, check production read-only: tables, row counts, and that the app loads.

## Restoring

- **Bad data in a few rows.** Do not restore the whole database. Find the correct values from the audit logs
  (`org_audit_logs`, `platform_audit_logs`) and correct them with a reviewed SQL statement.
- **Bad migration or wide corruption.**
  1. Put up a notice for customers.
  2. Restore from the last good backup, or from point-in-time recovery to just before the change, in the Supabase
     dashboard. This replaces the whole database: everything after that point is lost, including payments recorded
     since. Reconcile payments with the gateway dashboards afterwards (Platform Admin → Payments → Reconcile).
- **Deleted Supabase project.** Supabase can sometimes recover a project within a short window; contact their support
  at once.
- **Bad deploy, data fine.** Vercel → Deployments → promote the previous deployment (instant rollback). Then revert the
  PR in GitHub.

## Test it

Twice a year, restore a backup into a new, separate project, never over production. Check that leads, organisations
and invoices are present, then delete that project.
