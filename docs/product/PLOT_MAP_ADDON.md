# Interactive Plot Map add-on — architecture report and delivery plan

Status: proposal and the first PR (project-level activation). Each PR is reviewable on its own. Nothing is merged,
deployed or applied to production without the owner's explicit approval.

## 1. What already exists (audited)

| Area | Where | What it does today |
|---|---|---|
| Add-on switch | `org_addons` (20260072), `lib/plots/addons.ts` | One on/off flag per **workspace**, set by a Platform Owner (MFA, audited) in the org console page. |
| Map storage | `plot_layouts`, `plot_layout_links` (20260072), `lib/dal/plot-layouts.ts` | A layout per project phase. It is uploaded as **SVG**, parsed into plain geometry (`lib/plots/svg.ts`; the SVG itself is never stored), matched to units by number (`lib/plots/match.ts`), and published and shared by a 256-bit link. |
| Map UI | `components/plots/PlotMap.tsx`, `LayoutManager.tsx`, `/[org]/projects/[id]/map` | SVG map with status colours, search, status filters, zoom and pan (wheel, pinch, buttons), and a details panel (side panel, or bottom sheet on phones). |
| Public map | `/m/[token]` | Read-only. Shows only available / reserved / sold (`publicStatus`). Prices are hidden unless the developer chooses to show them. Enquiry via WhatsApp and call links. |
| Inventory | `inventory_items` (enum `inventory_status`: available, on_hold, booked, sold, blocked) | **The authoritative status.** |
| Holds | `inventory_items.held_until` + cron `regrow-release-expired-holds` (20260074) | Hold expiry releases the unit. |
| Blockings | `inventory_blockings` + `lib/dal/sales.ts` | A blocking sets the unit to `blocked`; expiry sets it back to `available`; conversion to a booking sets it to `booked`. |
| Bookings | `bookings` (status includes `cancelled`) + `lib/dal/sales.ts` | Creating a booking sets the unit to `booked`. |
| Public enquiry capture | `processInboundLead` (`lib/integrations/inbound.ts`), pattern in `app/api/microsites/[slug]/enquiry` | Server-resolved org/project, strict schema, honeypot, rate limits, dedupe. |
| Notifications / e-mail | `notifications` (20260039), `enqueue_customer_email` outbox (`lib/jobs/customer-emails.ts`) | In-app and queued e-mail with retry. |
| Staff access to customer data | `support_access_grants` (20260046) | Customer-approved, **read-only, max 24 h**, audited. |

Production (checked read-only, 2026-11-22): 0 add-on rows, 0 layouts, 0 links, no Storage buckets. Evolving these
tables changes no customer data.

### Gaps found

1. **The entitlement is per workspace**, but the brief requires per project with five states.
2. **Input is SVG only.** There is no PDF/PNG/JPG intake, no stored original, no page selection, rotation, renders or
   thumbnails, and no versions. Re-uploading overwrites the live map.
3. **There is no editor.** Shapes come only from the SVG, and there is no draft → review → approval → publish flow.
4. **The public map** has no enquiry form (WhatsApp/call only), no site-visit request, no embed and no JSON API.
5. **There is no setup tracking** (stages, estimates, operations queue).
6. **Booking and blocking cancellation have no workflow.** Nothing in the app cancels a booking or a blocking, so
   nothing sets the unit back to `available` when one is cancelled. The map must not invent this rule. It reflects
   `inventory_items.status`, so this gap must be closed in the sales workflow (separate PR, listed below) and the map
   will follow automatically.
7. **Staff-assisted mapping conflicts with the access rules.** Support grants are read-only. RE staff drawing
   plots and linking inventory need write access to the customer's map. **Owner decision needed (§6).**

## 2. Principles

- **Inventory is the single source of truth.** A plot shape stores only geometry and a reference to an existing
  `inventory_items` row. There is no plot status, price, hold or booking stored on the map. Statuses are read live and
  mapped for buyers by `publicStatus`. Holds, blockings and bookings keep their existing rules and transactions.
- **Server-side entitlement.** `project_addon_state(project, 'plot_maps')` is checked by every API route and the
  public map, and by database triggers on every write that creates, changes, publishes or shares a map.
- **Tenant isolation.** Every row carries `org_id` and `project_id`. Database guards prove the project and unit
  belong to the same organisation. Tables are server-only (RLS on, no client grants), like the existing map tables.
- **Private originals.** Uploaded documents and renders live in a private Storage bucket. The public map gets only
  the rendered image of the **published** version, streamed by our route. The original PDF is never public.
