# REGrow — working rules

REGrow (by INFYN Group) is a multi-tenant lead-management SaaS for real-estate developers and channel
partners. Next.js 16 App Router + React 19 + Tailwind v4 + Supabase (Postgres, Auth, pg_cron). Keep this
file short — it loads every session.

## Shared standards: Core-Skills

Engineering and design standards live in `productionx-in/Core-Skills`, published as a plugin
marketplace. Attaching that repository does **not** activate its skills; install the plugins:

- `design` — `design-system` (token architecture), `ui-ux-pro-max` (UX rules, accessibility checklist),
  `ui-styling` (shadcn/ui on Radix + Tailwind)
- `backend` — `api-design`, `backend-patterns`, `postgres-patterns`, `database-migrations`
- `toolkit` — `webapp-testing` (Playwright)

Invoke by name when the task is known (`/ui-ux-pro-max`, `/postgres-patterns`). Do not use the
`ui-ux-pro-max` generator's "real estate" font suggestions for the app — REGrow is an operational CRM.

## Non-negotiables

- **Merging to `main` deploys to production and applies migrations to the production database.**
  No merge, deploy or production migration without the owner's explicit approval. Check production
  read-only before and after every migration.
- Every protected operation is authorised on the server (`lib/auth/tenant.ts`, `lib/auth/permissions.ts`,
  `lib/auth/platform.ts`). The UI only hides what the server already refuses.
- Every query is scoped by organisation. New tables: RLS on, explicit grants, cross-tenant negative tests.
- Internal (platform) staff never read customer business data or secrets; access to customer data only
  through an audited, time-limited support grant. No impersonation.
- Leads live in `public.leads_all`; `public.leads` is a `security_invoker` view of non-archived rows
  (20260073). New lead columns: alter `leads_all`, then recreate the view. Deleting a lead archives it (30 days).
- Post-sign-in redirects go through `safeRedirectPath` (`lib/auth/safe-redirect.ts`).
- Passwords follow `lib/auth/password-policy.ts`.
- UI: build from `components/ui` and semantic tokens (`bg-surface`, `text-muted`, `text-danger`…) in
  `app/globals.css`; no raw palette classes (`bg-blue-600`). `tests/design-tokens.test.mjs` enforces it.
  Gallery: `/dev/ui` (not in production).

## Tests

- `npm test` — unit and module tests (Node 20 in CI).
- `tests/db-integration/*` — real database: `npx supabase@2.122.1 start`, then run with
  `NEXT_PUBLIC_SUPABASE_URL` and `SUPABASE_SERVICE_ROLE_KEY` from `npx supabase status -o env`.
- CI: `.github/workflows/phase1-database-validation.yml` (clean reset of every migration, then all suites).
- Tests import real code via `jiti`; never weaken an assertion to get green.
