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

## Weekly backup on the free plan (GitHub Actions)

Until the Supabase Pro plan (daily managed backups), `.github/workflows/db-backup.yml` saves the production database
every Monday 03:07 IST, and on demand (GitHub → Actions → Database backup → Run workflow). It is read-only against
production. Each run stores one encrypted file, `re-db-YYYYMMDD-HHMM.tar.gz.gpg`, kept for 30 days as a workflow
artifact. It contains roles, schema and data (including sign-in accounts), and — once the two optional secrets below
are added — every Storage file (documents, plot maps, profile photos) under `storage/<bucket>/`.

**Turn it on (owner, once):** GitHub → repository → Settings → Secrets and variables → Actions → New repository secret:

| Secret | Value |
|---|---|
| `SUPABASE_DB_URL` | Supabase → Connect → **Session pooler** connection string (port 5432), with the database password filled in. The session pooler works from GitHub's IPv4 runners; the direct `db.…supabase.co` address does not. |
| `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY` (optional) | The same values as Vercel's `NEXT_PUBLIC_SUPABASE_URL` and `SUPABASE_SERVICE_ROLE_KEY`. Adds Storage files to the backup. |
| `BACKUP_PASSPHRASE` | A long random value (`openssl rand -base64 32`). Store it in your password manager: the backups cannot be opened without it. |

Then run the workflow once by hand and check it finishes green with an artifact. Until both secrets exist, the
scheduled run is skipped with a notice (never a failure).

**Open a backup:** download the artifact, then

```bash
gpg --decrypt re-db-YYYYMMDD-HHMM.tar.gz.gpg | tar -xzf - -C ./restore
```

**Restore into a new project (e.g. the move to Mumbai)** — never over production:

1. Create the new Supabase project in `ap-south-1` and copy its Session pooler connection string.
2. Load the files in order, in one transaction:

   ```bash
   psql --single-transaction --variable ON_ERROR_STOP=1 \
     --file restore/roles.sql --file restore/schema.sql \
     --command 'SET session_replication_role = replica' \
     --file restore/data.sql --dbname "$NEW_DB_URL"
   ```

3. Upload the files in `restore/storage/<bucket>/` to the same buckets in the new project (Supabase dashboard or CLI).
4. Point Vercel at the new project (Supabase URL and keys), set `vercel.json` `regions` to `bom1` in the same
   release, re-enter Auth URL settings, SMTP and secrets, then check sign-in, leads and invoices.

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
