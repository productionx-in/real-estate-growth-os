// app/refund-policy/page.tsx — Refund & Cancellation Policy. States only what the product enforces today (manual
// renewals, read-only after expiry, duplicate payments recorded for refund, approval before any refund, credit notes).
// Commercial terms INFYN Group has not decided yet (lib/legal.ts REFUND_TERMS) appear as marked placeholders.
// Not indexed until the company particulars and terms are confirmed.
import type { Metadata } from 'next'
import Link from 'next/link'
import { ContactLine, LegalPage, Pending } from '@/components/legal/LegalPage'
import { LEGAL, REFUND_TERMS, legalEntity } from '@/lib/legal'

export const metadata: Metadata = {
  title: { absolute: `Refund & Cancellation Policy — ${LEGAL.product}` },
  description: `How cancellations, renewals and refunds work for ${LEGAL.product} subscriptions: what happens to your workspace and data, duplicate payments, and how to request a refund.`,
  robots: LEGAL.confirmed ? undefined : { index: false, follow: true },
  alternates: { canonical: '/refund-policy' },
}

const term = (value: string | null, what: string) => value ?? <Pending what={what} />

export default function RefundPolicyPage() {
  return (
    <LegalPage
      title="Refund & Cancellation Policy"
      intro={
        <p>
          This policy explains how you can cancel a {LEGAL.product} subscription, what happens to your workspace and data, and when
          and how {legalEntity()} refunds payments. It forms part of our <Link className="text-[var(--brand)] hover:underline" href="/terms">Terms of Service</Link>.
          A separate signed agreement with us, if any, takes precedence where it differs.
        </p>
      }
      sections={[
        {
          id: 'renewals', title: 'Subscriptions and renewals',
          body: <ul>
            <li>Plans are billed monthly or annually in Indian rupees. GST is shown separately on every invoice.</li>
            <li>Renewals are not charged automatically today: we issue a renewal invoice and you choose whether to pay it.</li>
            <li>
              If we later offer automatic payments (such as UPI AutoPay), they will start only after you authorise a mandate, you will
              be told the amount at least 24 hours before each debit, and you can cancel the mandate at any time from Plan &amp; billing
              in {LEGAL.product} or from your bank or UPI app.
            </li>
            <li>Free trials do not take any payment.</li>
          </ul>,
        },
        {
          id: 'cancel', title: 'Cancelling',
          body: <>
            <ul>
              <li>You can stop at any time by not renewing. Your workspace keeps working until the end of the period you have paid for.</li>
              <li>After a paid period ends without renewal, the workspace keeps working for 7 days, then becomes read-only. Nothing is deleted for non-payment, enquiries from connected sources are still saved, and paying again restores full access.</li>
              <li>Owners and admins can export their data while the workspace is read-only, or ask us to help.</li>
              <li>To close your workspace permanently, contact us; we will confirm the export period before any data is erased.</li>
            </ul>
            <p>Unused part of a paid period: {term(REFUND_TERMS.unusedPeriod, 'whether the unused part of a monthly or annual period is refunded')}.</p>
          </>,
        },
        {
          id: 'refunds', title: 'When we refund',
          body: <ul>
            <li><strong>Duplicate or excess payments:</strong> if you pay the same invoice twice, or pay more than the invoice amount, the extra payment is recorded against your account and refunded in full once verified.</li>
            <li><strong>Payments we cannot apply:</strong> a payment for an invoice that was already cancelled is refunded in full.</li>
            <li><strong>First payment:</strong> {term(REFUND_TERMS.firstPaymentWindow, 'whether a first payment can be refunded within a set period, and how long')}.</li>
            <li><strong>Onboarding or setup fees:</strong> {term(REFUND_TERMS.setupFees, 'whether onboarding or setup fees are refundable')}.</li>
            <li>Any other refund is at our discretion or where the law requires it.</li>
          </ul>,
        },
        {
          id: 'how', title: 'How refunds are made',
          body: <ul>
            <li>Every refund is checked and approved by a member of our finance team other than the person who requested it.</li>
            <li>Refunds are made to the original payment method, through the payment provider that took the payment. We do not refund in cash or to a different account.</li>
            <li>For a refund of an invoiced payment we issue a GST credit note, which you can keep with the original invoice.</li>
            <li>Once we have initiated a refund, the time it takes to reach your account depends on your bank and the payment provider. We will tell you when it is initiated.</li>
          </ul>,
        },
        {
          id: 'request', title: 'Asking for a refund',
          body: <>
            <p>
              Open a case from <strong>Help &amp; support</strong> in your workspace (choose “Billing”), or write to{' '}
              <ContactLine email={LEGAL.supportEmail} what="billing contact email" />. Include the invoice number and the payment
              reference from your bank or UPI app.
            </p>
            <p>We respond within {REFUND_TERMS.responseDays !== null ? `${REFUND_TERMS.responseDays} working days` : <Pending what="number of working days to respond" />}.</p>
            <p>If money left your account but the payment shows as failed, contact us with the reference: we will check it with the payment provider.</p>
          </>,
        },
        {
          id: 'changes', title: 'Changes to this policy',
          body: <p>We will post changes here and update the date above. Changes do not affect payments already made under an earlier version.</p>,
        },
      ]}
    />
  )
}
