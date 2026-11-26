# Channel partner network — design for approval

Status: **proposal**, nothing built. Roadmap item: Module 8 of the product brief.

## The problem

Developers and agencies both use RE by PX, but as unconnected workspaces:

- A developer keeps "channel partners" as **records inside its own workspace** (`channel_partners`: firm,
  RERA, PAN, bank details, default commission). Deals, bookings and commissions point at those records.
- An agency has its **own workspace** (type `channel_partner`) with its own buyers and team.
- Nothing links the two. An agency cannot see a developer's projects, cannot register a buyer with
  the developer, and cannot see what it is owed. Production has 0 partner records, 0 deals, 0 bookings, so
  this can be designed cleanly with nothing to migrate.

## Rules (from the brief, made precise)

1. Two independent organisations. Neither becomes part of the other.
2. **An agency's buyers stay the agency's.** The developer never sees the agency's lead list.
3. A buyer's details cross to the developer **only when the agency registers that buyer** for a
   project — an explicit, per-buyer, audited act.
4. The developer chooses **which projects** an agency sees, and how much inventory detail.
5. Who registered a buyer first, and until when they are protected, is **decided by the server**
   and visible to both sides.
6. Commission terms and amounts are agreed per partnership and visible to both sides.
7. Every cross-organisation action is in **both** organisations' audit logs.

## What gets built (new tables; RLS on; written only through server functions)

| Concept | Table | Key fields |
| --- | --- | --- |
| Partnership | `org_partnerships` | developer org, agency org, status (`invited → active → paused / ended`), protection days (default 60), linked `channel_partners` record (the developer's commercial profile of the agency) |
| Shared projects | `partnership_projects` | partnership, project, inventory visibility: `none` / `availability` / `availability_and_price` |
| Buyer registration | `deal_registrations` | partnership, project, the agency's own lead id (stays in the agency), buyer name, phone, note, status (`submitted → accepted / rejected → visited → booked`, or `expired` / `withdrawn`), `protected_until`, developer lead id once accepted |

How a partnership starts: the developer's admin enters the agency's **partner code**, shown in the
agency's settings. The agency's admin accepts. Either side can pause or end it. Ending it keeps the
history; it never deletes registrations.

## The flow

1. **Agency** opens one of its leads → **Register with developer** → picks a partner developer and a shared project.
2. **Server checks for conflicts** on the developer's side, using the buyer's phone:
   - an existing developer lead for that phone, or
   - an active registration from another agency.

   The agency only learns "already registered — protected until DATE". It is never told by whom, and
   never sees the developer's data.
3. **Developer** sees the registration in a queue and accepts it or rejects it with a reason. Acceptance
   creates a lead in the developer's workspace (source = channel partner, linked to the registration)
   and starts protection.
4. **Both sides** see the status move as the developer works the lead: visit done, booked. The agency sees
   the **status only**, not the developer's notes or calls.
5. **On booking**, the developer's existing commission record is attributed to the partnership. The agency
   sees its commission lines (amount, status, paid) read-only.
6. **Protection** expires automatically after the window unless a visit or booking happened. A daily job
   handles this.

## What each side sees

| | Developer sees | Agency sees |
| --- | --- | --- |
| Agency's buyer list | **Never** | Everything (it's theirs) |
| A registered buyer | Name, phone, note — from registration | Status, protection date |
| Developer's leads, notes, calls | Everything (it's theirs) | **Never** |
| Shared projects | — | Project details; inventory only at the level granted |
| Commission | Everything | Its own lines, read-only |

## Security

- New tables have RLS enabled. All writes go through `SECURITY DEFINER` functions that only the server
  calls. Each function checks: active partnership, the caller's role in their own organisation, and that
  the project is shared.
- Cross-organisation tests: one agency against another; a non-partner developer; a paused partnership;
  an ended partnership; and the agency trying to read developer leads (and the reverse).
- Phone conflict checks compare normalised numbers on the server. The other side's data is never returned.

## Delivery in two PRs

- **A (about 1 week):**
  - partnerships, partner code, shared projects;
  - registrations with conflict checks, acceptance and rejection, the protection window;
  - both sides' screens and the audit log.
- **B (about 3–4 days):**
  - status sync (visit, booking);
  - commission visibility for the agency;
  - shared inventory views, the expiry job, notifications.

## Decisions (approved by the owner, 2026-11-18)

1. **Protection window**: 60 calendar days from the developer's acceptance; each partnership can change it (1–365).
2. **Who registers buyers**: agency owners, admins and managers. Ordinary agents cannot.
3. **Buyer phone**: the developer sees it once a registration is submitted.
4. **Inventory default** for a newly shared project: availability without prices.
5. **Commission visibility**: only after the developer approves it (PR 2).
6. **Consent**: before submitting, the agency user confirms the agency is authorised to share that buyer's
   details with that developer for the registration. The submitting user, the time and the confirmation (with
   the wording version, `cp-share-v1`) are stored on the registration.

Clarifications given during implementation:

- **Conflict scope**: the whole developer, matched on the normalised phone number (`normalize_phone_in`, E.164).
  One live claim per buyer per developer, whichever project.
- **Developer leads that block a registration**: open or booked leads only (not lost, junk or merged).
- **Pending registrations block others**: yes — the first submitted claim wins.
- **Lifecycle**: either side can pause (no new registrations; the developer can still review pending ones;
  protections keep running; only the side that paused can resume). Either side can end, permanently: pending
  registrations are withdrawn, sharing stops, accepted protections run to their dates, and partnering again
  needs a new request.

## As built in PR 1 (migration 20260058)

- Tables `org_partnerships`, `partnership_projects`, `deal_registrations`, `partner_events` and
  `organisations.partner_code`. RLS on, no client policies, no grants to `anon`/`authenticated`: browsers cannot
  read or write them. Every write is a `SECURITY DEFINER` function callable only by the service role, called by
  the API after `authorizeOrgAccess` / `authorizeLeadAccess`; each function re-checks the actor's membership and
  role, the partnership's sides and state, the share and the lead's ownership.
- **Concurrency**: submission and review take a transaction-scoped advisory lock on (developer, normalised phone),
  then check and insert inside it; a partial unique index (one `submitted`/`accepted` registration per developer
  and phone) backs it up. Expired protections are closed inside the same lock, so no job is needed for correctness.
- **Audit**: every cross-organisation change writes one `partner_events` row (append-only) and an
  `org_audit_logs` row in **both** organisations in the same transaction. The other organisation's entry names the
  acting organisation, never a person from outside it, and no entry carries buyer details.
- **Identity matching**: normalised phone only (email is optional and unreliable for buyers). Two leads with
  different numbers for the same person are not detected; a developer can still reject a registration.
- **Accepted registrations** create a separate developer lead (`source = referral`, `source_platform =
  channel_partner`, `custom_fields.partner_registration_id`). The agency's lead is untouched. Acceptance is
  refused if the developer has meanwhile got its own open lead for that phone (it rejects the registration
  instead), so there is never a second developer record.
