// app/privacy/page.tsx — Privacy Policy. Describes what REGrow actually collects and who processes it (kept in
// step with lib/legal.ts and the code). Not indexed until the company particulars are confirmed.
import type { Metadata } from 'next'
import Link from 'next/link'
import { ContactLine, LegalPage } from '@/components/legal/LegalPage'
import { CUSTOMER_CONNECTED_SERVICES, LEGAL, SUBPROCESSORS } from '@/lib/legal'

export const metadata: Metadata = {
  title: { absolute: `Privacy Policy — ${LEGAL.product}` },
  description: `How ${LEGAL.entity} collects, uses and protects personal data in ${LEGAL.product}, the real-estate sales platform, and how to exercise your rights under India’s Digital Personal Data Protection Act, 2023.`,
  robots: LEGAL.confirmed ? undefined : { index: false, follow: true },
}

export default function PrivacyPage() {
  const grievance = LEGAL.grievanceOfficer
  return (
    <LegalPage
      title="Privacy Policy"
      intro={
        <p>
          This policy explains how {LEGAL.entity} (“we”, “us”) handles personal data when you visit the {LEGAL.product} website,
          ask us for a demo, or use {LEGAL.product}, our software for real-estate developers and channel partner agencies. It is
          written to meet India’s Digital Personal Data Protection Act, 2023 (the “DPDP Act”).
        </p>
      }
      sections={[
        {
          id: 'roles', title: 'Our role and our customers’ role',
          body: <>
            <p>
              <strong>For our own website, demo requests and customer accounts</strong>, we decide why and how the data is used, so
              we are the Data Fiduciary.
            </p>
            <p>
              <strong>For data our customers put into {LEGAL.product}</strong> — for example the buyers and enquiries in a
              developer’s or agency’s workspace — the customer decides why it is collected and is the Data Fiduciary. We process it
              only to run the service for that customer, on their instructions, as their Data Processor. If you are a home buyer and
              want to ask about your data, contact the developer or agency you enquired with; we will help them respond.
            </p>
          </>,
        },
        {
          id: 'collect', title: 'What we collect',
          body: <ul>
            <li><strong>Demo requests:</strong> your name, company, work email, mobile number, company type, team size, the tools you use today, approximate lead volume and anything you add in the notes.</li>
            <li><strong>Accounts:</strong> name, email address, optional phone number, the organisations you belong to and your role in each.</li>
            <li><strong>Security and activity records:</strong> sign-in events, and an audit log of important changes in each workspace (for example role changes or exports), so customers can see who did what.</li>
            <li><strong>Billing:</strong> plan, invoices and payment status. Card and UPI details are entered with Razorpay and are not stored by us.</li>
            <li><strong>Lead-leakage audit:</strong> the file you choose is analysed in your browser and is not uploaded to us.</li>
            <li><strong>Cookies and similar storage:</strong> only what the service needs — sign-in cookies, and your appearance (light/dark) choice stored in your browser. We do not use advertising or cross-site tracking cookies.</li>
          </ul>,
        },
        {
          id: 'use', title: 'How we use it',
          body: <ul>
            <li>To respond to demo requests and talk to you about {LEGAL.product} (with your consent, which you give by submitting the form).</li>
            <li>To provide, secure and support the service, including notifications you or your organisation switch on.</li>
            <li>To bill subscriptions and meet our tax and accounting obligations.</li>
            <li>To keep the service safe: preventing abuse, investigating incidents and keeping audit records.</li>
          </ul>,
        },
        {
          id: 'customer-data', title: 'Our customers’ buyer data',
          body: <>
            <p>
              Each customer organisation’s data is kept separate from every other organisation’s, enforced inside the database.
              Data crosses between a developer and an agency only when the agency explicitly registers a buyer with that developer
              and confirms it is authorised to share that buyer’s details.
            </p>
            <p>
              We never sell personal data, and we do not use our customers’ buyer or lead data for our own marketing or for any
              other business of {LEGAL.entity}. Our staff can see a customer’s records only when that customer grants time-limited
              support access, and every such view is recorded in the customer’s audit log.
            </p>
          </>,
        },
        {
          id: 'sharing', title: 'Who we share it with',
          body: <>
            <p>We use these service providers to run {LEGAL.product}. They process data on our behalf under contract:</p>
            <ul>{SUBPROCESSORS.map((s) => <li key={s.name}><strong>{s.name}</strong> — {s.purpose}</li>)}</ul>
            <p>
              These services exchange data with a workspace only if the customer connects them: {CUSTOMER_CONNECTED_SERVICES.join('; ')}.
              Their own privacy terms then also apply.
            </p>
            <p>Some providers may process data outside India, as the DPDP Act permits. We may also disclose data where the law requires it.</p>
          </>,
        },
        {
          id: 'retention', title: 'How long we keep it',
          body: <ul>
            <li>Demo requests: as long as we are in contact, and no longer than needed for that purpose.</li>
            <li>Workspace data: while the organisation’s account is active, and for a limited period after it closes so it can be exported or restored, after which it is erased.</li>
            <li>Invoices, payment records and records we must keep by law: for the periods Indian tax and company law require, with restricted access.</li>
            <li>Backups are overwritten on a rolling cycle, so erased data leaves backups when they expire.</li>
          </ul>,
        },
        {
          id: 'security', title: 'How we protect it',
          body: <p>
            Data is encrypted in transit; access is controlled by organisation and role on our servers and in the database; former
            team members lose access as soon as they are deactivated; and administrative and support actions are logged. No system
            is perfectly secure; if a breach affects your personal data, we will notify you and the Data Protection Board as the
            DPDP Act requires.
          </p>,
        },
        {
          id: 'rights', title: 'Your rights',
          body: <>
            <p>
              Under the DPDP Act you can ask for a summary of your personal data we process, ask us to correct, complete or erase it,
              withdraw consent you have given, nominate someone to act for you, and raise a grievance. Write to us at{' '}
              <ContactLine email={LEGAL.privacyEmail} />. We may need to confirm your identity first. If we process your data for one
              of our customers, we will pass your request to them.
            </p>
            <p>If you are not satisfied with our response, you may complain to the Data Protection Board of India.</p>
          </>,
        },
        {
          id: 'grievance', title: 'Grievance officer',
          body: grievance
            ? <p>{grievance.name}, {LEGAL.entity}. Email: <a className="text-[var(--brand)] hover:underline" href={`mailto:${grievance.email}`}>{grievance.email}</a>{LEGAL.registeredAddress ? `. ${LEGAL.registeredAddress}` : ''}.</p>
            : <p>The name and contact details of our grievance officer will be published here.</p>,
        },
        {
          id: 'children', title: 'Children',
          body: <p>{LEGAL.product} is a business service and is not meant for anyone under 18. We do not knowingly collect children’s data.</p>,
        },
        {
          id: 'changes', title: 'Changes to this policy',
          body: <p>We will post changes here and update the date above; for significant changes we will also tell customers by email or in the product. See also our <Link className="text-[var(--brand)] hover:underline" href="/terms">Terms of Service</Link>.</p>,
        },
      ]}
    />
  )
}
