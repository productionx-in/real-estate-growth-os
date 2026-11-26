import { ArticlePage, articleMetadata, type ArticleContent } from '@/components/marketing/ArticlePage'

const a: ArticleContent = {
  path: '/resources/real-estate-lead-response-time',
  title: 'Real estate lead response time: why it matters and how to measure it',
  description: 'How to measure speed to lead in a real estate sales team, where the time is lost between enquiry and first call, and practical ways to shorten it.',
  datePublished: '2026-11-19',
  summary:
    'Speed to lead is the time between a buyer’s enquiry and the first real contact from a salesperson. Measure it in three parts — enquiry to receipt, receipt to assignment, assignment to first contact — because each has a different cause and a different fix. Most delay is in assignment (leads waiting to be forwarded) and in first contact (no reminder, no escalation).',
  sections: [
    {
      heading: 'Why response time matters in property sales',
      paragraphs: [
        'A buyer who submits an enquiry is usually comparing several projects at the same time. The salesperson who reaches them while they are still thinking about the search has the best chance of booking the site visit. Every hour of delay gives another project the first conversation.',
        'Lead cost makes the point sharper: if a campaign lead costs several hundred rupees, a lead nobody calls in time is money spent for nothing.',
      ],
    },
    {
      heading: 'Measure it in three parts',
      list: [
        'Enquiry to receipt: how long the lead takes to reach your system from the ad platform, portal or website. Manual downloads from portals and ad accounts are the usual cause of delay.',
        'Receipt to assignment: how long a lead waits before it has an owner. Forwarding leads by hand or in WhatsApp groups adds hours, especially evenings and weekends.',
        'Assignment to first contact: how long the owner takes to call. This depends on alerts, workload, on-duty status and whether anyone notices when a lead is missed.',
      ],
    },
    {
      heading: 'Where the time goes, and the fixes',
      paragraphs: [
        'Connect lead sources so enquiries arrive as they are submitted, rather than in daily downloads. Assign automatically with rules by project and source and a fair rotation, skipping people who are off duty or at their daily limit. Alert the salesperson the moment a lead is theirs, with the buyer’s details one tap away. Escalate to a manager when a lead is not contacted within the time you set.',
      ],
    },
    {
      heading: 'Set a target and review it weekly',
      paragraphs: [
        'Pick a target your team can own — for example, a share of new leads contacted within a set number of minutes during working hours — and review it weekly by team and salesperson. Look at the slowest leads, not just the average: one weekend batch of uncalled leads can hide behind a healthy average.',
      ],
    },
    {
      heading: 'Start with your own data',
      paragraphs: [
        'Most CRMs and spreadsheets record when a lead was created and when it was first contacted. An export of the last one to three months is enough to see your current response time and how many leads were never called.',
      ],
    },
  ],
  related: [
    { href: '/sales-operations', label: 'Lead distribution and escalation in RE by PX' },
    { href: '/sales-analytics', label: 'Speed-to-lead reporting' },
    { href: '/leakage-audit', label: 'Free lead-leakage audit from your export' },
  ],
}

export const metadata = articleMetadata(a)
export default function Page() { return <ArticlePage a={a} /> }
