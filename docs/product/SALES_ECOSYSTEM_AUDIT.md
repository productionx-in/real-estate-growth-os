# Sales performance ecosystem — audit and plan

> **Status (stages A–E built):** Teams nav (A), shared deal credit 20260098 (B), weekly challenges, monthly
> achievements and trophies 20260099 (C), Rewards 20260100 (D), Activity feed 20260101 (E). Remaining: the global UI
> items in §8 (shared table, dialog migration, chart frame).

Audit of the request for teams, targets, shared deal credit, gamification, rewards, an activity feed, CRM
integration, global UI, and security. Written before building anything, so each stage extends what exists
instead of adding a second system.

**Rule for every stage:** all performance figures come from one ledger, `performance_events` (20260094).
Every row is written by a database trigger from a real CRM record (lead, booking, follow-up, visit) and
carries a `dedupe_key` that is unique per workspace. Points, rankings, targets, achievements and rewards
are all read from it, so nothing is counted twice and nothing can be typed in by hand.

## 1. Owner and team structure

| Requirement | State | Where |
| --- | --- | --- |
| Owner manages by default; optional "owner also sells" | Done | 20260096, Settings → Sales structure |
| Teams, leaders, members, projects | Done | 20260097, `/teams` |
| Team-specific targets | Done | `performance_targets.scope = 'team'`, Performance → Manage |
| Teams item in the sidebar | **Added in Stage A** | `lib/navigation/nav.ts`; hidden while team structure is off |
| Role-based permissions | Done | `TEAM_MANAGERS`, `watchesTeam`, the API routes and RLS |

## 2. Targets and performance

| Requirement | State |
| --- | --- |
| Organisation, team and individual targets | Done (`everyone` / `team` / `member`) |
| Daily, weekly, monthly, custom | Done |
| Leads assigned and contacted, follow-ups, meetings, deals, revenue | Done (`gam_metric`) |
| Individual and team dashboards with progress | Done (`/performance`, `/performance/team`) |
| History of target changes | Done (`performance_target_history`) |

## 3. Shared deal credit — Stage B (built)

Today a booked deal credits 100% to the lead's assignee (`perf_from_lead`), and revenue credits the
closer (the bookings trigger). Stage B adds:

- `deal_credit_splits`: who else shares one closed lead, and each share (1–99%). The closer always holds
  the remainder, so the total is exactly 100%. The share is checked by the database, not the app.
- Ledger column `credit NUMERIC(5,4)`: 1.0 for the closer's own close. A split writes balancing
  adjustment rows, keyed by split version, so personal "deals" become fractional credit while the number
  of **actual deals** (distinct leads closed) is counted separately and never changes.
- Revenue and the deal's points are split in the same proportion.
- Owners, admins, managers, and the closer's team leader manage the splits. Every change goes into the
  audit log and a split history table.
- Un-booking a deal reverses everyone's share.

## 4. Gamification and leaderboards

| Requirement | State |
| --- | --- |
| XP, levels, badges | Done |
| Daily missions | Done |
| Weekly and monthly achievements | Engine done (`window_kind` week/month); custom achievements are in Manage |
| Weekly challenges, trophies for period winners | **Stage C** |
| People and Teams leaderboards; day, week, month and custom periods | Done |
| Conversion rate and target completion columns | **Stage C** |
| No duplicate achievements | Done (unique `achievement_unlocks` per window, `dedupe_key`) |

## 5. Rewards and incentives — Stage D (built)

New module `/rewards`:

- **Programmes:** gadget, travel, gift card or voucher, cash bonus, or custom. Each has a budget, an
  individual or team scope, eligibility (roles or teams), a goal (target metric and amount, or top N on
  a leaderboard), and a deadline.
- **Progress** comes from the ledger.
- **Winners** are found by the server. Each person or team can win a given programme only once
  (unique key).
- **Claims:** pending → approved / rejected → fulfilled → redeemed. Every step is audited.

## 6. Activity feed — Stage E (built)

The feed is built from what already happened, so there is no second source of truth: closed deals,
achievement unlocks, targets hit, and team milestones. It adds:

- optional reactions (one per person per item);
- an admin setting for who sees the feed, and whether deal values are shown.

## 7. CRM integration

Closing a deal already updates the ledger, points, achievements, targets and notifications in one
transaction. Stage B adds credit allocation, Stage D reward progress, and Stage E the feed item. All of
them use the same trigger path and dedupe keys.

## 8. Global UI

The shared design language (v3), the controls, toasts and Sheet are done. Still to do (task 74, Stage F):

- a shared table component;
- moving the remaining hand-built modals to Dialog or Sheet;
- a common chart frame.

## 9. Security and accuracy

Each stage brings:

- RLS on new tables, with no client grants (every read goes through the server);
- server-side role checks;
- audit-log entries;
- cross-tenant tests against a real database;
- history kept: append-only ledger rows, with no updates or deletes of earned credit.
