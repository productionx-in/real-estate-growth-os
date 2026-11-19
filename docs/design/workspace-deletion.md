# Workspace archive, deletion and recovery — audit and design (for approval)

Status: proposal, updated 19 Nov 2026 with the owner's principles. Nothing implemented. **Permanent deletion will
not be built until this design and the retention policy are approved; expired trial workspaces are not purged
automatically.** Implementation is its own branch/PR, separate from the website, partner network, sign-up and portal work.

Owner's principles (19 Nov): archive separate from deletion; owner-only request with fresh authentication and workspace-name
confirmation; all owners notified; any owner can cancel during 14 days; safe export before deletion; partner-owned buyer
registrations, financial records and audit history protected; resumable, idempotent, fully audited; concurrent last-owner
and ownership-transfer problems fixed; staff deletion restricted and audited.

## 1. Audit — what exists today (verified in code and in the database schema)

| Area | Today | Risk |
|---|---|---|
| Delete workspace | **No feature.** No API, no UI. | — |
| Archive / deactivate | `set_organisation_lifecycle()` (migration 20260044): `active → grace → suspended → deactivated`, reversible, audited; REGrow super admins only (`/api/admin/organisations/[orgId]/lifecycle`). Customers cannot archive. | Owners have no self-service archive |
| What a raw `DELETE FROM organisations` would do | **Blocked** by RESTRICT FKs on `leads`, `projects`, `org_members`, `inventory_items`, `inventory_status_history`, `project_hierarchy_nodes` — and by the immutable trigger on `org_audit_logs`. If those were cleared first, **CASCADE** FKs would silently delete: invoices and payments (`org_subscription_invoices`, `org_subscription_payments` — legally retained records), bookings, deals, commissions, **both sides' copies of buyer registrations** (`deal_registrations` cascades on `agency_org_id` *and* `developer_org_id`), partnerships, site visits, documents, WhatsApp history. | A manual delete by staff (or a future careless function) would destroy legal records and the *other* organisation's partner records. Fix the FKs before building deletion. |
| Users | `profiles` are shared across organisations; RESTRICT from `lead_activities.actor_id`, `lead_assignments`, `org_invitations.invited_by`, `org_members`. | Deleting a person must never be part of deleting an organisation. |
| Ownership | Owners can make another member an owner; the last active owner cannot be demoted or deactivated (`lib/dal/invitations.ts`). No one can change their own role. | Check-then-update, not atomic: two owners demoting each other at the same moment could leave none. No "leave workspace" action. |
| Subscriptions | One per organisation; trial/paid periods enforced (migration 20260059); `cancel_at_period_end` column exists but no customer action uses it. | Deletion must go through billing, not around it. |
| Partner network | Partnerships can be ended (pending registrations withdrawn, accepted protections continue). | Ending must happen before an organisation disappears. |
| Sessions | `revoke_user_sessions()` exists (migration 20260044). | Reusable. |
| Storage | No storage buckets in use; documents are database rows. | Simpler purge. |

## 2. Design

### 2.1 Three separate actions

| Action | Who | Reversible | Effect |
|---|---|---|---|
| **Archive** (deactivate) | Owner (new), REGrow super admin (existing) | Yes, by an owner within the retention window, or by REGrow | Nobody can sign in to the workspace; data kept; billing stops at period end; public surfaces (microsites, forms, webhooks) paused |
| **Request deletion** | Owner only | Yes, during the pending period (default **14 days**, configurable per environment) | Workspace becomes read-only (export allowed); all owners and admins notified; cancellable |
| **Purge** | System job after the pending period | No (except restore from backup, see 2.8) | Business data erased; legally retained records kept under restriction; organisation becomes a tombstone |

Admins and ordinary members can do none of these. A REGrow staff deletion exists only for legal/abuse cases (2.7).

### 2.2 Request flow (owner)

1. Owner opens **Settings → Delete workspace**. The server builds an **impact summary**: members (and how many
   belong to no other workspace), leads, projects, units, site visits, bookings, documents, partnerships and buyer
   registrations (by status), subscription and period end, unpaid invoices, connected integrations and API keys.
2. **Blockers** (deletion cannot be requested until resolved):
   - unpaid issued invoices (pay, or REGrow finance voids them);
   - bookings or commissions with money still due between parties (once commissions exist, PR 2);
   - an active legal hold set by REGrow.
3. **Warnings** (shown, must be acknowledged): active paid period is not refunded (per Terms) and the subscription is
   set to cancel; active partnerships will be **ended** (partners keep their records, pending registrations are
   withdrawn); integrations will be disconnected; members with no other workspace will lose their only workspace.
