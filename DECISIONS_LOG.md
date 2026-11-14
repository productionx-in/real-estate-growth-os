# PRODUCTION X — REAL ESTATE GROWTH OS
## ARCHITECTURAL & BUSINESS DECISIONS LOG

**Document Purpose:** Permanent chronological record of approved business decisions, architecture choices, scope boundaries, and deferred items.  
**Last Updated:** 2026-11-14T20:38:00+05:30

---

## Decision Index

| ID | Date | Area | Decision Summary | Status |
| :--- | :--- | :--- | :--- | :--- |
| **DEC-001** | 2026-11-09 | Product Scope | Commercial sales only; commercial leasing and rentals strictly out of scope | **Approved / Active** |
| **DEC-002** | 2026-11-10 | Inventory Model | Strict separation between grouping hierarchy nodes and saleable inventory units | **Approved / Active** |
| **DEC-003** | 2026-11-12 | Integrations | Central Production X Meta Developer App pattern (multi-tenant single-app OAuth) | **Approved / Active** |
| **DEC-004** | 2026-11-13 | Integrations | Central Meta Developer App creation intentionally deferred until platform completion | **Approved / Active** |
| **DEC-005** | 2026-11-13 | Security | AES-256-GCM token encryption formatted as `vault://aes256gcm:...` (zero plaintext secrets) | **Approved / Active** |
| **DEC-006** | 2026-11-13 | CRM Ingestion | 3-Case Deduplication Engine (Case A: Event replay, Case B: Flagged duplicate, Case C: Separate enquiry) | **Approved / Active** |
| **DEC-007** | 2026-11-14 | Integrations | Disconnect preserves all historical leads and attribution non-destructively | **Approved / Active** |
| **DEC-008** | 2026-11-14 | Database | Production database remediation staged into Migrations 0016, 0017, and 0018 with fail-closed recursion | **Approved / Staged** |
| **DEC-009** | 2026-11-14 | Testing | Strict separation between in-memory unit tests and real PostgreSQL / provider staging tests | **Approved / Active** |
| **DEC-010** | 2026-11-14 | Build / Infra | Webpack bundling mode retained for Next.js build due to Turbopack PostCSS child-process restrictions on Windows | **Approved / Active** |
| **DEC-011** | 2026-11-15 | Integrations | Central Google Ads OAuth & Lead Form Webhook architecture with deferred app setup | **Approved / Active** |

---

## Detailed Decision Records

### DEC-001: Commercial Sales Only (Leasing Excluded)
- **Context:** Real estate developers build and sell commercial office complexes, retail spaces, and mixed-use blocks.
- **Decision:** The platform supports commercial property sales (outright purchase of offices/shops). Commercial lease management, tenant billing, and rent collection are excluded from current and near-term roadmaps.

### DEC-002: Separation of Inventory Units from Hierarchy Nodes
- **Context:** Early designs risked creating duplicate hierarchy nodes for individual units.
- **Decision:** Hierarchy nodes (`project_hierarchy_nodes`) represent physical or logical groupings (Towers, Blocks, Floors, Clusters). Actual saleable assets (`inventory_items`) live in their own table and reference a parent node. Inventory summaries aggregate descendant units without double counting.

### DEC-003 & DEC-004: Central Meta Developer App & Deferred Setup
- **Context:** Meta Lead Ads requires an approved Meta Developer App with App Review for permissions (`leads_retrieval`, `pages_manage_ads`).
- **Decision:** Production X operates a single, centralized Meta app. Customers connect by logging into Facebook and authorizing their business Pages. To avoid premature app review submissions and dependency on live developer accounts during initial development, the full OAuth architecture, state validation, and webhooks were implemented and verified in-memory first; real Meta app registration is deferred until platform completion.

### DEC-005: Cryptographic Vault URI Protocol for Credential Storage
- **Context:** PostgreSQL database tables and RLS views must never expose plaintext OAuth tokens or secrets.
- **Decision:** All credentials are encrypted using AES-256-GCM. Storage format is strictly `vault://aes256gcm:<iv>:<tag>:<ciphertext>`. All DAL and API views sanitize `credential_ref` to `null` before sending responses to the client.

### DEC-006: Deterministic Idempotency & 3-Case Deduplication
- **Context:** Inbound webhooks frequently replay events due to network retries, and buyers submit multiple enquiries across different projects.
- **Decision:**
  - *Case A (Idempotent Replay):* Same external event ID or token returns existing lead without duplication.
  - *Case B (Flagged Duplicate):* Same customer enquiring for the same project flags `is_duplicate = true` and links `duplicate_of_id`.
  - *Case C (Separate Enquiry):* Same customer enquiring for a *different* project creates a separate, non-duplicate lead associated with that specific project.

### DEC-007: Non-Destructive Disconnect Lifecycle
- **Context:** When a customer disconnects a marketing channel, historical leads must not be orphaned or deleted.
- **Decision:** Disconnecting sets `status = 'disabled'` and removes active decryption keys, but strictly retains all historical leads, project associations, and attribution logs.

### DEC-011: Central Google Ads OAuth & Lead Form Webhook Architecture
- **Context:** Google Ads Lead Form extensions deliver real-time leads via webhook with `google_key` verification, and Google Ads API accesses customer accounts and lead form assets via OAuth (`https://www.googleapis.com/auth/adwords`).
- **Decision:** Reuses the multi-tenant central app architecture established in DEC-003 and DEC-004. Actual Google Cloud project OAuth credentials and Developer Token registration are deferred until platform completion. Tokens are encrypted using AES-256-GCM vault storage (`vault://aes256gcm:...`). Real-time leads are received via both connection-specific (`/api/webhooks/google/[connectionId]`) and central (`/api/webhooks/google`) endpoints, verified using timing-safe comparison on `google_key`, and ingested through `processInboundLead`. No live connections or tokens are simulated.
