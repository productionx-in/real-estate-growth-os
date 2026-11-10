# Real Estate Growth OS

Production X — B2B SaaS platform for real estate marketing, CRM and sales management.

## Stack

- **Framework**: Next.js 16 (App Router)
- **Language**: TypeScript (strict)
- **Styling**: Tailwind CSS v4
- **UI**: shadcn/ui primitives
- **Database**: Supabase PostgreSQL with RLS
- **Auth**: Supabase Auth
- **Deployment**: Vercel

## Getting started

### 1. Clone and install

```bash
git clone <repo>
cd real-estate-growth-os
npm install
```

### 2. Configure environment

```bash
cp .env.example .env.local
# Fill in your Supabase project URL and keys
```

### 3. Set up Supabase

1. Create a Supabase project at [supabase.com](https://supabase.com)
2. Run migrations in order from `supabase/migrations/`
3. Register the JWT hook:
   - Supabase Dashboard → Authentication → Hooks
   - Add hook: **Customize Access Token (JWT)**
   - Select function: `public.custom_access_token_hook`
4. Configure Auth settings:
   - Site URL: `http://localhost:3000`
   - Redirect URLs: `http://localhost:3000/auth/callback`

### 4. Run locally

```bash
npm run dev
```

## Architecture

See `architecture-proposal.md` for the full architecture document.

## Sprint 01 Milestones

| # | Milestone | Status |
|---|-----------|--------|
| M1 | Project Scaffold & CI/CD | ✅ Done |
| M2 | Auth & Org Registration | 🔄 In progress |
| M3 | DB Migrations & RLS | 🔄 In progress |
| M4 | Project Management | ⏳ Pending |
| M5 | Lead Management | ⏳ Pending |
| M6 | Lead Assignment | ⏳ Pending |
| M7 | Salesperson Dashboard | ⏳ Pending |
| M8 | CSV Import & Export | ⏳ Pending |

## Folder structure

```
app/           Next.js App Router pages and API routes
components/    Reusable React components (by domain)
lib/           Supabase clients, DAL, utils, validations
types/         TypeScript type definitions
supabase/      Database migrations and seed data
middleware.ts  Auth + tenant routing guard
```

## Environment variables

| Variable | Required | Description |
|---|---|---|
| `NEXT_PUBLIC_SUPABASE_URL` | ✅ | Supabase project URL |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | ✅ | Supabase anon/public key |
| `SUPABASE_SERVICE_ROLE_KEY` | ✅ | Server-only service role key |
| `NEXT_PUBLIC_APP_URL` | ✅ | App base URL |

> ⚠️ Never prefix `SUPABASE_SERVICE_ROLE_KEY` with `NEXT_PUBLIC_`