- **Nothing is published without approval.** States are draft → in review → approved → published (previous version
  superseded). A new upload never touches the published version.

## 3. Data model (all additive)

| Table | Purpose | PR |
|---|---|---|
| `project_addons` | One row per project and add-on. `pending`, `active` or `suspended`, plus `valid_until`. **Expired** is derived (active and past `valid_until`); no row means **not purchased**. Fees and notes. | A |
| `project_addon_events` | Trigger-written history of every status, validity and terms change. | A |
| `plot_map_documents` | Original file (bucket path, MIME, bytes, SHA-256, page count, page sizes), processing status (`uploaded`, `processing`, `ready`, `failed` + error), uploaded_by. | B |
| `plot_map_versions` | Belongs to a `plot_layouts` row (the map / phase). References a document, page and rotation (0/90/180/270). Holds the rendered image and thumbnail paths, pixel size, render metadata (renderer, scale, DPI) and state (`draft`, `in_review`, `approved`, `published`, `superseded`, `rejected`). Records submitted/approved/published by and at. | B |
| `plot_map_shapes` | Per version: label (plot number), polygon in **normalised page coordinates** (0–1, rotation applied), `unit_id` → `inventory_items` (guarded: same org and project; unique per version), source (`manual` or `ocr`), confirmed flag. | C |
| `plot_map_reviews` | Per version: QA result, approval or rejection, with comment and actor. | D |
| `plot_map_setups`, `plot_map_setup_stages` | Setup tracking: one per project activation, eight stages. Per stage: started/completed timestamps, owner (`regrow` or `customer`), assignee, blocker, waiting-on-customer interval, evidence reference. | E |

