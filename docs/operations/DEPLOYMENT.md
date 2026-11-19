# Deployment

| What | How it reaches production |
|---|---|
| Application | Merging to `main` → Vercel builds and deploys production automatically |
| Database migrations (`supabase/migrations/*`) | Merging to `main` → the Supabase GitHub integration applies new migrations to production |
| Environment variables | Set by hand in Vercel (`ENVIRONMENT.md`); a redeploy picks them up |
| Database secrets for jobs | Set by hand in Supabase Vault (`JOB_WORKER_SETUP.md`) |

**So a merge is a production release.** No merge to `main` happens without the owner's approval.

## Releasing a PR

1. **CI is green.** `phase1-database-validation` resets a clean database through every migration, then runs the
   type-check, unit tests and every real-database suite.
2. **Before merging, check production read-only.** Record the latest migration and key row counts:

   ```sql
   select max(version) from supabase_migrations.schema_migrations;
   ```

   ```sql
   select (select count(*) from organisations) orgs, (select count(*) from leads) leads,
          (select count(*) from org_subscriptions) subs, (select count(*) from org_subscription_invoices) invoices;
   ```

3. **Merge.** Use a merge commit or a squash, as the PR says.
4. **After merging:**
   - Vercel shows the deployment Ready.
   - The new migration version is present.
   - The counts are unchanged, unless the PR says otherwise.
   - `/login` and one workspace load.
   - Supabase → Advisors shows no new ERROR.
5. **If something is wrong:** promote the previous Vercel deployment, then revert the PR. A migration is not reverted
   automatically; see `BACKUP_RECOVERY.md`.

## Order matters

Some PRs depend on others: a migration number, or a shared file. Merge in the order the PRs state. When two open PRs
each add a migration, the lower number must merge first.

## Staging

There is no staging environment yet. `DEMO_ENVIRONMENT.md` lists what to provision (a separate Supabase project and a
separate Vercel deployment). Once it exists, deploy each PR to staging and test it there before merging.
