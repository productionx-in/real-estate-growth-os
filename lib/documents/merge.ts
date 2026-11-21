// lib/documents/merge.ts
// Merge fields for document templates: {{lead.name}}, {{unit.total_price}}… One list, used by the template
// editor (field picker, live preview), document creation (the frozen copy) and the tests.
// Output is plain text; it is displayed by components/documents/DocumentBody.tsx, which never renders HTML.
import { EMPTY_PROFILE, formatAddress, type BusinessProfile } from '@/lib/documents/letterhead'

export interface MergeContext {
  lead: { name: string; phone: string; email: string | null }
  project: { name: string; city: string | null; location: string | null; rera_number: string | null } | null
  unit: {
    unit_number: string; tower_name: string | null; floor_number: number | null; bhk_config: string | null
    carpet_area: number | null; super_built_up_area: number | null; area_value: number | null; area_unit: string | null
    facing: string | null; base_rate: number | null; total_price: number | null; parking_spaces: number | null
    pricing_breakup: unknown
  } | null
  agent: { name: string; phone: string | null; email: string | null } | null
  /** The company's own details (Settings → Business details), for letterheads, signatures and bank details. */
  org: { name: string; profile?: BusinessProfile }
  today: Date
  timezone: string
}

export const FIELD_GROUPS: { group: string; fields: { key: string; label: string }[] }[] = [
  { group: 'Buyer', fields: [
    { key: 'lead.name', label: 'Name' }, { key: 'lead.phone', label: 'Phone' }, { key: 'lead.email', label: 'Email' },
  ] },
  { group: 'Project', fields: [
    { key: 'project.name', label: 'Project' }, { key: 'project.location', label: 'Location' },
    { key: 'project.city', label: 'City' }, { key: 'project.rera_number', label: 'RERA number' },
  ] },
  { group: 'Unit', fields: [
    { key: 'unit.number', label: 'Unit number' }, { key: 'unit.tower', label: 'Tower' }, { key: 'unit.floor', label: 'Floor' },
    { key: 'unit.configuration', label: 'Configuration (BHK)' }, { key: 'unit.carpet_area', label: 'Carpet area' },
    { key: 'unit.super_area', label: 'Super built-up area' }, { key: 'unit.facing', label: 'Facing' },
    { key: 'unit.parking', label: 'Parking spaces' }, { key: 'unit.base_rate', label: 'Rate per unit area' },
    { key: 'unit.total_price', label: 'Total price' }, { key: 'unit.price_breakup', label: 'Price breakup (table)' },
  ] },
  { group: 'Salesperson', fields: [
    { key: 'agent.name', label: 'Name' }, { key: 'agent.phone', label: 'Phone' }, { key: 'agent.email', label: 'Email' },
  ] },
  { group: 'Your company', fields: [
    { key: 'org.name', label: 'Company name' }, { key: 'org.legal_name', label: 'Registered name' },
    { key: 'org.address', label: 'Address' }, { key: 'org.phone', label: 'Phone' }, { key: 'org.email', label: 'Email' },
    { key: 'org.website', label: 'Website' }, { key: 'org.gstin', label: 'GSTIN' }, { key: 'org.pan', label: 'PAN' },
    { key: 'org.rera_number', label: 'RERA registration' }, { key: 'org.signatory_name', label: 'Signatory' },
    { key: 'org.signatory_title', label: 'Signatory’s title' }, { key: 'org.bank_details', label: 'Bank details (table)' },
  ] },
  { group: 'Dates', fields: [
    { key: 'today', label: 'Today’s date' }, { key: 'valid_until', label: 'Valid until (15 days)' },
  ] },
]

export const FIELD_KEYS = new Set(FIELD_GROUPS.flatMap((g) => g.fields.map((f) => f.key)))

const PLACEHOLDER = /\{\{\s*([a-z_]+(?:\.[a-z_]+)?)\s*\}\}/g

export function inr(n: number): string {
  return new Intl.NumberFormat('en-IN', { style: 'currency', currency: 'INR', maximumFractionDigits: 0 }).format(n)
}