`plot_layouts` stays as the map container: name, share link, show prices, and a new `published_version_id`. The SVG
path becomes an optional import format (an SVG becomes a version's shapes) and is no longer the only way in.

## 4. Processing pipeline (PR B)

1. **Upload** (owner, admin or manager; add-on active). Limits: 25 MB for PDF, 15 MB for PNG/JPG, 20 pages, 3 uploads
   per minute per user and 20 per project per day. The server checks the declared MIME type **and** the magic bytes
   (`%PDF-`, PNG signature, JPEG SOI), refuses encrypted or malformed PDFs, and stores the original in the private
   bucket under `org/<org>/project/<project>/documents/<id>/original.<ext>` with its SHA-256.
2. **Inspect.** For PDFs, page count and page sizes are read on the server with `pdfjs-dist` (legacy build; parsing
   only, no native canvas). Images: dimensions and EXIF orientation are read from the header.
3. **Choose a page and rotation** in the browser. Thumbnails of each page are rendered client-side with PDF.js.
4. **Render.** The selected page is rendered client-side with PDF.js at a fixed long edge (4096 px), plus a 512 px
   thumbnail. Both are uploaded, and the server re-validates them: PNG signature, dimensions within bounds, size limit.
   The renderer version, scale, rotation and source page are stored as render metadata on the version. Scanned PDFs
   follow the same path, because a scanned page is an image inside the PDF.
   - Why client-side rendering: it is reliable PDF.js, with no native canvas dependency on the serverless runtime.
     The server still owns validation and storage.
5. **Failures** are recorded on the document (`failed` + reason) and shown with a **Retry** action. Re-processing
   never deletes the original.

## 5. Editor, review and publishing (PRs C–D)

- **Editor** (React):
  - The rendered image as background, with an SVG overlay in normalised coordinates.
  - Tools: polygon, rectangle, vertex drag/add/remove, move, resize, delete/redraw, undo/redo (command stack), labels,
    search/select, zoom/pan (reusing `PlotMap`'s viewBox logic).
  - Live checks: overlaps (segment intersection + containment), duplicate labels, shapes with no unit, units with no
    shape ("unmapped plots").
  - Save draft is explicit, with autosave every 30 s while dirty.
- **Linking:** each label is matched to a unit with the existing `matchShapes` rules. A suggestion is only a
  suggestion: a link counts once confirmed. The database guard rejects a unit from another project or organisation.
- **Review:**
  - Submit for review blocks on errors (duplicate labels or units, overlaps above tolerance). Unmapped units are a
    warning.
  - QA sign-off is recorded.
  - **Developer approval** comes from the workspace owner or admin, recorded with name and time.
  - **Publish** switches `plot_layouts.published_version_id` in one transaction: the previous version becomes
    `superseded`, with its geometry and links preserved.
- **Public** (`/m/[token]`, `/api/public/plot-maps/[token]`, `/api/public/plot-maps/[token]/image`):
  - The JSON API returns a zod-validated allow-list: plot number, public status, area, dimensions, facing, corner,
    road width, and price only when shown.
  - It never returns unit ids, buyers, bookings, leads or documents.
  - Enquiry and site-visit requests go through `processInboundLead`, with the project resolved on the server, using
    the honeypot and rate limits of the showroom pattern. A site-visit request becomes a lead noting the preferred
    date; the team schedules it in the existing site-visit workflow.
  - Embed: `/m/[token]?embed=1`, with `frame-ancestors` limited to the workspace's allowed website domains.
- **Auto refresh:** team and public maps re-read statuses every 30 s, and on window focus.
- **History:** every boundary, link and status change is recorded in `org_audit` (`plot_map.*`). Unit status history
  stays in the inventory module.

## 6. Setup progress and operations (PR E)

- **Stages** (fixed order):
  1. Activated
  2. Layout uploaded
  3. File validated and processed
  4. Boundaries mapped
  5. Inventory linked
  6. QA completed
  7. Developer approval
  8. Published
- **Completion is event-driven only.** Each stage completes when its recorded operation exists, for example a
  document `ready`, an approval row, or `published_version_id` set. Staff cannot tick a stage done; they can only
  record a blocker or an assignment.
- **Estimates** come from configurable service levels (`SLA` in `lib/plots/setup.ts`):
  - RE and system stages have a planned time: processing 1 h; mapping 6 h + 0.04 h per plot + 1 h per extra
    page, ×1.3 for PNG/JPG and ×1.25 when outlines average more than 8 points; QA 3 h + 0.01 h per plot. Plots are the
    drawn plots, or the project's unit count before anything is drawn.
  - Customer stages have no service level. They carry a stated assumption of one working day each, shown as such.
  - Counted in business hours: Mon–Sat 10:00–19:00 IST (`BUSINESS`). Public holidays are **not** excluded yet.
  - **The clock pauses only while an open blocker waits on the customer.** The pause, since when, and the reason are
    shown. Blockers waiting on RE do not pause it.
  - Recomputed on every page load from the records. History-based estimates (after 10+ completed set-ups) are later work.
  - The UI shows "expected ready around <date>", never a countdown. Progress = completed stages ÷ 8.
- **Records** (20260084): `plot_map_versions.rendered_at`; `plot_map_setup_blockers` (stage, waiting on customer or
  RE, reason; never edited, resolved once, same organisation as the project); `plot_map_setup_assignments`
  (one RE team member per project). Server-only tables: RLS on, no client grants.
- **Customer view** (`components/plots/SetupProgress.tsx`) on the project's map page, for owners, admins and managers
  until the map is published: current stage and who it is with, the 8 stages, expected ready date, last updated, and
  anything needed from the workspace with a **Mark as done** button (`POST /api/plot-maps/setup/blockers/[id]`;
  only blockers waiting on the customer; audited in the workspace log).
- **Operations console** (`/platform/plot-maps`, permission `plotMapSetup`: Platform Owner, platform admins, support):
  in progress / overdue / blocked / unassigned / published, stage, due time, expected ready, plot count, assignee,
  blockers. Actions through `POST /api/admin/plot-map-setup` (MFA, audited in the platform log): assign, raise and
  resolve blockers. **Metadata only** — no inventory, buyers or map contents.
- **Communications:**
  - In-app notifications (type `plot_map`) to the workspace's active owners and admins: activation, a blocker waiting
    on them, QA passed (ready for approval), QA failed, sent back, published.
  - E-mail from the hourly customer e-mail job (`collectPlotMapEmails`): `plot_map_activated`,
    `plot_map_action_needed` (blocker, QA failed, sent back), `plot_map_published`, and `plot_map_delayed` (at most one
    per project per day while a RE or system stage is past its planned time).
- **Embedding** (`lib/plots/embed.ts`): a shared map lists up to 10 of the workspace's websites (https only). The public
  page `/m/<token>` is sent with `Content-Security-Policy: frame-ancestors 'self' <sites>` from `proxy.ts`, via
  `plot_map_embed_origins(token)`, which returns sites only for a shared, published map whose add-on is active.

### Rollback (PR E1)

- **Code:** revert the PR. Without it, `/m/` pages are sent without a frame-ancestors header again (any site can frame
  them, as before).
- **Database** (additive): `DROP FUNCTION plot_map_embed_origins(text)`; `ALTER TABLE plot_layouts DROP COLUMN
  embed_domains`; `DROP TABLE plot_map_setup_blockers, plot_map_setup_assignments`; `DROP FUNCTION
  guard_plot_map_setup_row()`; `ALTER TABLE plot_map_versions DROP COLUMN rendered_at`. Restore the previous
  `notifications_type_check` and `customer_email_log_kind_check` lists only after deleting rows of the new types.
- The migration changes no customer data except backfilling `rendered_at` from `updated_at` for ready versions.

### Owner decision needed: staff-assisted mapping

Platform staff may not read or change customer data without a support grant, and grants are read-only for at most
24 hours. Options:

- **(a) Self-serve only.** The customer draws and links; RE staff see only setup metadata.
- **(b) Scoped "map setup" grant.** This would be a new grant type:
  - The customer approves it for one project.
  - It is valid for up to 14 days and revocable.
  - It allows writes **only** to that project's plot-map tables, plus reading that project's unit numbers and
    statuses.
  - Every action is audited.
- **(c) RE draws, customer links.** Staff draw shapes and labels on a version (no inventory access); the customer
  confirms the links.

**Decided (owner, 2026-11-22): (c).** RE staff draw boundaries and plot numbers on a draft version, with no access
to inventory, prices or buyers. The customer confirms every inventory link, approves and publishes. (b) may be added
later for customers who want a fully managed service.

**Built (PR E2, 20260085):**
- The workspace's owner or admin allows it per project on the map page ("Let RE draw the plot boundaries"):
  14 days by default, at most 31, one open permission at a time, withdrawable at any time. The add-on must be active.
  Each permission is kept as history (`plot_map_staff_access`); it is only ever withdrawn, never edited. Audited.
- Staff with `plotMapSetup` (MFA) open the project from `/platform/plot-maps` and draw on draft versions in the
  editor's draw-only mode. They get the page image and outlines; a linked plot is only marked "linked", never which
  unit. No inventory, prices or buyers.
- Saves go through `save_plot_map_shapes_as_staff()`: it checks the permission and the add-on, ignores any unit sent,
  keeps each confirmed link while the plot keeps its number (renumbering drops the link for the customer to confirm),
  and then runs the normal save (draft only, ownership). Audited in the platform log; the workspace's owners and
  admins get one in-app note per version per day.
- Rollback: revert the code; `DROP FUNCTION save_plot_map_shapes_as_staff(uuid, uuid, uuid, jsonb),
  plot_map_staff_access_active(uuid), guard_plot_map_staff_access(); DROP TABLE plot_map_staff_access`.

## 7. OCR (optional, later)

- An interface `suggestLabels(image) → [{ text, box, confidence }]` behind a flag.
- Suggestions appear as unconfirmed labels; nothing is linked or published from OCR without a person confirming.
- A provider choice (e.g. a cloud OCR API) is a founder decision (cost, data processing terms).
- Automatic boundary detection is out of scope for the first release.

## 8. PR plan

| PR | Scope | Migration |
|---|---|---|
| **A** | This report. Per-project entitlement (5 states) with database guards, platform activation/suspension per project, workspace states and "Request activation", plus tests. | 20260080 |
| B | Document intake: private bucket, documents/versions, validation, page selection, rotation, renders, thumbnails, retry. | 20260081 |
| C | Editor and linking with validation; save draft. | 20260082 |
| D | Review, approval, publish switch; public map on versions; public API, image route; enquiry and site-visit requests; embed; auto refresh. | 20260083 |
| E1 | Setup tracker, estimate engine, operations console, notifications and e-mails, embed domains. | 20260084 |
| E2 | Option (c): RE staff draw boundaries on a draft version with the customer's opt-in, no inventory access. | 20260085 |
| (separate) | Sales: booking and blocking cancellation releasing the unit under the existing rules (closes gap 6). | — |
| F | OCR suggestions (after the provider decision). | — |

Each PR includes tests (unit plus a real-database `tests/db-integration` suite for guards and isolation),
rollback notes and a production read-only check plan.

## 9. Rollback (PR A)

- **Code:** revert the PR. The old routes read `org_addons`, which is still present.
- **Database:** the migration is additive. To roll back:
  - restore the 20260072 bodies of `guard_plot_layout` and `guard_plot_layout_link`;
  - `DROP TABLE project_addon_events, project_addons`;
  - `DROP FUNCTION project_addon_state, guard_project_addon, log_project_addon`.
- **No customer data is created or changed** by the migration.
