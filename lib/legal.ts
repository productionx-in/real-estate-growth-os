// lib/legal.ts — the facts the Privacy Policy and Terms rely on, in one place. The fields set to null must be
// confirmed by INFYN Group (with legal advice) before the pages are final; until `confirmed` is true the pages say
// they are being finalised and ask search engines not to index them.
export const LEGAL = {
  entity: 'INFYN Group Private Limited',
  product: 'REGrow',
  lastUpdated: '19 November 2026',
  /** Registered office address, as on the certificate of incorporation. */
  registeredAddress: null as string | null,
  /** Where privacy requests and complaints go. */
  privacyEmail: null as string | null,
  /** Grievance officer (DPDP Act 2023 / IT Rules): name and email. */
  grievanceOfficer: null as { name: string; email: string } | null,
  /** City whose courts have jurisdiction under the Terms. */
  jurisdictionCity: null as string | null,
  /** Set to true once the fields above are filled in and the text has been reviewed. */
  confirmed: false,
}

/** Service providers that process data for REGrow (keep in step with the code). */
export const SUBPROCESSORS = [
  { name: 'Supabase', purpose: 'Database, authentication and file storage' },
  { name: 'Vercel', purpose: 'Application hosting' },
  { name: 'Resend', purpose: 'Transactional email (invitations, password resets, notifications)' },
  { name: 'Razorpay', purpose: 'Payment processing for subscriptions (card and UPI details are handled by Razorpay, not stored by REGrow)' },
]

/** Services that receive or send data only when a customer connects them to their own workspace. */
export const CUSTOMER_CONNECTED_SERVICES = ['Meta (Facebook and Instagram lead forms, WhatsApp Business)', 'Google Ads lead forms', 'Property portals, where the portal grants API access']
