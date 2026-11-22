// lib/listings/listing.ts — resale and rental listings for agencies (20260079): the fields, the rules a listing must
// follow, the share message, and how well a listing fits what a buyer or tenant wants. Pure, so the forms, the API,
// matching and the tests share one definition. The owner's contact details never appear in anything shared.
import { normConfig, shortInr } from '@/lib/matching/score'

export const LISTING_KINDS = { sale: 'For sale', rent: 'For rent' } as const
export type ListingKind = keyof typeof LISTING_KINDS

export const PROPERTY_TYPES = {
  apartment: 'Apartment', villa: 'Villa', independent_house: 'Independent house', plot: 'Plot', land: 'Land',
  office: 'Office', shop: 'Shop', showroom: 'Showroom', warehouse: 'Warehouse', co_working: 'Co-working seats',
} as const
export type PropertyType = keyof typeof PROPERTY_TYPES
export const COMMERCIAL_TYPES: PropertyType[] = ['office', 'shop', 'showroom', 'warehouse', 'co_working']

export const LISTING_STATUSES = { available: 'Available', on_hold: 'On hold', closed: 'Closed (sold / let)', withdrawn: 'Withdrawn by owner' } as const
export type ListingStatus = keyof typeof LISTING_STATUSES
export const FURNISHING = { unfurnished: 'Unfurnished', semi: 'Semi-furnished', full: 'Fully furnished' } as const
const AREA_UNITS = ['sqft', 'sqyd', 'acres', 'guntas', 'cents'] as const

export interface Listing {
  id: string
  kind: ListingKind
  propertyType: PropertyType
  title: string
  locality: string
  city: string
  address: string | null
  bhk: string | null
  area: number | null
  areaUnit: (typeof AREA_UNITS)[number]
  floor: string | null
  furnishing: keyof typeof FURNISHING | null
  facing: string | null
  price: number | null
  monthlyRent: number | null
  deposit: number | null
  maintenance: number | null
  availableFrom: string | null
  description: string | null
  status: ListingStatus
  assignedTo: string | null
  /** Present only for people allowed to see the owner (managers, the agent, whoever added it). */
  owner: { name: string | null; phone: string | null; email: string | null } | null
}

type Errors = Record<string, string>
const str = (v: unknown, max: number) => (typeof v === 'string' ? v.replace(/\s+/g, ' ').trim().slice(0, max + 1) : '')
const money = (v: unknown, max: number): number | null | 'bad' => {
  if (v === null || v === undefined || v === '') return null
  const n = typeof v === 'number' ? v : typeof v === 'string' && /^\d+(\.\d+)?$/.test(v.replace(/,/g, '')) ? Number(v.replace(/,/g, '')) : NaN
  return Number.isFinite(n) && n >= 0 && n < max ? n : 'bad'
}

/** Checks a listing someone entered and returns the database row (snake_case). Unknown fields are dropped. */
export function normaliseListing(input: Record<string, unknown>): { row: Record<string, unknown>; errors: Errors } {
  const errors: Errors = {}
  const kind = input.kind === 'rent' ? 'rent' : input.kind === 'sale' ? 'sale' : null
  if (!kind) errors.kind = 'Choose sale or rent.'
  const type = typeof input.propertyType === 'string' && input.propertyType in PROPERTY_TYPES ? input.propertyType : null
  if (!type) errors.propertyType = 'Choose the type of property.'
  const title = str(input.title, 120), locality = str(input.locality, 80), city = str(input.city, 60)
  if (title.length < 3 || title.length > 120) errors.title = 'Give the listing a short title (3–120 characters).'
  if (locality.length < 2 || locality.length > 80) errors.locality = 'Add the locality.'
  if (city.length < 2 || city.length > 60) errors.city = 'Add the city.'
  const opt = (k: string, max: number) => { const v = str(input[k], max); if (v.length > max) errors[k] = `At most ${max} characters.`; return v || null }
  const num = (k: string, max: number, label: string) => { const v = money(input[k], max); if (v === 'bad') { errors[k] = `${label}: enter a number.`; return null } return v }
  const price = num('price', 1e11, 'Price'), rent = num('monthlyRent', 1e9, 'Rent'), deposit = num('deposit', 1e10, 'Deposit')
  const maintenance = num('maintenance', 1e8, 'Maintenance'), area = num('area', 1e7, 'Area')
  if (kind === 'sale' && (rent !== null || deposit !== null)) errors.monthlyRent = 'A listing for sale has a price, not a rent.'
  if (kind === 'rent' && price !== null) errors.price = 'A rental has a monthly rent, not a sale price.'
  const phone = opt('ownerPhone', 24)
  if (phone && !/^\+?[0-9 ()-]{6,24}$/.test(phone)) errors.ownerPhone = 'Owner’s phone: digits, spaces and + only.'
  const email = opt('ownerEmail', 200)
  if (email && !/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) errors.ownerEmail = 'Owner’s e-mail is not valid.'
  const date = typeof input.availableFrom === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(input.availableFrom) ? input.availableFrom : null
  const unit = typeof input.areaUnit === 'string' && (AREA_UNITS as readonly string[]).includes(input.areaUnit) ? input.areaUnit : 'sqft'
  const furnishing = typeof input.furnishing === 'string' && input.furnishing in FURNISHING ? input.furnishing : null
  const status = typeof input.status === 'string' && input.status in LISTING_STATUSES ? input.status : 'available'
  return {
    row: {
      kind, property_type: type, title, locality, city, address: opt('address', 300), bhk: opt('bhk', 10), area, area_unit: unit,
      floor: opt('floor', 20), furnishing, facing: opt('facing', 20), price, monthly_rent: rent, deposit, maintenance,
      available_from: date, description: opt('description', 2000), owner_name: opt('ownerName', 120), owner_phone: phone,
      owner_email: email?.toLowerCase() ?? null, status,
    },
    errors,
  }
}

