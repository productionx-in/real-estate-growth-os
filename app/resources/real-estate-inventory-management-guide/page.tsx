import { ArticlePage, articleMetadata, type ArticleContent } from '@/components/marketing/ArticlePage'

const a: ArticleContent = {
  path: '/resources/real-estate-inventory-management-guide',
  title: 'Real estate inventory management: a practical guide for developers',
  description: 'How developers can structure projects, record units, control holds and bookings, share availability with channel partners and keep an audit trail.',
  datePublished: '2026-11-19',
  summary:
    'Good inventory management means one record of every unit, structured the way the project is built, with a small set of statuses (available, on hold, blocked, booked, sold), controlled rules for moving between them, holds that expire, deliberate decisions about who sees prices, and a history of every change. The goal is simple: nobody ever sells or quotes a unit that is not available.',
  sections: [
    {
      heading: 'Why spreadsheets break as a project sells',
      paragraphs: [
        'Most projects start with an inventory sheet. It works while one person updates it. Once several salespeople, a sales manager, a CRM team and channel partners all need availability, copies multiply: a partner works from last week’s PDF, a salesperson holds a unit “verbally”, and two buyers are shown the same flat.',
        'The cost is not only the awkward phone call. Double-quoted units damage trust with buyers and partners, and unreleased holds keep good units off the market during the weeks when demand is highest.',
      ],
    },
    {
      heading: 'Step 1: structure inventory the way the project is built',
      paragraphs: [
        'Model the project as it is sold: phases, then towers or blocks, then floors, then units for apartments; phases, streets or clusters, then plots for plotted developments. A consistent structure makes it easy to answer the questions buyers and managers actually ask — “what is left on floors 10 to 15 of Tower B?” — and to report absorption by tower or phase.',
      ],
    },
    {
      heading: 'Step 2: record the attributes buyers compare',
      list: [
        'Unit number and position (tower, floor) — unique within the project.',
        'Configuration: 1, 2, 2.5, 3 BHK and so on, or office/retail type for commercial units.',
        'Areas: carpet area (the figure RERA requires you to quote), built-up and super built-up where you use them; plot area and dimensions for plots.',
        'Facing, corner position, road width, parking, balconies and furnishing where relevant.',
        'Price, and the basis on which it is calculated.',
      ],
    },
    {
      heading: 'Step 3: use a small set of statuses with controlled transitions',
      paragraphs: [
        'Five statuses cover almost every developer: available, on hold (reserved for a specific buyer for a short time), blocked (withheld by management — for example for a landowner share or a price revision), booked and sold. What matters more than the names is the rules between them: a booked unit should not return to available without a cancellation, and every change should record who made it and why.',
      ],
    },
    {
      heading: 'Step 4: make holds expire',
      paragraphs: [
        'A hold is a promise to one buyer that blocks every other buyer. Record the token amount and an expiry date with every hold, and review expiring holds daily. When a hold expires without conversion, the unit returns to the market; when it converts, the booking replaces the hold. Holds without expiries are the single most common reason good units sit unsold.',
      ],
    },
    {
      heading: 'Step 5: decide what channel partners see',
      paragraphs: [
        'Partners sell faster with current availability, but not every developer wants to publish prices to every broker. Decide per project: no inventory, availability only, or availability with prices. Share live availability rather than periodic PDFs, so partners stop pitching sold units.',
      ],
    },
    {
      heading: 'Step 6: report absorption and keep the history',
      paragraphs: [
        'Track the share of units booked or sold per project, tower and configuration over time. It shows which configurations are moving, where pricing needs attention and how a launch is performing. Keep the full history of status changes: it settles disputes and is the record auditors and management will ask for.',
      ],
    },
    {
      heading: 'A checklist before your next launch',
      list: [
        'Is there exactly one source of availability that everyone uses?',
        'Can every unit be found by tower, floor and configuration?',
        'Does every hold have an expiry and an owner?',
        'Can a booked unit only become available again through a recorded cancellation?',
        'Have you decided what partners see for each project?',
        'Can you report absorption by project and configuration without building a sheet?',
      ],
    },
  ],
  related: [
    { href: '/inventory-management', label: 'REGrow inventory management' },
    { href: '/site-visits-and-bookings', label: 'Holds and bookings in REGrow' },
    { href: '/channel-partner-management', label: 'Sharing inventory with channel partners' },
  ],
}

export const metadata = articleMetadata(a)
export default function Page() { return <ArticlePage a={a} /> }
