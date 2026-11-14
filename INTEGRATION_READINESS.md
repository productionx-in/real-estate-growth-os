# PRODUCTION X — REAL ESTATE GROWTH OS
## PROVIDER INTEGRATION READINESS REGISTER

**Document Purpose:** Permanent source of truth for all external marketing, messaging, and property portal integrations.  
**Security Policy:** NEVER store actual credentials, passwords, service-role keys, access tokens, or private secrets in this document.  
**Last Updated:** 2026-11-15T00:42:00+05:30

---

## 1. Provider Readiness Register

| Provider | Integration Stage | Application Implementation Status | External Account Setup Status | Credentials Status | Permission / Approval Status | Live Testing Status | Remaining Dependencies |
| :--- | :--- | :--- | :--- | :--- | :--- | :--- | :--- |
| **Meta Lead Ads (Facebook & Instagram)** | **Stage 4B** | **Code Verified** | **Deferred** | Not Configured (Pending Central App) | Pending Meta App Review | Mock / In-Memory Verified (12/12) | Central Meta Developer App registration, `META_APP_ID`, `META_APP_SECRET`, `META_WEBHOOK_VERIFY_TOKEN` |
| **Generic Inbound Webhooks** | **Stage 4C** | **Code Verified (Hardened)** | **Ready (SaaS Native)** | SaaS Native Secret Key Generation (AES-256-GCM Vault) | Not Required (Internal) | Unit Tested (7/7 Suites) | None (Stage 4C hardened and verified) |
| **Google Ads Lead Forms** | **Stage 4D** | **Code Verified** | **Deferred** | Not Configured (Pending Central App) | Pending Google Cloud Console App | Mock / In-Memory Verified (12/12) | Central Google Cloud Console project, `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET`, `GOOGLE_DEVELOPER_TOKEN` |
| **Website Enquiry Forms** | **Stage 4E** | **Code Verified** | **Ready (SaaS Native)** | Origin Domain Whitelist / Honeypot Defense | Not Required (Internal) | Unit Tested (12/12) | None (Stage 4E code verified and tested) |
| **WhatsApp Business API** | **Stage 4F** | **Code Verified** | **Deferred** | Not Configured | Pending Meta Business Manager & Phone Verification | Mock / In-Memory Verified (18/18) | Meta WhatsApp Cloud API credentials, verified business phone number, live approved templates |
| **99acres Lead Ingestion** | **Stage 4G** | **Code Verified** | **Deferred** | Not Configured | Pending Developer Agreement with 99acres | Mock / In-Memory Verified (12/12) | 99acres partner API access or push webhook endpoint agreement |
| **Magicbricks Lead Ingestion** | **Stage 4G** | **Code Verified** | **Deferred** | Not Configured | Pending Developer Agreement with Magicbricks | Mock / In-Memory Verified (12/12) | Magicbricks partner API access or webhook endpoint specifications |
| **Housing.com Lead Ingestion** | **Stage 4G** | **Code Verified** | **Deferred** | Not Configured | Pending Developer Agreement with Housing.com | Mock / In-Memory Verified (12/12) | Housing.com partner integration credentials and API documentation |
| **Customer Outbound Webhooks & APIs** | **Stage 4H** | **Code Verified** | **Ready (SaaS Native)** | Developer API Keys & HMAC Secrets | Not Required (Internal) | Unit Tested (10/10) | None (Stage 4H verified and tested) |

---

## 2. Architectural Security Principles for All Providers

1. **Central App Multi-Tenant Pattern**: Where supported (Meta, Google), Production X operates a single verified central developer application. Tenants authorize their individual ad accounts without registering developer apps.
2. **AES-256-GCM Vault Storage**: All external tokens, secrets, and refresh tokens are encrypted at rest using AES-256-GCM and formatted as `vault://aes256gcm:...`. Plaintext secrets are strictly prohibited from database tables and client responses.
3. **Zero Browser Exposure**: Sensitive tokens are never returned across API boundaries. APIs return `credential_ref: null` and `has_credentials: Boolean`.
4. **Deterministic Idempotency**: Inbound events must supply or generate a deterministic SHA-256 idempotency key (`uq_leads_org_idempotency_key`) to prevent duplicate leads on network retries.
5. **Non-Destructive Disconnect**: Disconnecting an integration disables the channel (`status = 'disabled'`), wipes decrypted session keys, and strictly preserves historical leads and attribution data.
6. **WhatsApp Regulatory Scope**: WhatsApp messaging compliance is governed strictly by Meta's WhatsApp Business Messaging Policy (customer opt-in, mandatory opt-out via `STOP`/`UNSUBSCRIBE`, 24-hour customer service window, and pre-approved template requirement) and Indian Digital Personal Data Protection Act (DPDPA 2023) consent standards. TRAI TCCCPR 2018 regulations and National DLT/DND scrubbing apply to carrier SMS and voice calls over telecom networks, not OTT WhatsApp messaging.
