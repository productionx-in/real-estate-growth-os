// lib/brand.ts
// Single source of truth for product and company naming in user-visible copy.
// RE is the product brand (short form: RE); Production X is the parent company ("by PX" in the logo).
//
// NOT renamed (stable technical contracts; changing them would break installs or stored data):
// the website embed's legacy data-regrow-* attributes and window.REGrow (still read, data-re-* / REbyPX are
// the documented names), REGROW_SOMETHING environment variable names, database objects and cron job names created by
// earlier migrations, and the API-key prefix px_live_.

export const PRODUCT_NAME = 'RE'
export const PRODUCT_SHORT_NAME = 'RE'
export const COMPANY_NAME = 'Production X'
/** The parent company's own website (an outside link, not this app's address). */
export const COMPANY_URL = 'https://productionx.in'
export const PRODUCT_FULL_NAME = PRODUCT_NAME
export const PRODUCT_DESCRIPTOR = 'Real Estate Growth OS'
export const COPYRIGHT = `© ${new Date().getFullYear()} ${COMPANY_NAME}. All rights reserved.`

/** Display name for outbound email. */
export const EMAIL_SENDER_NAME = PRODUCT_NAME
