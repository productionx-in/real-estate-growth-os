// lib/documents/library.ts — built-in document templates a workspace can start from (Documents → "Start from a
// template"). Each one is copied into the workspace's own templates when picked, so editing never changes this list.
//
// Shaped on common Indian practice:
//   * cost sheets: base price on RERA carpet area, then builder charges (PLC, parking, club), then government charges
//     (GST, stamp duty, registration) — stamp duty and registration differ by state, so they are left "as applicable";
//   * allotment letters: the particulars state RERA pro formas ask for (unit, carpet area, price, payment plan,
//     cancellation, governing law) — marked as a draft for the company's legal review;
//   * payment demands: the milestone reached, the amount due and where to pay (construction-linked plans).
// Blanks ("________") are for the salesperson to fill in on the "Edit before sharing" step.
import type { TemplateKind } from '@/lib/documents/kinds'

export interface LibraryTemplate {
  key: string
  name: string
  kind: TemplateKind
  /** Who it suits: a developer selling its own project, an agency (channel partner), or both. */
  audience: 'developer' | 'channel_partner' | 'both'
  summary: string
  body: string
}

const SIGNATURE = `For **{{org.legal_name}}**

{{org.signatory_name}}
{{org.signatory_title}}`

export const LIBRARY: LibraryTemplate[] = [
  {
    key: 'cost_sheet_detailed',
    name: 'Cost sheet',
    kind: 'cost_sheet',
    audience: 'both',
    summary: 'Unit details, price breakup, government charges and the total, valid for 15 days.',
    body: `# Cost sheet — {{project.name}}

Prepared for **{{lead.name}}** on {{today}} · Valid until {{valid_until}}

## Unit
| Detail | Value |
|---|---|
| Project | {{project.name}}, {{project.location}} |
| Unit | {{unit.number}}, {{unit.tower}}, floor {{unit.floor}} |
| Configuration | {{unit.configuration}}, {{unit.facing}} facing |
| Carpet area (RERA) | {{unit.carpet_area}} |
| Super built-up area | {{unit.super_area}} |
| Car parking | {{unit.parking}} |
| Rate | {{unit.base_rate}} |

## Price
{{unit.price_breakup}}

**Total agreement value: {{unit.total_price}}**

## Government charges (paid at registration)
| Charge | Amount |
|---|---|
| Stamp duty | As per {{project.city}} rates on the agreement value |
| Registration | As per state rates |

## Notes
- Prices are as on {{today}} and may change until a booking is confirmed.
- GST is charged at the rate in force on the date of each payment.
- Carpet area is as defined under the Real Estate (Regulation and Development) Act, 2016.
- Project RERA registration: {{project.rera_number}}.

Questions? Call {{agent.name}} on {{agent.phone}}.`,
  },
  {
    key: 'quotation',
    name: 'Price quotation',
    kind: 'quotation',
    audience: 'both',
    summary: 'A short offer for one unit with the price and how to book.',
    body: `# Quotation

**Ref:** ________ · **Date:** {{today}}

Dear {{lead.name}},

Thank you for your interest in **{{project.name}}**, {{project.location}}. As discussed, here is our offer for the unit below.

| Detail | Value |
|---|---|
| Unit | {{unit.number}}, {{unit.tower}} |
| Configuration | {{unit.configuration}} |
| Carpet area (RERA) | {{unit.carpet_area}} |
| Offer price | {{unit.total_price}} |

{{unit.price_breakup}}

## To book
- Booking amount: ________
- Documents: PAN card, Aadhaar card and two photographs of each applicant.
- This offer is valid until {{valid_until}}.

Your contact: {{agent.name}}, {{agent.phone}}

${SIGNATURE}`,
  },
  {
    key: 'booking_confirmation',
    name: 'Booking confirmation',
    kind: 'booking',
    audience: 'developer',
    summary: 'Confirms the booking amount received and the next steps to the agreement.',
    body: `# Booking confirmation

**Date:** {{today}}

Dear {{lead.name}},

We are pleased to confirm your booking at **{{project.name}}**.

| Detail | Value |
|---|---|
| Unit | {{unit.number}}, {{unit.tower}}, floor {{unit.floor}} |
| Configuration | {{unit.configuration}} |
| Carpet area (RERA) | {{unit.carpet_area}} |
| Agreement value | {{unit.total_price}} |
| Booking amount received | ________ |
| Payment reference | ________ |

## Next steps
- Allotment letter: within ________ days.
- Agreement for sale: to be registered within ________ days of allotment.
- Your relationship manager: {{agent.name}}, {{agent.phone}}.

Project RERA registration: {{project.rera_number}}.

${SIGNATURE}`,
  },
  {
    key: 'allotment_letter',
    name: 'Allotment letter (draft)',
    kind: 'allotment',
    audience: 'developer',
    summary: 'The particulars RERA pro formas ask for. Have your legal team review before first use.',
    body: `# Allotment letter

**Allotment no.:** ________ · **Date:** {{today}}

To: **{{lead.name}}** · {{lead.phone}} · {{lead.email}}

Sub: Allotment of unit {{unit.number}} in **{{project.name}}** (RERA registration {{project.rera_number}})

Dear {{lead.name}},

With reference to your application and booking, we are pleased to allot you the unit described below, subject to the terms of the Agreement for Sale to be executed and registered.

## Particulars of the unit
| Particular | Detail |
|---|---|
| Unit number | {{unit.number}} |
| Tower / block | {{unit.tower}} |
| Floor | {{unit.floor}} |
| Type | {{unit.configuration}} |
| Carpet area (as per RERA) | {{unit.carpet_area}} |
| Covered car parking | {{unit.parking}} |

## Consideration
{{unit.price_breakup}}

**Total consideration: {{unit.total_price}}** (GST as applicable; stamp duty and registration are payable by the allottee).

## Payment plan
Payments are due as per the payment plan annexed to the Agreement for Sale. Interest on delayed payment is as prescribed under the RERA rules of the state.

## Cancellation
If the allottee cancels, the amount refundable is as set out in the Agreement for Sale and the applicable RERA rules.

This letter is governed by the laws of India.

${SIGNATURE}

Accepted by the allottee: ________ (signature) · Date: ________`,
  },
  {
    key: 'payment_demand',
    name: 'Payment demand (construction-linked)',
    kind: 'demand',
    audience: 'developer',
    summary: 'Asks for the instalment due on reaching a construction milestone, with bank details.',
    body: `# Payment demand

**Demand no.:** ________ · **Date:** {{today}}

Dear {{lead.name}},

Unit **{{unit.number}}**, {{unit.tower}}, **{{project.name}}**

We are happy to inform you that the following construction milestone has been completed: **________**.

As per your payment plan, the instalment below is now due.

| Item | Amount |
|---|---|
| Instalment (________% of agreement value) | ________ |
| GST | ________ |
| **Amount due** | **________** |

Please pay by **________**. Interest on delayed payment applies as per your Agreement for Sale.

## Where to pay
{{org.bank_details}}

Please quote your unit number in the payment reference. If your home loan bank pays this instalment, forward this letter to them.

Questions? {{agent.name}}, {{agent.phone}}.

${SIGNATURE}`,
  },
  {
    key: 'site_visit_confirmation',
    name: 'Site visit confirmation',
    kind: 'letter',
    audience: 'both',
    summary: 'Confirms the visit time, the address and who will meet the buyer.',
    body: `# Your site visit

Dear {{lead.name}},

Thank you for scheduling a visit to **{{project.name}}**.

| | |
|---|---|
| Date and time | ________ |
| Address | {{project.location}}, {{project.city}} |
| Your host | {{agent.name}}, {{agent.phone}} |

## Good to bring
- A photo ID for the site entry.
- Anyone who will be part of the decision.

Running late or need to change the time? Call {{agent.name}} on {{agent.phone}}.

{{org.name}}`,
  },
  {
    key: 'welcome_letter',
    name: 'Welcome to the family',
    kind: 'letter',
    audience: 'developer',
    summary: 'A warm welcome after booking, with who to contact for what.',
    body: `# Welcome to {{project.name}}

Dear {{lead.name}},

Congratulations on your new home, unit **{{unit.number}}** at **{{project.name}}**. Thank you for choosing {{org.name}}.

## Who to contact
| For | Contact |
|---|---|
| Your booking and documents | {{agent.name}}, {{agent.phone}} |
| Payments and receipts | {{org.phone}} · {{org.email}} |

We will keep you updated on construction progress and every milestone.

${SIGNATURE}`,
  },
  {
    key: 'agency_shortlist',
    name: 'Property shortlist (agency)',
    kind: 'quotation',
    audience: 'channel_partner',
    summary: 'For agencies: the shortlisted unit, its price and the visit plan, on your letterhead.',
    body: `# Your property shortlist

Prepared for **{{lead.name}}** by {{agent.name}}, {{org.name}} · {{today}}

## Recommended for you
| Detail | Value |
|---|---|
| Project | {{project.name}}, {{project.location}}, {{project.city}} |
| Unit | {{unit.number}}, {{unit.tower}} |
| Configuration | {{unit.configuration}}, {{unit.facing}} facing |
| Carpet area (RERA) | {{unit.carpet_area}} |
| Price | {{unit.total_price}} |

{{unit.price_breakup}}

Developer's RERA registration: {{project.rera_number}}. Our agent registration: {{org.rera_number}}.

## Next step
A site visit on ________. We arrange the visit and accompany you.

{{agent.name}} · {{agent.phone}} · {{org.name}}`,
  },
  {
    key: 'agency_buyer_registration',
    name: 'Buyer registration to developer (agency)',
    kind: 'letter',
    audience: 'channel_partner',
    summary: 'For agencies: registers your buyer with the developer so the booking is credited to you.',
    body: `# Buyer registration

**Date:** {{today}}

To: The Sales Team, ________ (developer)

Sub: Registration of our client for **{{project.name}}**

We introduce our client for your project and request that this registration be recorded against our agency.

| Detail | Value |
|---|---|
| Client | {{lead.name}} |
| Phone | {{lead.phone}} |
| Interested in | {{unit.configuration}} at {{project.name}} |
| Introduced by | {{agent.name}}, {{agent.phone}} |
| Our RERA agent registration | {{org.rera_number}} |
| Our GSTIN | {{org.gstin}} |

Please confirm this registration by reply.

${SIGNATURE}`,
  },
]

/** The templates that suit this kind of workspace, best fits first. */
export function libraryFor(orgType: 'developer' | 'channel_partner'): LibraryTemplate[] {
  const fits = (t: LibraryTemplate) => t.audience === 'both' || t.audience === orgType
  return [...LIBRARY.filter((t) => fits(t) && t.audience === orgType), ...LIBRARY.filter((t) => t.audience === 'both')]
}
