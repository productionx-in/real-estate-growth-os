# REGrow demo / test environment (STAGING ONLY)

Fifteen demo accounts across three fictional customer workspaces and the internal REGrow console, with realistic
fictional data, for walking through every user journey. **Never run any of this against production.** The seed refuses
production on its own (below), but the first line of defence is that nobody points it there.

This file is safe to commit: it contains **no passwords and no authenticator secrets**. Those are written only to the
private login sheet the seed generates in `.demo-credentials/` (git-ignored, file mode 600). Share that sheet only with
the test team, privately. Never publish it on the REGrow website.

## 1. What has to be provisioned (not available yet)

There is no staging Supabase project today. The only REGrow project is production (`rtbvzqwwhefyyuhpoznu`); the seed
refuses it. To run the demo you need, once:

| # | Item | Who | Notes |
|---|---|---|---|
| 1 | A **new Supabase project** for staging (e.g. "REGrow Staging"), region ap-south-1 | Owner | Separate project, not a branch of production. Free/Pro plan is enough. |
| 2 | Apply all migrations to it | Engineer | `npx supabase@2.122.1 link --project-ref <staging-ref>` then `npx supabase@2.122.1 db push`. Never link production in the same shell. |
| 3 | Mark it as staging (database owner, SQL editor) | Owner/engineer | Step 2 below. The seed cannot do this itself. |
| 4 | Auth settings on staging | Engineer | Site URL and redirect URLs = the staging app URL. **Leave custom SMTP unset** (or point it at a sink) so no real email can be sent. MFA (TOTP) enabled — on by default. |
| 5 | A **separate Vercel deployment** for staging (a second Vercel project, or a Preview environment with its own variables) | Owner | Must use only the staging Supabase URL/keys. See variables below. |
| 6 | Staging environment variables | Engineer | `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY`, `SUPABASE_SERVICE_ROLE_KEY` (all **staging**), `NEXT_PUBLIC_APP_URL=<staging URL>`, `NEXT_PUBLIC_DEPLOYMENT_LABEL=STAGING` (shows a ribbon on every page). **Do not set** `RESEND_API_KEY`, payment-gateway keys, Meta/Google/WhatsApp credentials or web-push keys — without them the app uses its mock e-mail adapter and sends nothing. |
| 7 | Protect the staging URL | Owner | Vercel Deployment Protection (password or Vercel login) so the demo is not public and is not indexed. |

## 2. Mark the staging database (once, database owner only)

In the **staging** project's SQL editor (check the project name in the header first):

```sql
insert into public.deployment_environment (kind, project_ref, note)
values ('staging', '<staging project ref>', 'REGrow staging — demo data allowed');
```

The table accepts one row, rejects the production reference, and cannot be written by the service role, signed-in
users or the public. Production must never have a row. To check production read-only: `select * from
public.deployment_environment;` must return nothing.

For a local stack (`npx supabase@2.122.1 start`) use `('local', 'local', 'local dev')` via
`psql postgresql://postgres:postgres@127.0.0.1:54322/postgres`.

## 3. Seed, reset, remove

From a checkout, with the **staging** keys in the shell (never production keys):

```bash
export NEXT_PUBLIC_SUPABASE_URL=https://<staging-ref>.supabase.co
export NEXT_PUBLIC_SUPABASE_ANON_KEY=<staging anon key>
export SUPABASE_SERVICE_ROLE_KEY=<staging service role key>
export NEXT_PUBLIC_APP_URL=<staging app URL>
```

```bash
DEMO_PASSWORD='<temporary password>' node scripts/demo/seed-demo.mjs reset --confirm=<staging-ref>
```

```bash
node scripts/demo/seed-demo.mjs status --confirm=<staging-ref>
```

```bash
node scripts/demo/seed-demo.mjs purge --confirm=<staging-ref>
```

- `reset` removes all existing demo data, then creates it again (idempotent; the data is deterministic). Staff
  authenticator secrets are new after every reset. If seeding fails part-way, the partial data is removed.
- `purge` removes **all** demo data and accounts. `status` lists what exists.
- The private login sheet is written to `.demo-credentials/DEMO-LOGINS-<ref>.md`.

### How the seed refuses production

It stops before writing anything unless **all** hold: the URL is a local stack or a `<ref>.supabase.co` project that
is not `rtbvzqwwhefyyuhpoznu`; the database carries the staging/local marker for **that** reference; `--confirm=`
repeats the reference; `VERCEL_ENV`/`NEXT_PUBLIC_APP_ENV` are not `production`. In the database, a demo organisation
cannot be created on an unmarked database, `is_demo` can never be added to an existing organisation, and
`demo_purge()` refuses on an unmarked database.

### What removal touches

Only organisations with `is_demo = true` (with everything inside them) and accounts that are **both** tagged
`app_metadata.regrow_demo = true` **and** on an `example.test` address, plus records those accounts wrote in the internal
console (prospects, platform audit entries — the audit log stays append-only for everything else). If a demo account
is a member of a non-demo organisation, or any non-demo record points at a demo account, the purge stops and removes
nothing.

## 4. Accounts

All accounts share the temporary password given to the seed (in the private sheet). Customer organisations have no
two-step verification; internal staff must enter an authenticator code (secrets in the private sheet).

### Customer workspaces

REGrow has two organisation types: `developer` and `channel_partner`. A channel-partner firm and an agency are both
`channel_partner`; they are separate organisations and cannot see each other's data. "Admin" maps to the **owner**
role (full control, including team and plan), "Manager" to **manager**, "Sales" to **sales_exec**.