/** The headline figure: "₹85 L" or "₹32,000/month". */
export function listingPrice(l: Pick<Listing, 'kind' | 'price' | 'monthlyRent'>): string {
  if (l.kind === 'rent') return l.monthlyRent ? `₹${l.monthlyRent.toLocaleString('en-IN')}/month` : 'Rent on request'
  return l.price ? shortInr(l.price) : 'Price on request'
}

export const DEFAULT_SHARE_TEMPLATE = `*{title}*
{type} {kind} in {locality}, {city}
{bhk}{area}
Price: {price}{deposit}
{furnishing}{available}
Call {agent} on {agent_phone} to see it.`

export const SHARE_FIELDS = ['title', 'type', 'kind', 'locality', 'city', 'bhk', 'area', 'price', 'deposit', 'furnishing', 'available', 'agent', 'agent_phone', 'agency'] as const

/** The message an agent shares with a buyer or tenant (WhatsApp). Never contains the owner or the full address. */
export function shareText(template: string, l: Listing, who: { agent: string; agentPhone: string | null; agency: string }): string {
  const values: Record<(typeof SHARE_FIELDS)[number], string> = {
    title: l.title,
    type: PROPERTY_TYPES[l.propertyType],
    kind: l.kind === 'rent' ? 'for rent' : 'for sale',
    locality: l.locality,
    city: l.city,
    bhk: l.bhk ? `${l.bhk} · ` : '',
    area: l.area ? `${Math.round(l.area).toLocaleString('en-IN')} ${l.areaUnit.replace('sqft', 'sq ft').replace('sqyd', 'sq yd')}` : '',
    price: listingPrice(l),
    deposit: l.kind === 'rent' && l.deposit ? ` (deposit ₹${l.deposit.toLocaleString('en-IN')})` : '',
    furnishing: l.furnishing ? `${FURNISHING[l.furnishing]}. ` : '',
    available: l.availableFrom ? `Available from ${new Date(`${l.availableFrom}T00:00:00Z`).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', timeZone: 'UTC' })}.` : '',
    agent: who.agent,
    agent_phone: who.agentPhone ?? '',
    agency: who.agency,
  }
  return template
    .replace(/\{(\w+)\}/g, (m, k: string) => (k in values ? values[k as keyof typeof values] : m))
    .split('\n').map((line) => line.replace(/\s+$/, '').replace(/^ · |^· /, '')).filter((line, i, all) => line !== '' || (i > 0 && all[i - 1] !== '')).join('\n').trim()
}

/** Template checks: known fields only, and a sensible length. */
export function checkTemplate(t: unknown): { value: string; error: string | null } {
  const v = typeof t === 'string' ? t.replace(/\r\n/g, '\n').trim() : ''
  if (v.length < 10) return { value: v, error: 'The message is too short.' }
  if (v.length > 1000) return { value: v, error: 'Keep the message under 1,000 characters (WhatsApp previews cut long ones).' }
  const unknown = [...v.matchAll(/\{(\w+)\}/g)].map((m) => m[1]).filter((k) => !(SHARE_FIELDS as readonly string[]).includes(k))
  if (unknown.length) return { value: v, error: `Not a field: {${unknown[0]}}.` }
  return { value: v, error: null }
}

