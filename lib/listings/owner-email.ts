// lib/listings/owner-email.ts — the e-mails an agency sends a property's owner about their listing (20260095):
//   listed — "your property is now listed with us": what buyers or tenants will see and who is handling it;
//   update — where things stand: the listing's status and the figure it is offered at.
// Pure, so the API, the outbox template (lib/email/templates.ts 'listing.owner') and the tests share one text. Sent
// only by the people who may see the owner (lib/dal/listings.ts canSeeOwner), only to the owner's own address, and
// never more than once a day per message (the outbox idempotency key).
import { COMMERCIAL_TYPES, FURNISHING, LISTING_KINDS, PROPERTY_TYPES, commercialLine, listingPrice, type Listing } from '@/lib/listings/listing'

export const OWNER_EMAILS = {
  listed: { label: 'Your property is listed', hint: 'Tell the owner the listing is live and what buyers or tenants will see.' },
  update: { label: 'Status update', hint: 'Tell the owner where things stand: on offer, on hold, closed or withdrawn.' },
} as const
export type OwnerEmailKind = keyof typeof OWNER_EMAILS

const STATUS_TEXT: Record<Listing['status'], string> = {
  available: 'is on offer and being shown to interested buyers and tenants',
  on_hold: 'is on hold while we finalise terms with an interested party',
  closed: 'is closed — the deal is done. Thank you for trusting us with it',
  withdrawn: 'has been withdrawn, as you asked. It is no longer being offered',
}

/** Why an owner e-mail cannot be sent for this listing now, or null. */
export function ownerEmailBlocker(kind: OwnerEmailKind, l: Pick<Listing, 'status' | 'owner'>): string | null {
  if (!l.owner?.email) return 'Add the owner’s e-mail to the listing first.'
  if (kind === 'listed' && l.status !== 'available') return 'A “listed” e-mail is for a listing that is on offer. Send a status update instead.'
  return null
}

/** Subject and paragraphs (plain text; **bold** only) for an owner e-mail. */
export function ownerEmailContent(kind: OwnerEmailKind, l: Listing, who: { agent: string; agentPhone: string | null; agency: string }): { subject: string; heading: string; paragraphs: string[] } {
  const greet = l.owner?.name ? `Dear ${l.owner.name.split(' ')[0]},` : 'Hello,'
  const what = `${PROPERTY_TYPES[l.propertyType]} ${LISTING_KINDS[l.kind].toLowerCase()} in ${l.locality}, ${l.city}`
  const details = [
    l.bhk, l.area ? `${Math.round(l.area).toLocaleString('en-IN')} ${l.areaUnit.replace('sqft', 'sq ft').replace('sqyd', 'sq yd')}` : null,
    l.furnishing && !COMMERCIAL_TYPES.includes(l.propertyType) ? FURNISHING[l.furnishing] : null, commercialLine(l) || null,
  ].filter(Boolean).join(' · ')
  const contact = `${who.agent}${who.agentPhone ? ` (${who.agentPhone})` : ''}`
  if (kind === 'listed') {
    return {
      subject: `Your property is listed with ${who.agency}`,
      heading: 'Your property is now listed',
      paragraphs: [
        greet,
        `Your property — **${l.title}** — is now listed with ${who.agency} as a ${what}.`,
        `Buyers and tenants will see: ${[details, `offered at ${listingPrice(l)}`].filter(Boolean).join(' · ')}.`,
        'Your name, phone number and full address are kept within our agency and are never shared with them.',
        `${contact} is handling it and will keep you posted. Reply to this e-mail or call if anything should change.`,
      ],
    }
  }
  return {
    subject: `Update on your property: ${l.title}`,
    heading: 'An update on your property',
    paragraphs: [
      greet,
      `Your property — **${l.title}** (${what}) — ${STATUS_TEXT[l.status]}.`,
      ...(l.status === 'available' || l.status === 'on_hold' ? [`It is offered at ${listingPrice(l)}.`] : []),
      `For anything about it, contact ${contact} at ${who.agency}.`,
    ],
  }
}