| Email | Role | Organisation | Lands on | Sees |
|---|---|---|---|---|
| builder.admin@example.test | owner | Apex Developers Demo (developer) | `/apex-developers-demo` | Everything in Apex: all 38 leads, both projects, 60 units, visits, bookings, deals, partners, team, settings, billing (trial), audit log |
| builder.manager@example.test | manager | Apex Developers Demo | `/apex-developers-demo` | All Apex leads and team activity, visits, inventory, partners' registrations (can review), no billing/owner settings |
| builder.sales@example.test | sales_exec | Apex Developers Demo | `/apex-developers-demo/today` or dashboard | Only leads assigned to Rohan, own tasks and visits; inventory (read); no team/billing/settings |
| partner.admin@example.test | owner | Prime Channel Partners Demo (channel partner) | `/prime-channel-partners-demo` | Prime's 15 buyers, partnership with Apex (Heights shared with prices, Greens availability only), registrations (1 accepted, 1 submitted) |
| partner.manager@example.test | manager | Prime Channel Partners Demo | dashboard | All Prime leads, can submit registrations |
| partner.sales@example.test | sales_exec | Prime Channel Partners Demo | dashboard | Only own assigned Prime leads |
| agency.admin@example.test | owner | Growth Realty Agency Demo (channel partner) | `/growth-realty-agency-demo` | Growth's 13 buyers, partnership with Apex (Heights, availability only — no prices), registrations (1 rejected, 1 submitted) |
| agency.manager@example.test | manager | Growth Realty Agency Demo | dashboard | All Growth leads, can submit registrations |
| agency.sales@example.test | sales_exec | Growth Realty Agency Demo | dashboard | Only own assigned Growth leads |

### Internal REGrow staff (console at `/platform`)

| Email | Platform role | Sees | Cannot |
|---|---|---|---|
| superadmin@example.test | super_admin (Platform Owner) | Dashboard, organisations, sales, support, payments, audit log, staff, provisioning | — (the only super admin) |
| sales@regrow-demo.example.test | sales_rep | Dashboard, organisations (directory), own prospects | Customer CRM data, support, payments, staff |
| manager@regrow-demo.example.test | sales_manager | Dashboard, organisations, all prospects, assignment | Customer CRM data, support, payments, staff |
| support@regrow-demo.example.test | support_agent | Dashboard, organisations, support cases | Sales pipeline, payments, staff; customer data only through an audited, time-limited support grant |
| finance@regrow-demo.example.test | finance_admin | Dashboard, organisations, payments | Sales, support, staff |
| auditor@regrow-demo.example.test | auditor | Read-only: dashboard, organisations, sales, support, payments, audit log | Any change |

No internal account can open a customer workspace (`/<org>/…`); staff never read customer leads.

## 5. Demo data (all fictional)

- **Apex Developers Demo** — *Apex Heights Demo* (Pune, launched, 2 towers × 6 floors × 4 units, 2 and 3 BHK) and
  *Apex Greens Villas Demo* (pre-launch, 12 villas). Inventory: 5 sold, 3 booked, 2 on hold, 2 blocked with active
  tokens (one expiring in a day), the rest available. 38 leads from website, Meta, Google, 99acres, Housing,
  MagicBricks, WhatsApp, referral and walk-in across every status (one created by accepting Prime's registration).
  Follow-ups: upcoming, overdue and completed. Site visits: today/upcoming, completed with outcomes and ratings, one
  no-show. 3 bookings (one through Prime), deals at blocked / negotiation / visit-done / booked / lost (open pipeline
  ≈ ₹8.1 crore). Team "Apex Developers Sales Team".
- **Prime Channel Partners Demo** — 15 buyers, active partnership with Apex, 2 registrations (accepted with protection
  window, submitted).
- **Growth Realty Agency Demo** — 13 buyers, active partnership with Apex (no prices shared), 2 registrations
  (rejected with reason, submitted).
- **Internal** — 6 fictional prospects across stages (one lost with reason) owned by the internal sales executive and
  manager, with activities; 3 support cases from the three customers (open, in progress with an internal note,
  resolved).
- Every name carries "(Demo)" or "Demo"; phone numbers are in a fictional `+91 90000 xxxxx` range; e-mail addresses
  are on `example.test`, which cannot receive mail. Each workspace shows a "DEMO workspace" banner.

## 6. Journeys to walk through

1. **Developer**: builder.admin → share Tower B with Growth (availability only), review Prime's pending
   registration → builder.manager → reassign an overdue follow-up, check the visits calendar → builder.sales → log a
   call on an assigned lead, complete a task, confirm unassigned and colleagues' leads are not listed.
2. **Channel partner**: partner.admin → see Apex Heights inventory with prices → partner.manager → register a buyer
   → partner.sales → see only own leads.
3. **Agency**: agency.admin → Apex Heights inventory without prices; try opening Prime's or Apex's URLs (refused).
4. **Internal**: superadmin → organisations, staff list → sales → own prospects only, no customer CRM → support →
   answer the open case → finance → payments console (trial orgs, nothing to collect) → auditor → read-only everywhere.

## 7. Forbidden actions that must fail

- Any customer account opening another organisation's URL, or `/platform`.
- An agency seeing another agency's leads or registrations; a developer opening an agency's buyer list.
- A sales executive opening team, settings, billing or audit log.
- Internal staff opening a customer workspace or a console section outside their role.
- The seed against production, an unmarked database, or without `--confirm`.