// ── Matching a buyer or tenant to listings ───────────────────────────────────────────────────────────────────
export interface ListingNeeds {
  req_purpose: 'buy' | 'rent' | null
  budget_min: number | null
  budget_max: number | null
  req_rent_max: number | null
  req_configurations: string[]
  req_categories: string[]
  req_property_types: string[]
  req_locations: string[]
  req_min_area: number | null
  req_max_area: number | null
}

const CATEGORY_TYPES: Record<string, PropertyType[]> = {
  apartments: ['apartment'], villas_gated_communities: ['villa', 'independent_house'], plotted_developments: ['plot', 'land'],
  commercial_sale: ['office', 'shop', 'showroom', 'warehouse', 'co_working'], mixed_use: ['office', 'shop', 'apartment'],
}
const norm = (s: string) => s.toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim()

export function hasListingNeeds(r: ListingNeeds): boolean {
  return !!(r.req_purpose || r.budget_max || r.req_rent_max || r.req_property_types.length || r.req_configurations.length || r.req_locations.length || r.req_categories.length)
}

/** Score out of 100 with reasons, or null when the listing clearly does not fit (wrong purpose, type, BHK, or >10% over budget). */
export function scoreListing(r: ListingNeeds, l: Listing): { score: number; reasons: string[]; gaps: string[] } | null {
  if (l.status !== 'available') return null
  if (r.req_purpose === 'rent' && l.kind !== 'rent') return null
  if (r.req_purpose === 'buy' && l.kind !== 'sale') return null
  const reasons: string[] = [], gaps: string[] = []
  let score = 0
  const types = new Set<string>([...r.req_property_types, ...r.req_categories.flatMap((c) => CATEGORY_TYPES[c] ?? [])])
  if (types.size) { if (!types.has(l.propertyType)) return null; score += 20; reasons.push(PROPERTY_TYPES[l.propertyType]) } else score += 8
  const wanted = r.req_configurations.map(normConfig).filter(Boolean)
  if (wanted.length && l.bhk) { const c = normConfig(l.bhk); if (!c || !wanted.includes(c)) return null; score += 20; reasons.push(c) } else score += 8
  // Money: 35
  const cap = l.kind === 'rent' ? r.req_rent_max : r.budget_max
  const amount = l.kind === 'rent' ? l.monthlyRent : l.price
  if (amount && cap) {
    if (amount > cap * 1.1) return null
    if (amount > cap) { score += 20; gaps.push(l.kind === 'rent' ? `₹${Math.round(amount - cap).toLocaleString('en-IN')}/month over` : `${shortInr(amount - cap)} over budget`) }
    else { score += 35; reasons.push('Within budget') }
  } else score += amount ? 15 : 10
  // Place: 20
  const places = r.req_locations.map(norm).filter(Boolean)
  if (places.length) {
    const where = norm(`${l.locality} ${l.city}`)
    const hit = places.findIndex((p) => where.includes(p) || p.includes(norm(l.locality)))
    if (hit >= 0) { score += 20; reasons.push(r.req_locations[hit].trim()) } else gaps.push('Different area')
  } else score += 8
  // Area: 5
  const minA = r.req_min_area, maxA = r.req_max_area
  if (l.area && l.areaUnit === 'sqft' && (minA || maxA)) {
    if ((!minA || l.area >= minA) && (!maxA || l.area <= maxA)) { score += 5; reasons.push(`${Math.round(l.area).toLocaleString('en-IN')} sq ft`) } else gaps.push('Different size')
  }
  return { score: Math.min(100, score), reasons, gaps }
}

/** A database row into a Listing; the owner is included only when `withOwner`. */
export function listingFromRow(r: Record<string, unknown>, withOwner: boolean): Listing {
  const n = (v: unknown) => (v === null || v === undefined ? null : Number(v))
  const s = (v: unknown) => (typeof v === 'string' && v ? v : null)
  return {
    id: String(r.id), kind: r.kind as ListingKind, propertyType: r.property_type as PropertyType, title: String(r.title),
    locality: String(r.locality), city: String(r.city), address: withOwner ? s(r.address) : null, bhk: s(r.bhk), area: n(r.area),
    areaUnit: (r.area_unit as Listing['areaUnit']) ?? 'sqft', floor: s(r.floor), furnishing: (s(r.furnishing) as Listing['furnishing']) ?? null,
    facing: s(r.facing), price: n(r.price), monthlyRent: n(r.monthly_rent), deposit: n(r.deposit), maintenance: n(r.maintenance),
    availableFrom: s(r.available_from), description: s(r.description), status: r.status as ListingStatus, assignedTo: s(r.assigned_to),
    owner: withOwner ? { name: s(r.owner_name), phone: s(r.owner_phone), email: s(r.owner_email) } : null,
  }
}
