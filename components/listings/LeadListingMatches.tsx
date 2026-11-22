'use client'
// components/listings/LeadListingMatches.tsx — on a lead's page in an agency: available listings that fit what the
// buyer or tenant wants (lib/listings/listing.ts scoreListing), each with a one-tap WhatsApp message to this lead
// using the agency's share template. The owner's details are never in the message (the server never sends them here).
import { MessageCircle } from 'lucide-react'
import { Badge } from '@/components/ui'
import { LISTING_KINDS, PROPERTY_TYPES, listingPrice, shareText, type Listing } from '@/lib/listings/listing'

export function LeadListingMatches({ matches, leadPhone, template, me, agency, hasNeeds, listingsHref }: {
  matches: { listing: Listing; match: { score: number; reasons: string[]; gaps: string[] } }[]
  leadPhone: string | null
  template: string
  me: { name: string; phone: string | null }
  agency: string
  /** The lead has told us something to match on. */
  hasNeeds: boolean
  listingsHref: string
}) {
  const digits = (leadPhone ?? '').replace(/\D/g, '')
  const wa = digits.length === 10 ? `91${digits}` : digits
  return (
    <section aria-labelledby="listing-matches" className="rounded-lg border border-default bg-surface p-5">
      <h2 id="listing-matches" className="mb-3 text-[13px] font-semibold text-foreground">Matching listings</h2>
      {!hasNeeds ? (
        <p className="text-[12px] text-muted">Add what they are looking for — buy or rent, budget, type, area — under “Looking for” to see matching listings.</p>
      ) : matches.length === 0 ? (
        <p className="text-[12px] text-muted">No available listing fits yet. <a href={listingsHref} className="text-brand underline">See all listings</a></p>
      ) : (
        <ul className="space-y-2">
          {matches.map(({ listing: l, match }) => {
            const text = shareText(template, l, { agent: me.name, agentPhone: me.phone, agency })
            return (
              <li key={l.id} className="rounded-md border border-default p-3">
                <div className="flex items-start justify-between gap-2">
                  <div className="min-w-0">
                    <p className="truncate text-[13px] font-medium text-foreground">{l.title}</p>
                    <p className="text-[12px] text-muted">{PROPERTY_TYPES[l.propertyType]} · {l.locality} · {listingPrice(l)}</p>
                  </div>
                  <Badge tone={l.kind === 'rent' ? 'warning' : undefined}>{LISTING_KINDS[l.kind]}</Badge>
                </div>
                <p className="mt-1 text-[11px] text-muted">
                  <span className="font-semibold tabular-nums text-foreground">{match.score}</span>/100 · {match.reasons.join(' · ')}{match.gaps.length ? <span className="text-warning"> · {match.gaps.join(' · ')}</span> : null}
                </p>
                {wa && (
                  <a href={`https://wa.me/${wa}?text=${encodeURIComponent(text)}`} target="_blank" rel="noopener noreferrer"
                    className="mt-2 inline-flex min-h-8 items-center gap-1.5 rounded-md border border-default px-2.5 text-[12px] font-medium text-foreground hover:bg-surface-hover">
                    <MessageCircle aria-hidden className="size-3.5" /> Send on WhatsApp
                  </a>
                )}
              </li>
            )
          })}
        </ul>
      )}
    </section>
  )
}
