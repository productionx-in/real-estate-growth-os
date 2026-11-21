// lib/documents/letterhead.ts — the company's own details (org_business_profiles, 20260071): validated here, used by
// the merge fields ({{org.gstin}}…), and frozen onto each shared document as its letterhead.
// Plain data only; components/documents/DocumentBody.tsx renders it as React elements, never HTML.

export interface BusinessProfile {
  legalName: string | null
  address: string | null
  city: string | null
  state: string | null
  pincode: string | null
  gstin: string | null
  pan: string | null
  reraNumber: string | null
  phone: string | null
  email: string | null
  website: string | null
  logoUrl: string | null
  signatoryName: string | null
  signatoryTitle: string | null
  bankAccountName: string | null
  bankName: string | null
  bankAccountNumber: string | null
  bankIfsc: string | null
  footerNote: string | null
}

export const EMPTY_PROFILE: BusinessProfile = {
  legalName: null, address: null, city: null, state: null, pincode: null, gstin: null, pan: null, reraNumber: null,
  phone: null, email: null, website: null, logoUrl: null, signatoryName: null, signatoryTitle: null,
  bankAccountName: null, bankName: null, bankAccountNumber: null, bankIfsc: null, footerNote: null,
}

/** Database column for each field (same order as the form). */
export const PROFILE_COLUMNS: Record<keyof BusinessProfile, string> = {
  legalName: 'legal_name', address: 'address', city: 'city', state: 'state', pincode: 'pincode', gstin: 'gstin', pan: 'pan',
  reraNumber: 'rera_number', phone: 'phone', email: 'email', website: 'website', logoUrl: 'logo_url',
  signatoryName: 'signatory_name', signatoryTitle: 'signatory_title', bankAccountName: 'bank_account_name', bankName: 'bank_name',
  bankAccountNumber: 'bank_account_number', bankIfsc: 'bank_ifsc', footerNote: 'footer_note',
}

/** Same rules as the database CHECKs, so the form explains a problem before the save is refused. */
const RULES: Partial<Record<keyof BusinessProfile, { re: RegExp; message: string }>> = {
  pincode: { re: /^[1-9][0-9]{5}$/, message: 'PIN code is 6 digits.' },
  gstin: { re: /^[0-9]{2}[A-Z]{5}[0-9]{4}[A-Z][1-9A-Z]Z[0-9A-Z]$/, message: 'GSTIN is 15 characters, e.g. 29ABCDE1234F1Z5.' },
  pan: { re: /^[A-Z]{5}[0-9]{4}[A-Z]$/, message: 'PAN is 10 characters, e.g. ABCDE1234F.' },
  phone: { re: /^\+?[0-9 ()-]{6,24}$/, message: 'Phone: digits, spaces and + only.' },
  email: { re: /^[^@\s]+@[^@\s]+\.[^@\s]+$/, message: 'Enter a valid e-mail address.' },
  website: { re: /^https?:\/\/\S{3,190}$/, message: 'Website starts with https://' },
  logoUrl: { re: /^https:\/\/\S{3,490}$/, message: 'Logo must be an https:// image link.' },
  bankAccountNumber: { re: /^[0-9]{6,20}$/, message: 'Account number: 6 to 20 digits.' },
  bankIfsc: { re: /^[A-Z]{4}0[A-Z0-9]{6}$/, message: 'IFSC is 11 characters, e.g. HDFC0001234.' },
}
const MAX: Partial<Record<keyof BusinessProfile, number>> = {
  legalName: 160, address: 400, city: 80, state: 80, reraNumber: 80, signatoryName: 80, signatoryTitle: 80,
  bankAccountName: 120, bankName: 120, footerNote: 500,
}
const UPPER = new Set<keyof BusinessProfile>(['gstin', 'pan', 'bankIfsc'])

