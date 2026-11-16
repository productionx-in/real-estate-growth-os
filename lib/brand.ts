// lib/brand.ts
// Single source of truth for product and company naming in user-visible copy.
// REGrow is the product brand; INFYN Group is the company (parent) brand.
//
// NOT covered here (deliberately unchanged until BRANDING_MIGRATION_PLAN phase 2, item M1-15):
// integration contracts such as the website embed element id `productionx-enquiry-form`,
// API-key prefix `px_live_`, outbound webhook headers `x-px-*` / User-Agent, and WhatsApp
// verify-token defaults. Those need backward-compatible aliases before they can be renamed.

export const PRODUCT_NAME = 'REGrow'
export const COMPANY_NAME = 'INFYN Group'
export const PRODUCT_FULL_NAME = `${PRODUCT_NAME} by ${COMPANY_NAME}`
export const PRODUCT_DESCRIPTOR = 'Real Estate Growth Operating System'

/** Display name for outbound email. The sending address stays as configured until the REGrow email domain is authenticated. */
export const EMAIL_SENDER_NAME = PRODUCT_NAME