function num(n: number | null | undefined, suffix = ''): string | null {
  return typeof n === 'number' && Number.isFinite(n) ? `${new Intl.NumberFormat('en-IN', { maximumFractionDigits: 2 }).format(n)}${suffix}` : null
}

function dateText(d: Date, timezone: string): string {
  return d.toLocaleDateString('en-IN', { timeZone: timezone, day: 'numeric', month: 'long', year: 'numeric' })
}

/** A price breakup object ({ "Base price": 9500000, "GST 5%": 475000 }) as a two-column table. */
function breakupTable(v: unknown): string | null {
  if (!v || typeof v !== 'object' || Array.isArray(v)) return null
  // Stored price breakups do not keep their order (Postgres jsonb), so price items come first and taxes and
  // government charges last, as on a printed cost sheet.
  const isCharge = (item: string) => /gst|tax|cess|stamp|registration|duty/i.test(item)
  const rows = Object.entries(v as Record<string, unknown>)
    .filter(([, amount]) => typeof amount === 'number' && Number.isFinite(amount))
    .sort(([a], [b]) => Number(isCharge(a)) - Number(isCharge(b)))
    .slice(0, 40)
    .map(([item, amount]) => `| ${item.replace(/[|\n]/g, ' ').slice(0, 80)} | ${inr(amount as number)} |`)
  return rows.length ? ['| Item | Amount |', '|---|---|', ...rows].join('\n') : null
}

/** Where buyers pay: a two-column table, only when the account number and IFSC are both set. */
function bankTable(p: BusinessProfile): string | null {
  if (!p.bankAccountNumber || !p.bankIfsc) return null
  const clean = (v: string) => v.replace(/[|\n]/g, ' ')
  return [
    '| Bank details | |', '|---|---|',
    `| Account name | ${clean(p.bankAccountName ?? p.legalName ?? '—')} |`,
    ...(p.bankName ? [`| Bank | ${clean(p.bankName)} |`] : []),
    `| Account number | ${p.bankAccountNumber} |`,
    `| IFSC | ${p.bankIfsc} |`,
  ].join('\n')
}

/** The value of one field, or null when the context has none. */
export function fieldValue(key: string, c: MergeContext): string | null {
  const u = c.unit
  const p = c.org.profile ?? EMPTY_PROFILE
  const area = (n: number | null | undefined) => num(n, u?.area_unit ? ` ${u.area_unit}` : ' sq ft')
  switch (key) {
    case 'lead.name': return c.lead.name || null
    case 'lead.phone': return c.lead.phone || null
    case 'lead.email': return c.lead.email
    case 'project.name': return c.project?.name ?? null
    case 'project.location': return c.project?.location ?? null
    case 'project.city': return c.project?.city ?? null
    case 'project.rera_number': return c.project?.rera_number ?? null
    case 'unit.number': return u?.unit_number ?? null
    case 'unit.tower': return u?.tower_name ?? null
    case 'unit.floor': return u?.floor_number != null ? String(u.floor_number) : null
    case 'unit.configuration': return u?.bhk_config ?? null
    case 'unit.carpet_area': return area(u?.carpet_area)
    case 'unit.super_area': return area(u?.super_built_up_area ?? u?.area_value)
    case 'unit.facing': return u?.facing ?? null
    case 'unit.parking': return u?.parking_spaces != null ? String(u.parking_spaces) : null
    case 'unit.base_rate': return u?.base_rate != null ? `${inr(u.base_rate)} per ${u.area_unit || 'sq ft'}` : null
    case 'unit.total_price': return u?.total_price != null ? inr(u.total_price) : null
    case 'unit.price_breakup': return breakupTable(u?.pricing_breakup)
    case 'agent.name': return c.agent?.name ?? null
    case 'agent.phone': return c.agent?.phone ?? null
    case 'agent.email': return c.agent?.email ?? null
    case 'org.name': return c.org.name
    case 'org.legal_name': return p.legalName ?? c.org.name
    case 'org.address': return formatAddress(p)
    case 'org.phone': return p.phone
    case 'org.email': return p.email
    case 'org.website': return p.website
    case 'org.gstin': return p.gstin
    case 'org.pan': return p.pan
    case 'org.rera_number': return p.reraNumber
    case 'org.signatory_name': return p.signatoryName
    case 'org.signatory_title': return p.signatoryTitle
    case 'org.bank_details': return bankTable(p)
    case 'today': return dateText(c.today, c.timezone)
    case 'valid_until': return dateText(new Date(c.today.getTime() + 15 * 86_400_000), c.timezone)
    default: return null
  }
}

