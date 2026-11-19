// app/terms/page.tsx — Terms of Service. Commercial terms mirror what the product enforces (docs/product/
// COMMERCIAL_RULES.md, DEC-022). Not indexed until the company particulars are confirmed.
import type { Metadata } from 'next'
import Link from 'next/link'
import { ContactLine, LegalPage, Pending } from '@/components/legal/LegalPage'
import { LEGAL, legalEntity } from '@/lib/legal'

export const metadata: Metadata = {
  title: { absolute: `Terms of Service — ${LEGAL.product}` },
  description: `The terms on which ${legalEntity()} provides ${LEGAL.product}, the real-estate sales platform for developers and channel partner agencies: accounts, subscriptions, acceptable use, data and liability.`,
  robots: LEGAL.confirmed ? undefined : { index: false, follow: true },
  alternates: { canonical: '/terms' },
}

export default function TermsPage() {
  return (
    <LegalPage
      title="Terms of Service"
      intro={
        <p>
          These terms are an agreement between {legalEntity()} (“we”) and the organisation that uses {LEGAL.product} (“you”,
          the “customer”). By creating or using a workspace, you accept them on behalf of your organisation. A separate signed
          agreement with us, if any, takes precedence where it differs.
        </p>
      }
      sections={[
        {
          id: 'service', title: 'The service',
          body: <p>
            {LEGAL.product} is software for managing real-estate enquiries, follow-ups, site visits, inventory and bookings, and for
            developers and channel partner agencies to work together. Features that depend on third parties — such as Meta, Google,
            WhatsApp or property portals — work only once you connect your own account and the third party allows it.
          </p>,
        },
        {
          id: 'accounts', title: 'Workspaces and accounts',
          body: <ul>
            <li>Each organisation has its own workspace, plan and seats. Belonging to more than one organisation does not combine them.</li>
            <li>Each user must have their own login; logins may not be shared. You are responsible for who you invite and for keeping access up to date.</li>
            <li>Owners and admins manage the workspace, its members and its billing.</li>
          </ul>,
        },
        {
          id: 'plans', title: 'Plans, trials and payment',
          body: <ul>
            <li>Prices are in Indian rupees and exclude GST, which is added to every invoice. Current prices are on the <Link className="text-[var(--brand)] hover:underline" href="/pricing">pricing page</Link>.</li>
            <li>A plan includes a number of users; additional users are charged for the rest of the billing period.</li>
            <li>Where a free trial is offered, it lasts for the period and within the limits shown when it starts. When it ends, the workspace becomes read-only until a plan is chosen; nothing is deleted.</li>
            <li>If a paid period ends without renewal, the workspace keeps working for 7 days, then becomes read-only until payment. New enquiries from connected sources continue to be saved.</li>
            <li>Refunds and cancellations follow our <Link className="text-[var(--brand)] hover:underline" href="/refund-policy">Refund &amp; Cancellation Policy</Link>.</li>
          </ul>,
        },
        {
          id: 'use', title: 'Acceptable use',
          body: <>
            <p>You agree that you will:</p>
            <ul>
              <li>collect and use buyers’ personal data lawfully, with any consent required, including under the DPDP Act, 2023;</li>
              <li>follow the rules on commercial calls and messages, including TRAI’s regulations and the platforms’ own policies (for example WhatsApp Business policies);</li>
              <li>register a buyer with a developer only when you are authorised to share that buyer’s details for that purpose;</li>
              <li>not attempt to access another organisation’s data, test the security of the service without our written permission, or overload it.</li>
            </ul>
          </>,
        },
        {
          id: 'data', title: 'Your data',
          body: <>
            <p>
              You own the data you put into {LEGAL.product}. You give us permission to process it only to provide, secure and support
              the service for you, as described in our <Link className="text-[var(--brand)] hover:underline" href="/privacy">Privacy Policy</Link>.
              For buyer data you are the Data Fiduciary and we are your Data Processor.
            </p>
            <p>
              When you register a buyer with a partner developer, the details you submit become part of that developer’s records
              once they accept; you remain responsible for having the right to share them.
            </p>
          </>,
        },
        {
          id: 'ours', title: 'Our responsibilities',
          body: <p>
            We will provide the service with reasonable skill and care, keep each organisation’s data separate, and give our staff
            access to your records only when you grant time-limited support access. Unless agreed in writing, we do not promise any
            particular availability level, and we may change or improve features over time without removing your access to your data.
          </p>,
        },
        {
          id: 'ip', title: 'Intellectual property',
          body: <p>{LEGAL.product}, its software and its content belong to {legalEntity()}. You receive a right to use the service during your subscription; you may not copy, resell or reverse engineer it.</p>,
        },
        {
          id: 'ending', title: 'Ending the service',
          body: <p>
            You may stop using {LEGAL.product} at any time; paid periods run to their end. We may suspend or end access for serious
            or repeated breach of these terms or non-payment, with notice where practical. After a workspace closes you will have a
            reasonable period to export your data before it is erased, except records the law requires us to keep.
          </p>,
        },
        {
          id: 'liability', title: 'Liability',
          body: <p>
            To the extent the law allows, neither party is liable for indirect or consequential loss (such as lost profits or lost
            sales), and our total liability in any 12 months is limited to the fees you paid us for the service in those 12 months.
            Nothing limits liability that cannot be limited by law.
          </p>,
        },
        {
          id: 'law', title: 'Governing law',
          body: <p>
            These terms are governed by the laws of India, and the courts at {LEGAL.jurisdictionCity ?? <Pending what="jurisdiction city" />} have exclusive jurisdiction.
          </p>,
        },
        {
          id: 'contact', title: 'Changes and contact',
          body: <p>
            We will post changes here and tell customers of significant changes in advance. Questions: <ContactLine email={LEGAL.supportEmail} what="contact email" />, or see our <Link className="text-[var(--brand)] hover:underline" href="/contact">contact page</Link>.
          </p>,
        },
      ]}
    />
  )
}
