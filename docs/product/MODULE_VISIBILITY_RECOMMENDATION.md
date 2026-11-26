# Letting customers hide modules (Task #53) — recommendation

**Status:** recommendation for the owner's decision. Nothing here is built yet.

## Where we are today

- `lib/auth/entitlements.ts` holds five **plan modules** (sales, inventory, routing, integrations, analytics) in
  `org_module_entitlements`. Only RE staff change them, from the Platform console, because they follow the
  customer's plan and billing.
- When a module is off, the server refuses its API routes (`requireModule` returns 403 with
  `MODULE_DISABLED`) and the navigation drops its pages (`MODULE_OF_SEGMENT`). `tests/entitlements-guard.test.mjs`
  checks every module route does this.
- The layout also hides navigation for features a workspace has switched off in its own settings (for example
  *Teams* when team structure is off, 20260097/#121). That is the pattern the recommendation builds on.

The ask: a customer (owner or admin) wants to switch off parts of RE they do not use, so their team sees a
simpler app, without changing what they pay for.

## Recommendation

**Add a customer-controlled "Show in the app" layer that is separate from plan entitlements.**

- Stored in the organisation's settings (e.g. `org_settings.ui.hiddenModules: ModuleKey[]`, plus a few
  finer-grained switches such as *Rewards*, *Activity feed*, *Partners*). No new table.
- Set by the **owner or admin** in *Settings → Workspace → Modules*, with a short note on what each switch hides.
  Every change is written to the audit log.
- **Effect: navigation, dashboard cards, command palette, quick actions and notification links disappear.** Data,
  automations (routing, SLA, reminders, cron jobs) and integrations keep running, so switching a module back on
  restores everything exactly as it was.
- **APIs stay open** for hidden (but paid-for) modules. Visiting a hidden page directly shows a friendly
  "This is hidden in your workspace — ask an admin to show it" screen with a button for admins, rather than a 404.
- **Plan entitlements still win:** a module the plan does not include is off regardless of this setting, and the
  Modules screen shows it as "Not in your plan" (not a switch).
- **Phase 2 (only if customers ask):** per-role visibility — e.g. hide *Inventory* from telecallers only — as a
  role × module grid on the same screen, reusing `lib/auth/permissions.ts` roles.

Why: it gives customers the simpler app they want with the least risk. It is fully reversible, cannot lose data,
cannot break integrations that feed leads in, and keeps billing (entitlements) and preference (visibility) from
being confused with each other.

## Options considered

| Option | What it does | Pros | Cons |
| --- | --- | --- | --- |
| **A. Hide in the app (recommended)** | Navigation and entry points disappear; APIs and automations unchanged | Simple, reversible, no data risk; leads keep flowing; small build (settings + layout + one guard page); easy to explain | Not a security boundary — a user who knows a URL or API can still use a hidden module (acceptable: it is a preference, and permissions still apply) |
| **B. Hide and block** | As A, plus `requireModule`-style 403 on the module's APIs | Hidden really means off; matches what some admins expect | Hiding Inventory or Integrations could silently stop bookings, webhooks or routing that other modules depend on; much more testing (every cross-module call); support tickets when "something stopped working" |
| **C. Per-role visibility** | Each module shown or hidden per role | Fits real teams (field sales vs telecallers vs finance) | More UI and more combinations to test; duplicates part of what role permissions already do; better as a phase 2 on top of A |
| **D. Reuse plan entitlements** | Let customers flip `org_module_entitlements` themselves | Almost no new code | Mixes billing with preference: a customer could switch on a module they have not paid for, and the Platform console loses the source of truth for plans. **Not recommended.** |

## If approved — build outline (about 1–2 days)

1. `lib/settings/visibility.ts`: `VISIBLE_KEYS`, `resolveVisibility(plan, prefs)` (plan off ⇒ off; else pref).
2. Settings screen with switches (owner/admin only, server-checked), audited change, optimistic UI.
3. Layout: merge hidden keys into `navDisabled`; dashboard, command palette and notification links read the same
   resolver.
4. Hidden-page screen for direct visits.
5. Tests: resolver unit tests; a guard test that every nav item has a visibility key; a check that hiding a module
   never touches its API routes (so leads keep flowing).

## Decision needed from the owner

- Approve option A (and whether phase 2 per-role visibility is wanted now or later).
- Confirm who may change it: owner and admin (recommended) or owner only.
