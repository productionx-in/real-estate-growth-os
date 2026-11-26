# Publishing the legal pages

Pages: `/privacy`, `/terms`, `/refund-policy`, `/contact`. All read their facts from `lib/legal.ts`. Until
`LEGAL.confirmed` is `true` they show a "Draft" notice, render every unknown fact as **[to be confirmed: …]**, send
`noindex`, are left out of the sitemap, and the Organization structured data carries no legal name or contact point.

## What Production X must supply (never guessed in code)

| Field in `lib/legal.ts` | What | Source |
|---|---|---|
| `LEGAL.legalName` | Registered name, exactly as on the certificate of incorporation | MCA records |
| `LEGAL.cin` | Corporate Identification Number | MCA records |
| `LEGAL.registeredAddress` | Registered office address | Certificate of incorporation |
| `LEGAL.privacyEmail` | Mailbox for privacy requests | Must exist and be monitored |
| `LEGAL.supportEmail`, `LEGAL.salesEmail` | Support and sales mailboxes | Must exist and be monitored |
| `LEGAL.phone` | Business phone (Cashfree requires one on the Contact page) | |
| `LEGAL.grievanceOfficer` | Name and email (DPDP Act 2023 / IT Rules) | Appointed person |
| `LEGAL.jurisdictionCity` | Courts with jurisdiction under the Terms | Legal counsel |
| `REFUND_TERMS.unusedPeriod` | Refund of the unused part of a paid period, or "none" | Commercial decision |
| `REFUND_TERMS.firstPaymentWindow` | First-payment refund window, or "none" | Commercial decision |
| `REFUND_TERMS.setupFees` | Whether onboarding/setup fees are refundable | Commercial decision |
| `REFUND_TERMS.responseDays` | Working days to answer a refund request | Operational commitment |

`missingLegalFacts()` lists whatever is still empty.

## To publish

1. Counsel reviews the four pages' text (the draft is written to the product's actual behaviour; it is not legal advice).
2. Fill in the fields above in one PR; set `LEGAL.lastUpdated` to the publication date.
3. Set `LEGAL.confirmed = true` in the same PR. This removes the draft notice, lets search engines index the pages,
   adds them to the sitemap and adds `legalName`/`contactPoint` to the Organization structured data.
4. When Cashfree starts processing customer payments, set its `PENDING_SUBPROCESSORS` entry to `active: true` in the
   same release (the Privacy Policy then lists it).
5. `npm test` (the `legal-pages` suite fails if a page hard-codes an email, phone, CIN, legal suffix or court city).
