import { ArticlePage, articleMetadata, type ArticleContent } from '@/components/marketing/ArticlePage'

const a: ArticleContent = {
  path: '/resources/channel-partner-buyer-registration',
  title: 'Channel partner buyer registration: a fair and auditable process',
  description: 'How real estate developers and channel partner agencies can register buyers, settle duplicate claims and protect registrations with clear, written rules.',
  datePublished: '2026-11-19',
  summary:
    'A good buyer registration process has written rules agreed in advance: what counts as a registration, which leads it is checked against, who wins when two partners claim the same buyer (usually the first complete registration), how long an accepted registration is protected, and how the buyer’s consent is recorded. Applying the rules from a time-stamped record — not from memory or messages — is what makes the process fair.',
  sections: [
    {
      heading: 'Why registration disputes happen',
      paragraphs: [
        'Buyers talk to several brokers and often to the developer directly. When the same buyer books, two or three parties can claim to have brought them. Without a shared, time-stamped record, the answer depends on who has the best WhatsApp screenshot, and partner relationships suffer whichever way the decision goes.',
      ],
    },
    {
      heading: 'The rules to agree before the first registration',
      list: [
        'What a complete registration contains: buyer name, mobile number, the project, and the partner’s confirmation that the buyer agreed to be registered.',
        'What it is checked against: the developer’s own open leads and bookings, and other partners’ registrations, across the developer’s projects or for the specific project.',
        'Who wins a conflict: typically the first complete registration submitted.',
        'How long protection lasts once accepted — for example 60 days from acceptance — and what extends it (a site visit, a booking).',
        'Who reviews registrations on the developer side, and how quickly.',
      ],
    },
    {
      heading: 'Running the process day to day',
      paragraphs: [
        'Partners submit registrations as soon as a buyer shows real interest. The developer’s team reviews each one: no conflict — accept; conflict with an existing lead or another partner — apply the agreed rule and record the reason. Both sides should see the status of every registration they are party to.',
        'Record buyer consent. Registering a person’s details with a third party is processing their personal data; a simple recorded confirmation that the buyer agreed protects everyone.',
      ],
    },
    {
      heading: 'What developers should share with partners',
      paragraphs: [
        'Partners sell more accurately with current information: which projects they may sell, and live availability. Decide per project whether partners see availability only or availability with prices, and share live data instead of periodic PDFs.',
      ],
    },
    {
      heading: 'Keeping the partnership healthy',
      list: [
        'Publish the rules and apply them consistently, including to your own sales team.',
        'Review registrations quickly — a slow “accept” feels like a rejection.',
        'Keep every decision and its reason on record.',
        'Let partners keep ownership of their own buyer lists; register only the buyers relevant to your projects.',
      ],
    },
  ],
  related: [
    { href: '/channel-partner-management', label: 'Channel partner management in RE by PX' },
    { href: '/agencies', label: 'RE by PX for channel partner agencies' },
    { href: '/inventory-management', label: 'Sharing live inventory with partners' },
  ],
}

export const metadata = articleMetadata(a)
export default function Page() { return <ArticlePage a={a} /> }