4. **Fresh authentication**: the owner re-enters their password (or completes MFA) — the server requires a
   re-authentication within the last 5 minutes — and **types the workspace name**.
5. `request_organisation_deletion(org, actor)` — one transaction: re-checks owner role and blockers under a lock on
   the organisation; creates the request (`scheduled_for = now() + grace`); puts the workspace read-only (existing
   suspension mechanism, marked as a deletion hold); sets the subscription to cancel; records the request in the
   organisation's audit log; emails every owner and admin with the date and a cancel link. Idempotent: a second
   request returns the existing one.
6. **Cancel**: any owner, during the pending period → read-only lifted, subscription cancellation reverted if the period
   has not ended, audited, everyone notified.

### 2.3 Purge (after the pending period)

A scheduled job picks due requests (`FOR UPDATE SKIP LOCKED`) and runs `purge_organisation(request)` in **checkpointed
steps**, each its own transaction, each idempotent, each recorded on the request (`step`, `attempts`, `last_error`).
A failure stops at that step and retries; it never leaves another organisation affected.

1. **Re-check** blockers; if any appeared, mark the request `blocked` and notify (no purge).
2. **Cut access**: end partnerships via `partner_set_status('end')` (partners are notified through the existing audit),
   revoke invitations, revoke API keys and webhook subscriptions, disconnect integrations and wipe their tokens,
   unpublish microsites, cancel scheduled jobs and notifications, delete memberships, revoke sessions of users who no
   longer belong to any workspace.
3. **Preserve the other side**: buyer registrations and partnership history stay with the surviving partner, with
   the deleted side shown as "Deleted agency/developer" (requires the FK change in 2.5).
4. **Erase business data** in dependency order, in batches, always `WHERE org_id = <target>`: leads and their
   activities/tasks/assignments/documents, site visits, bookings, deals, inventory and projects, WhatsApp history,
   automation, saved views, routing, integration logs, notifications.
5. **Retain under restriction** (see 2.6): invoices, payments, the subscription record, the organisation's audit log
   and lifecycle events, the deletion request itself, and the organisation row as a **tombstone** (legal name, GSTIN if
   any, created/deleted dates; everything else cleared; `lifecycle_state = 'deleted'`, slug released).
6. Mark `completed`; record in the platform audit log.

### 2.4 Tenant isolation guarantees

- Every function takes the organisation from the server-authorised request, never from the browser, and every
  statement is scoped `WHERE org_id = $target`; no statement touches another organisation's rows.
- Deleting organisation A never deletes a user, a membership in B, or B's records — even when one person owns both.
- Real-database tests (to be written with the implementation): one owner of A and B deletes A → B untouched (rows
  counted before/after); a developer deletes → agency keeps its registrations and vice versa; partial failure
  mid-purge → retry completes, nothing outside A changed; a member/admin cannot request; a stale session without
  re-authentication cannot request; a second request is idempotent; cancel restores access.

### 2.5 Schema changes needed first (safe on their own)

- `deal_registrations.agency_org_id` / `developer_org_id`, `org_partnerships.*_org_id`: CASCADE → **SET NULL** (columns
  nullable) plus a stored display name of the other side, so a partner's deletion never removes your records.
- `org_subscription_invoices.org_id`, `org_subscription_payments.org_id`, `org_subscriptions.org_id`: CASCADE →
  **RESTRICT** (legal records can never be removed by cascade).
- `organisations.lifecycle_state` gains `deletion_pending` and `deleted`; new tables
  `organisation_deletion_requests` and `legal_holds`; atomic `transfer_ownership()` and `leave_organisation()`.

### 2.6 Retention policy (to confirm with your accountant/lawyer)

| Record | Kept | Why | Access |
|---|---|---|---|
| Invoices, payments, subscription history | 8 years from the end of the financial year | GST (CGST Act s.36) and Companies Act books of account | REGrow finance only |
| Organisation audit log, lifecycle events, deletion request | 8 years (same period, so the trail of who deleted what survives) | Accountability, disputes | REGrow super admin / auditor only |
| Tombstone (legal name, GSTIN, dates) | With the invoices | Invoices must identify the customer | Finance |
| Everything else | Erased at purge | DPDP Act: erase when the purpose ends | — |
| Backups | Roll off on the provider's backup cycle | — | — |

### 2.7 REGrow staff deletion

Super admin only, MFA (AAL2), a written reason and a reference (customer's written request, court/legal order, abuse
case); same pending period unless a legal order requires immediate action; recorded in the platform audit log and the
customer's audit log; cannot override invoices or legal holds. No other staff role can delete.