/** Trims, upper-cases codes, turns blanks into null and checks every field. */
export function normaliseProfile(input: Partial<Record<keyof BusinessProfile, unknown>>): { profile: BusinessProfile; errors: Partial<Record<keyof BusinessProfile, string>> } {
  const profile = { ...EMPTY_PROFILE }
  const errors: Partial<Record<keyof BusinessProfile, string>> = {}
  for (const key of Object.keys(EMPTY_PROFILE) as (keyof BusinessProfile)[]) {
    const raw = input[key]
    let v = typeof raw === 'string' ? raw.trim() : ''
    if (key === 'bankAccountNumber') v = v.replace(/\s+/g, '')
    if (UPPER.has(key)) v = v.toUpperCase()
    if (!v) continue
    const max = MAX[key]
    if (max && v.length > max) errors[key] = `Keep it under ${max} characters.`
    const rule = RULES[key]
    if (rule && !rule.re.test(v)) errors[key] = rule.message
    profile[key] = v
  }
  return { profile, errors }
}

export function profileFromRow(row: Record<string, unknown> | null | undefined): BusinessProfile {
  const p = { ...EMPTY_PROFILE }
  if (!row) return p
  for (const [key, col] of Object.entries(PROFILE_COLUMNS) as [keyof BusinessProfile, string][]) {
    const v = row[col]
    p[key] = typeof v === 'string' && v.trim() ? v : null
  }
  return p
}

export function profileToRow(p: BusinessProfile): Record<string, string | null> {
  return Object.fromEntries((Object.entries(PROFILE_COLUMNS) as [keyof BusinessProfile, string][]).map(([k, col]) => [col, p[k]]))
}

/** "12 MG Road, Bengaluru, Karnataka 560001" */
export function formatAddress(p: BusinessProfile): string | null {
  const place = [p.city, [p.state, p.pincode].filter(Boolean).join(' ')].filter(Boolean).join(', ')
  return [p.address, place].filter(Boolean).join(', ') || null
}

/** What a shared document shows at the top and bottom. Frozen on lead_documents.letterhead when it is created. */
export interface Letterhead {
  name: string
  logoUrl: string | null
  address: string | null
  contact: string[]
  registrations: string[]
  footerNote: string | null
}

export function buildLetterhead(orgName: string, p: BusinessProfile): Letterhead {
  return {
    name: p.legalName || orgName,
    logoUrl: p.logoUrl,
    address: formatAddress(p),
    contact: [p.phone, p.email, p.website?.replace(/^https?:\/\//, '').replace(/\/$/, '')].filter((x): x is string => !!x),
    registrations: [p.gstin && `GSTIN ${p.gstin}`, p.reraNumber && `RERA ${p.reraNumber}`].filter((x): x is string => !!x),
    footerNote: p.footerNote,
  }
}

/** A stored letterhead (jsonb) back into the type; anything malformed is dropped rather than shown. */
export function parseLetterhead(v: unknown): Letterhead | null {
  if (!v || typeof v !== 'object' || Array.isArray(v)) return null
  const o = v as Record<string, unknown>
  const str = (x: unknown) => (typeof x === 'string' && x.trim() ? x : null)
  const list = (x: unknown) => (Array.isArray(x) ? x.filter((i): i is string => typeof i === 'string').slice(0, 6) : [])
  const name = str(o.name)
  if (!name) return null
  const logo = str(o.logoUrl)
  return {
    name, logoUrl: logo && /^https:\/\//.test(logo) ? logo : null, address: str(o.address),
    contact: list(o.contact), registrations: list(o.registrations), footerNote: str(o.footerNote),
  }
}

/** Shown in Settings so an owner knows what the letterhead still lacks. */
export function missingForLetterhead(p: BusinessProfile): string[] {
  const out: string[] = []
  if (!p.legalName) out.push('registered company name')
  if (!p.address) out.push('address')
  if (!p.phone && !p.email) out.push('phone or e-mail')
  if (!p.gstin) out.push('GSTIN')
  return out
}
