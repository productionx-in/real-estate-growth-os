# REGrow — Controlled Branding Migration Plan (Production X → REGrow by INFYN Group)

**Status:** Proposal only — nothing renamed yet · **Scope:** `real-estate-growth-os` repository only (Core-Skills is out of scope by founder instruction)
**Inventory date:** 2026-11-16, `main` @ 6aa536e · ~200 occurrences of "Production X / ProductionX / productionx".

## 1. Classified inventory
| Class | Examples (file) | Risk if renamed blindly | Plan |
|---|---|---|---|
| A. User-visible UI copy | `components/integrations/MetaConnectWizardModal.tsx`, `IntegrationCentreView.tsx`, `ConnectionDetailsModal.tsx`, `PortalIntegrationModal.tsx`, `components/auth/LoginForm.tsx`, `components/team/SubscriptionSeatMeter.tsx`, `app/(dashboard)/admin/provision/page.tsx`, API error strings in `app/api/orgs/route.ts`, `app/api/integrations/*/oauth/start` | Low | Phase 1: centralise brand strings in one `lib/brand.ts` (`PRODUCT_NAME = 'REGrow'`, `COMPANY_NAME = 'INFYN Group'`), replace all |
| B. Customer emails | `lib/email/adapter.ts` (subject/body, From `Production X <noreply@productionx.ai>`) | Medium (deliverability, SPF/DKIM) | Phase 1 copy; From address changes only after REGrow domain email authentication is set up |
| C. Meta app–facing text | Meta wizard permission explanations | **Must match the Meta app name submitted for App Review** | Rename **before** App Review submission |
| D. Public integration contracts | Embed `#productionx-enquiry-form`, `data-productionx-form`, `initProductionXForms` (`app/forms/embed.js`, `lib/integrations/forms/generator.ts`); API key prefix `px_live_` (`lib/integrations/api-keys/auth.ts`); webhook headers `x-px-signature-256`, `x-px-timestamp`, `x-px-event`, UA `ProductionX-Webhooks/1.0`, default secret `px_wh_default_signing_secret` (`lib/integrations/outbound/*`); WhatsApp verify-token defaults (`app/api/webhooks/whatsapp/*`) | High once customers integrate — **today zero consumers** (prod: 0 API keys, 0 webhook subscriptions, 0 connected integrations) | Phase 2 now (cheapest moment): new names (`regrow-enquiry-form`, `rg_live_`, `x-regrow-*`, `REGrow-Webhooks/1.0`); embed script and API-key validator **accept both old and new** for one release; remove insecure default secret entirely (fail closed) |
| E. Hard-coded domains | `app.productionx.com`, `api.productionx.in`, `productionx.ai` — three inconsistent domains | Broken links / docs | Replace with `NEXT_PUBLIC_APP_URL` / `NEXT_PUBLIC_API_URL` env config; founders choose REGrow domains |
| F. Docs (~25 root `.md`) | `PROJECT_ROADMAP.md`, `PROJECT_STATUS.md`, security blueprints (9 versions) | None (historical) | Phase 3: move superseded docs to `docs/archive/` unchanged; new docs use REGrow |
| G. Code comments (~28), SQL comments, `supabase/config.toml` header | — | None | Phase 3 opportunistic |
| H. Test fixtures | `@productionx.test`, `@prod-x.test` | None | Leave (reserved test TLD); new tests use `@regrow.test` |
| I. Infrastructure names | GitHub org `productionx-in`, repo `real-estate-growth-os`, Vercel project `re_growth_os`, Supabase project `RE-Growth-OS` | High (CI, deploy hooks, OAuth redirect URIs) | Phase 4, separate change window; not required for launch |
| J. **Do NOT change** | Encryption key-derivation salt `growth-os-vault-salt` (`lib/integrations/crypto.ts`) | **Would make all stored secrets undecryptable** | Keep. It is already brand-neutral. |
| K. Historical | Commits, branches, migration file names, existing migration SQL comments | Rewriting history/migrations breaks environments | Never rewrite |

## 2. Phases
1. **Phase 1 — UI & email copy (low risk, before customer #1 go-live):** `lib/brand.ts`, replace classes A, B (copy), C.
2. **Phase 2 — Contracts (before first external integration):** class D with dual-acceptance; class E via env config.
3. **Phase 3 — Docs & comments:** archive old docs, update README to REGrow.
4. **Phase 4 — Infrastructure names:** only if founders want it; separate plan with redirect URIs and deploy hooks.

## 3. Acceptance checks
- `git grep -i "production[ _-]\?x\|productionx"` returns only classes F (archived), H, I, K and the documented compatibility aliases.
- Old embed snippets and `px_live_` keys still work during the compatibility window (tests prove it).
- Meta app name, WhatsApp display name, email From name all read "REGrow".

## 4. Decisions needed
REGrow production domains · email sending domain · whether infrastructure names (class I) change at all · length of compatibility window (proposal: 90 days).