### 2.8 Backups and recovery

- During the pending period: cancel restores everything instantly.
- After purge: data exists only in backups until they expire (Supabase backup retention depends on the plan — confirm
  the current setting). A restore from backup is a staff-only operation; after any restore, the deletion log is
  re-applied so purged organisations do not come back.
- Export: owners can download their data (leads, projects, inventory, site visits) before and during the pending period.

### 2.9 Leaving, transferring ownership, cancelling

- **Leave workspace** (new): any member can leave; the last active owner cannot until another owner exists.
- **Transfer ownership** (made atomic): promote another active member to owner, then step down — in one function, under
  a lock, so a workspace can never end with no owner.
- **Cancel subscription without deleting**: owner sets cancel-at-period-end; at period end the workspace becomes
  read-only (existing rule); it can be archived or deleted later.
- **Active subscription + deletion**: allowed; the subscription is set to cancel; prepaid time is not refunded unless
  agreed (per Terms); unpaid invoices block the request.

## 3. Risks

- **Today**: the CASCADE foreign keys mean a manual `DELETE` by staff could erase legal records and partners' records.
  The schema change in 2.5 should go in first, even before the feature.
- Large workspaces: purge must be batched to avoid long locks; checkpointing handles timeouts.
- Backups: erasure is not immediate in backups; the Privacy Policy already says so.
- Retention periods are a legal decision; the table above is a proposal.

## 4. Delivery plan (each step separately approved)

### Step A — safety migration (proposed first; no visible change)
Affected tables and the change:

| Table.column | Today | Proposed | Why |
|---|---|---|---|
| `deal_registrations.agency_org_id`, `.developer_org_id` | NOT NULL, ON DELETE CASCADE | nullable, ON DELETE SET NULL, plus `agency_name_snapshot` / `developer_name_snapshot` (backfilled) | The surviving partner keeps its registrations |
| `org_partnerships.developer_org_id`, `.agency_org_id` | CASCADE | nullable, SET NULL, name snapshots | Partnership history survives |
| `org_subscription_invoices`, `org_subscription_payments`, `org_subscriptions`, `org_subscription_seat_purchases` `.org_id` | CASCADE | RESTRICT | Financial records can never disappear by cascade |
| `org_audit_logs`, `organisation_state_events`, `support_access_grants` `.org_id` | CASCADE (blocked in practice by immutability triggers) | RESTRICT | Make the intent explicit |
| `bookings`, `deals`, `channel_partner_commissions` `.org_id` | CASCADE | RESTRICT | Money-related records are removed only by the explicit purge, per the retention policy |
| new trigger on `org_members` | last-owner check in application code only | `ensure_active_owner` trigger: locks the organisation row and refuses any change leaving zero active owners | Fixes the concurrent last-owner race at the database level |
| new functions | — | `transfer_ownership(org, from, to)`, `leave_organisation(org, actor)` (atomic, audited) | Safe transfer and leaving |

RLS/security: no new client access; partner DAL shows "Deleted agency/developer" from the snapshot when the other side is
null; functions are service-role only and re-check roles. Tests (real database): a raw `DELETE` of an organisation with
invoices fails; a partner's deletion leaves the other side's registrations with the snapshot name; two owners demoting each
other concurrently leaves one owner; transfer and leave are atomic and audited. Rollback: re-create the original foreign keys
(no data changes are made by this step except the backfilled name snapshots, which can stay).

### Step B — archive, leave, transfer, export (no deletion)
Owner archive/unarchive (reusing the lifecycle function), Leave workspace, atomic ownership transfer, and a **workspace
export**: owners/admins request a ZIP of CSV files (leads with activities, site visits, projects, inventory, documents
metadata, their side of buyer registrations) built by a background job, downloadable for 7 days, audited.

### Step C — deletion request and cancellation (no purge)
Request with re-authentication and typed name, impact summary, blockers, 14-day pending state, notifications, cancel.

### Step D — purge (only after you approve this design and the retention policy)
Checkpointed purge job, tombstone, retained records, platform audit.

## 5. Decisions needed

1. Pending period: 14 days (configurable) — confirm.
2. During the pending period: read-only with export (proposed) or fully usable?
3. Can any owner request deletion, or must every owner confirm when there are several? (Proposed: any owner requests,
   all owners notified, any owner can cancel.)
4. Retention periods in 2.6 — confirm with your accountant.
5. Expired, unpaid trial workspaces: **no automatic purge** (your instruction) until retention and recovery rules are agreed.
6. Approve Step A (safety migration) to be implemented first.
