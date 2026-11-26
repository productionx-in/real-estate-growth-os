// app/sales-operations/page.tsx — Real estate sales operations: lead distribution, rotation, follow-up and response time.
import { ProductPage, productMetadata, type ProductPageContent } from '@/components/marketing/ProductPage'

const c: ProductPageContent = {
  path: '/sales-operations',
  metaTitle: 'Real Estate Lead Distribution and Sales Team Management',
  metaDescription:
    'Distribute real estate leads with readable routing rules and fair rotation, alert salespeople instantly, escalate missed follow-ups and measure speed to lead.',
  breadcrumb: 'Sales operations',
  eyebrow: 'Real estate sales operations',
  h1: 'Lead distribution and follow-up your sales managers can trust',
  intro:
    'RE decides who gets each lead with rules your managers can read, shares leads fairly across the team, and makes sure no enquiry waits unanswered — with the numbers to prove it.',
  definition: {
    question: 'What is real estate lead distribution?',
    answer:
      'Lead distribution is how incoming buyer enquiries are assigned to salespeople. Good distribution sends each lead to the right team (by project, source or campaign), shares leads fairly within the team, skips people who are off duty or at their daily limit, returns repeat enquiries to the salesperson who already knows the buyer, and records why each assignment was made.',
  },
  outcomes: [
    { title: 'No forwarding, no arguments', body: 'Assignment happens automatically and every decision is explained: which rule fired and why that person was chosen.' },
    { title: 'Fair and adjustable', body: 'Give senior closers a bigger share, cap leads per day, and let people mark themselves off duty during site visits.' },
    { title: 'Response time you can see', body: 'Speed-to-lead reports show how quickly each lead was received, assigned and first contacted.' },
  ],
  workflow: {
    heading: 'How a lead is distributed',
    steps: [
      { title: 'Rules choose the team', body: 'Rules such as “Skyline Towers leads from Meta go to the Towers desk” are checked top to bottom.' },
      { title: 'Rotation chooses the person', body: 'The next available salesperson in a weighted rotation, skipping anyone off duty or at their daily cap.' },
      { title: 'Returning buyers stay put', body: 'If the phone number has enquired before, the lead goes back to its existing owner.' },
      { title: 'Instant alert', body: 'The salesperson is notified in the app and by push notification.' },
      { title: 'Escalation', body: 'If nobody contacts the lead within the time you set, a manager is alerted.' },
      { title: 'Measured', body: 'Receipt, assignment and first-contact times are recorded for reporting.' },
    ],
  },
  capabilityGroups: [
    { heading: 'Distribution', ids: ['routing_rules', 'rotation', 'returning_buyer', 'assignment_alerts', 'teams'] },
    { heading: 'Follow-up and accountability', ids: ['follow_ups', 'speed_to_lead', 'roles', 'automation'] },
  ],
  faq: [
    { q: 'What happens if nobody is available?', a: 'The lead stays unassigned rather than going to someone who is off duty or over their limit, and managers are notified.' },
    { q: 'Can team leads see their team’s leads?', a: 'Yes. Roles control visibility: salespeople see their own leads, team leads their team’s, and managers and admins everything.' },
    { q: 'Can we change the rules ourselves?', a: 'Yes. Owners and admins edit routing rules and rotation settings in the app; changes apply to new leads immediately.' },
  ],
  related: [
    { href: '/real-estate-crm', label: 'Real estate CRM', body: 'The lead record behind every assignment.' },
    { href: '/sales-analytics', label: 'Sales analytics', body: 'Funnel, sources and response time.' },
    { href: '/resources/real-estate-lead-response-time', label: 'Guide: lead response time', body: 'How to measure and improve speed to lead.' },
  ],
}

export const metadata = productMetadata(c)
export default function Page() { return <ProductPage c={c} /> }
