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
| **Google Ads Lead Forms** | **Stage 4D** | **Not Started** | **Deferred** | Not Configured | Pending Google Cloud Console App | Not Started | Google Cloud project, OAuth Client ID, Webhook key for Google Lead Form extensions |
| **Website Enquiry Forms** | **Stage 4E** | **Not Started** | **Ready (SaaS Native)** | API Key / CORS Domain Token | Not Required (Internal) | Not Started | Public embeddable form script, secure REST endpoint, spam CAPTCHA/honeypot |
| **WhatsApp Business API** | **Stage 4F** | **Not Started** | **Deferred** | Not Configured | Pending Meta Business Manager & Phone Verification | Not Started | Meta WhatsApp Cloud API credentials, verified business phone number, message templates |
| **99acres Lead Ingestion** | **Stage 4G** | **Not Started** | **Deferred** | Not Configured | Pending Developer Agreement with 99acres | Not Started | 99acres partner API access or email parsing parser format confirmation |
| **Magicbricks Lead Ingestion** | **Stage 4G** | **Not Started** | **Deferred** | Not Configured | Pending Developer Agreement with Magicbricks | Not Started | Magicbricks partner API access or webhook endpoint specifications |
| **Housing.com Lead Ingestion** | **Stage 4G** | **Not Started** | **Deferred** | Not Configured | Pending Developer Agreement with Housing.com | Not Started | Housing.com partner integration credentials and API documentation |
| **Customer Outbound Webhooks & APIs** | **Stage 4H** | **Not Started** | **Ready (SaaS Native)** | Customer API Tokens | Not Required (Internal) | Not Started | Webhook dispatch worker, customer developer portal, event subscription schema |

---

## 2. Architectural Security Principles for All Providers

1. **Central App Multi-Tenant Pattern**: Where supported (Meta, Google), Production X operates a single verified central developer application. Tenants authorize their individual ad accounts without registering developer apps.
2. **AES-256-GCM Vault Storage**: All external tokens, secrets, and refresh tokens are encrypted at rest using AES-256-GCM and formatted as `vault://aes256gcm:...`. Plaintext secrets are strictly prohibited from database tables and client responses.
3. **Zero Browser Exposure**: Sensitive tokens are never returned across API boundaries. APIs return `credential_ref: null` and `has_credentials: Boolean`.
4. **Deterministic Idempotency**: Inbound events must supply or generate a deterministic SHA-256 idempotency key (`uq_leads_org_idempotency_key`) to prevent duplicate leads on network retries.
5. **Non-Destructive Disconnect**: Disconnecting an integration disables the channel (`status = 'disabled'`), wipes decrypted session keys, and strictly preserves historical leads and attribution data.