/** Field keys a template uses, in order, without repeats. */
export function usedFields(body: string): string[] {
  return [...new Set([...body.matchAll(PLACEHOLDER)].map((m) => m[1]))]
}

/** Placeholders that are not merge fields (probably typos). */
export function unknownFields(body: string): string[] {
  return usedFields(body).filter((k) => !FIELD_KEYS.has(k))
}

/** Fields the template uses that have no value for this lead/unit (shown as a warning before creating). */
export function missingFields(body: string, c: MergeContext): string[] {
  return usedFields(body).filter((k) => FIELD_KEYS.has(k) && fieldValue(k, c) === null)
}

/** The filled-in text. Fields without a value become "—"; unknown placeholders are left as written. */
export function renderTemplate(body: string, c: MergeContext): string {
  return body.replace(PLACEHOLDER, (all, key: string) => (FIELD_KEYS.has(key) ? fieldValue(key, c) ?? '—' : all))
}

export const SAMPLE_CONTEXT: MergeContext = {
  lead: { name: 'Priya Sharma', phone: '+91 98450 12345', email: 'priya@example.com' },
  project: { name: 'Skyline Towers', city: 'Bengaluru', location: 'Whitefield', rera_number: 'PRM/KA/RERA/1251/446/PR/010125/007321' },
  unit: {
    unit_number: 'B-1204', tower_name: 'Tower B', floor_number: 12, bhk_config: '3BHK', carpet_area: 1180, super_built_up_area: 1620,
    area_value: 1620, area_unit: 'sq ft', facing: 'East', base_rate: 8950, total_price: 14499000, parking_spaces: 1,
    pricing_breakup: { 'Base price': 13209000, 'Car park': 400000, 'Club membership': 200000, 'GST (5%)': 690000 },
  },
  agent: { name: 'Asha Menon', phone: '+91 98450 00000', email: 'asha@skyline.example' },
  org: {
    name: 'Skyline Developers',
    profile: {
      legalName: 'Skyline Developers Private Limited', address: '4th Floor, Prestige Meridian, 29 MG Road', city: 'Bengaluru',
      state: 'Karnataka', pincode: '560001', gstin: '29ABCDE1234F1Z5', pan: 'ABCDE1234F', reraNumber: 'PRM/KA/RERA/1251/446/PR/010125/007321',
      phone: '+91 80 4000 1234', email: 'sales@skyline.example', website: 'https://skyline.example', logoUrl: null,
      signatoryName: 'Rahul Iyer', signatoryTitle: 'Director, Sales', bankAccountName: 'Skyline Developers Pvt Ltd — Skyline Towers Collection A/c',
      bankName: 'HDFC Bank, MG Road', bankAccountNumber: '50200012345678', bankIfsc: 'HDFC0000123',
      footerNote: 'Registered office: 29 MG Road, Bengaluru 560001. CIN U45200KA2010PTC000000.',
    },
  },
  today: new Date('2026-11-18T09:00:00Z'),
  timezone: 'Asia/Kolkata',
}

export const STARTER_COST_SHEET = `# Cost sheet — {{project.name}}

Prepared for **{{lead.name}}** on {{today}}. Valid until {{valid_until}}.

## Unit
| Detail | Value |
|---|---|
| Unit | {{unit.number}}, {{unit.tower}}, floor {{unit.floor}} |
| Configuration | {{unit.configuration}}, {{unit.facing}} facing |
| Carpet area | {{unit.carpet_area}} |
| Super built-up area | {{unit.super_area}} |

## Price
{{unit.price_breakup}}

**Total: {{unit.total_price}}**

Prices include GST where shown. RERA: {{project.rera_number}}.

Questions? Call {{agent.name}} on {{agent.phone}}.
{{org.name}}`
