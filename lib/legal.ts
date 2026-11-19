// lib/legal.ts — every company fact and commercial term the legal pages (Privacy, Terms, Refund & Cancellation,
// Contact) rely on, in one place. A null value is NOT known yet: the pages show a clearly marked placeholder instead of
// guessing, and stay out of search engines until `confirmed` is true. Fill these in only from INFYN Group's own
// records and legal advice — never from assumptions.
export const LEGAL = {
  /** Trading name used on the site. */
  brand: 'INFYN Group',
  /** Registered legal name exactly as on the certificate of incorporation (e.g. "… Private Limited"). Unconfirmed. */
  legalName: null as string | null,
  product: 'REGrow',
  lastUpdated: '19 November 2026',
  /** Corporate Identification Number (MCA). */
  cin: null as string | null,
  /** Registered office address, as on the certificate of incorporation. */
  registeredAddress: null as string | null,
  /** Where privacy requests and complaints go. */
  privacyEmail: null as string | null,
  /** General enquiries / sales and customer support contact points. */
  salesEmail: null as string | null,
  supportEmail: null as string | null,
  phone: null as string | null,
  /** Grievance officer (DPDP Act 2023 / IT Rules): name and email. */
  grievanceOfficer: null as { name: string; email: string } | null,
  /** City whose courts have jurisdiction under the Terms. */
  jurisdictionCity: null as string | null,
  /** Set to true once the fields above are filled in and the text has been reviewed by counsel. */
  confirmed: false,
}

/** The name to use in legal text: the registered name once confirmed, otherwise the trading name. */
export const legalEntity = () => LEGAL.legalName ?? LEGAL.brand

/**
 * Refund and cancellation terms that are a business decision. null = not decided yet: the Refund & Cancellation page
 * shows a placeholder and promises nothing. Facts the product already enforces are stated on the page directly.
 */
export const REFUND_TERMS = {
  /** Is part of a prepaid period refunded when a customer cancels mid-period? e.g. 'No refunds for the unused part of a period.' */
  unusedPeriod: null as string | null,
  /** Any window in which a first payment can be refunded in full, e.g. '7 days from the first payment'. */
  firstPaymentWindow: null as string | null,
  /** Onboarding / setup fees: refundable or not. */
  setupFees: null as string | null,
  /** Days within which a refund request is answered (our commitment, not the bank's). */
  responseDays: null as number | null,
}

/** Service providers that process data for REGrow (keep in step with the code and payment_gateway_configs). */
export const SUBPROCESSORS = [
  { name: 'Supabase', purpose: 'Database, authentication and file storage' },
  { name: 'Vercel', purpose: 'Application hosting' },
  { name: 'Resend', purpose: 'Transactional email (invitations, password resets, notifications)' },
  { name: 'Razorpay', purpose: 'Payment processing for subscriptions (card and UPI details are handled by Razorpay, not stored by REGrow)' },
]

/**
 * Payment providers integrated in code but not yet processing customer data. Listed in the Privacy Policy only when
 * `active` is true — switch it on in the same change that enables the provider for customers.
 */
export const PENDING_SUBPROCESSORS = [
  { name: 'Cashfree Payments', purpose: 'Payment processing for subscriptions, including UPI AutoPay mandates (payment details are handled by Cashfree, not stored by REGrow)', active: false },
]

/** Services that receive or send data only when a customer connects them to their own workspace. */
export const CUSTOMER_CONNECTED_SERVICES = ['Meta (Facebook and Instagram lead forms, WhatsApp Business)', 'Google Ads lead forms', 'Property portals, where the portal grants API access']

/** Which legal/company facts are still missing — shown to staff and used by tests and the readiness checklist. */
export function missingLegalFacts(): string[] {
  const missing: string[] = []
  if (!LEGAL.legalName) missing.push('Registered legal name')
  if (!LEGAL.cin) missing.push('CIN')
  if (!LEGAL.registeredAddress) missing.push('Registered office address')
  if (!LEGAL.privacyEmail) missing.push('Privacy contact email')
  if (!LEGAL.supportEmail) missing.push('Customer support email')
  if (!LEGAL.grievanceOfficer) missing.push('Grievance officer name and email')
  if (!LEGAL.jurisdictionCity) missing.push('Jurisdiction city')
  if (REFUND_TERMS.unusedPeriod === null) missing.push('Refund rule for the unused part of a paid period')
  if (REFUND_TERMS.firstPaymentWindow === null) missing.push('First-payment refund window (or "none")')
  if (REFUND_TERMS.setupFees === null) missing.push('Refund rule for onboarding/setup fees')
  if (REFUND_TERMS.responseDays === null) missing.push('Days to respond to a refund request')
  return missing
}
