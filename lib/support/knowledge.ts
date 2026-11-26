// lib/support/knowledge.ts — everything Rio (the AI guide) is allowed to know about RE, in one document.
// Built only from what RE already publishes: the homepage (FAQ, steps, features, lead sources — kept word for
// word, checked by tests/rio-ai.test.mjs), the package list in lib/marketing/pricing.ts, and how the product works
// (lib/support/guide.ts). Prices appear only once they are published (NEXT_PUBLIC_PRICES_PUBLISHED).
import { PUBLIC_PLANS, PRICES_PUBLISHED, ONBOARDING_FEE_INR, formatInr } from '@/lib/marketing/pricing'
import { GUIDE_ENTRIES } from '@/lib/support/guide'

/** Pages Rio may link to on the website (and from sign-in pages). */
export const WEBSITE_LINKS: Record<string, string> = {
  '/': 'Home', '/features': 'All features', '/pricing': 'Plans', '/demo': 'Book a demo', '/developers': 'For developers',
  '/agencies': 'For agencies', '/integrations': 'Integrations', '/channel-partner-management': 'Channel partner management',
  '/inventory-management': 'Inventory management', '/site-visits-and-bookings': 'Site visits and bookings',
  '/sales-analytics': 'Sales analytics', '/sales-operations': 'Sales operations', '/real-estate-crm': 'Real estate CRM',
  '/migration': 'Moving to RE', '/leakage-audit': 'Lead leakage audit', '/resources': 'Guides',
  '/contact': 'Contact', '/privacy': 'Privacy', '/terms': 'Terms', '/refund-policy': 'Refund policy',
  '/login': 'Sign in', '/account/security': 'Account security',
}
/** Workspace pages ("/{org}/…") Rio may link to inside a workspace. */
export const WORKSPACE_LINKS: Record<string, string> = {
  '': 'Home', '/today': 'Today', '/leads': 'Leads', '/leads/new': 'New lead', '/leads/import': 'Import leads',
  '/inbox': 'WhatsApp inbox', '/visits': 'Site visits', '/projects': 'Projects', '/inventory': 'Inventory',
  '/documents': 'Document templates', '/analytics': 'Analytics', '/team': 'Team', '/partners': 'Partner network',
  '/routing': 'Lead routing', '/speed-to-lead': 'Speed to lead', '/integrations': 'Integrations', '/settings': 'Settings',
  '/billing': 'Plan & billing', '/audit-log': 'Audit log', '/support-access': 'Support access', '/help': 'Help & support',
}

// Homepage content, word for word (tests/rio-ai.test.mjs keeps these in step with app/page.tsx).
const HOME = {
  promise: 'Every lead answered. Every unit accounted for. Every partner on record.',
  summary: 'RE connects lead management, sales teams, projects and property inventory, site visits, bookings and channel partner workflows in one platform — so real estate developers and agencies sell from the same, current picture.',
  sourcesReady: ['Website forms', 'Walk-ins & referrals', 'CSV import', 'Webhooks & API'],
  sourcesWithSetup: ['Meta lead forms', 'Google Ads lead forms', 'WhatsApp Business', '99acres', 'MagicBricks', 'Housing.com'],
  problems: [
    ['Leads wait in five inboxes', 'Facebook, Google, three portals and the website each keep their own list. Someone has to check them all, every hour.'],
    ['“Who is calling this one?”', 'Leads get forwarded to a WhatsApp group. Two people call the same buyer, or nobody does.'],
    ['Follow-ups live in memory', 'The buyer said “call me Thursday”. Thursday is busy. The lead you paid for goes quiet.'],
  ],
  steps: [
    ['Capture', 'Connect your ad accounts, portals and website once. Every enquiry lands in one list, duplicates merged.'],
    ['Route', 'Your rules pick the team — by project, source or campaign — and the next salesperson in a fair rotation.'],
    ['Alert', 'The salesperson is notified the moment the lead is theirs, with the buyer’s details one tap away.'],
    ['Follow up', 'Follow-up reminders keep every promised call on the list, and a lead nobody contacts in time is escalated to a manager. Managers see every lead, who has it and why.'],
  ],
  features: [
    ['Routing rules you can read', 'Plain-language rules like “Skyline Towers leads from Meta go to the Towers desk”. Checked top to bottom.'],
    ['Fair, adjustable rotation', 'Give senior closers a bigger share, cap leads per day, and let people switch themselves off duty for site visits.'],
    ['Returning buyers stay with their salesperson', 'When the same phone number enquires again, it goes back to whoever already knows them.'],
    ['Every assignment explained', 'Managers see which rule fired and why a person was chosen — no more arguments about who got the good leads.'],
    ['Built for developers and channel partners', 'Agencies have their own independent workspace and keep ownership of their buyers. Developers share chosen projects with partner agencies, who register buyers for review.'],
    ['Your data, locked to your company', 'Each company’s data is separated inside the database itself, not just hidden in the app. Inactive users lose access immediately.'],
  ],
  faq: [
    ['How long does setup take?', 'We set it up with you: connect your lead sources, create your teams and routing rules, and import your existing leads. How long it takes depends mainly on how many sources you connect and whether they need third-party approval (Meta, Google, portals).'],
    ['We already use a CRM. Can we move to RE?', 'Yes. We start with an assessment of your current system and a sample of your data, then plan the import of leads and contacts, project and inventory setup, workflows and team onboarding with you. Many teams run RE alongside their current tools during the transition.'],
    ['What does RE include besides lead management?', 'Projects and property inventory with holds and bookings, site visits, channel partner sharing and buyer registration, sales analytics, roles and an audit log — in the same platform as your leads.'],
    ['What happens to a lead when nobody is available?', 'It stays unassigned instead of going to someone who is off duty or over their daily limit, and your managers are notified straight away.'],
    ['Who owns the data?', 'You do. Channel-partner agencies have their own independent workspace and own their leads.'],
  ],
}
export const HOME_CONTENT = HOME

function packages() {
  return PUBLIC_PLANS.map((p) => {
    const price = !PRICES_PUBLISHED ? 'Price: shared by the team in a demo (public prices are not published yet).'
      : p.monthlyInr === null ? 'Price: on request.'
        : `Price: ${formatInr(p.monthlyInr)} a month or ${formatInr(p.annualInr ?? 0)} a year, excluding GST, with ${p.includedUsers} users included and ${formatInr(p.extraUserInr ?? 0)} a month per extra user.`
    return `- ${p.name} — for ${p.audience}. ${price}\n  Includes: ${p.features.filter((f) => !f.soon).map((f) => f.text).join('; ')}.`
  }).join('\n')
}

/** The full knowledge document given to the model. Stable text (no dates), so it caches well. */
export function buildKnowledge(): string {
  const how = GUIDE_ENTRIES.filter((e) => e.contexts.includes('workspace'))
    .map((e) => `- ${e.text} (${e.links.map((l) => `${l.label}: ${l.href}`).join(', ') || 'no link'})`).join('\n')
  return `# RE — product knowledge

## What RE is
${HOME.promise}
${HOME.summary}
Made by Production X. Built for Indian real estate, for developers (builders) and channel-partner agencies (brokers). Set up with you.

## Problems it solves
${HOME.problems.map(([t, b]) => `- ${t}: ${b}`).join('\n')}

## How it works
${HOME.steps.map(([t, b], i) => `${i + 1}. ${t} — ${b}`).join('\n')}

## What makes RE different (say these, never compare by naming other products)
${HOME.features.map(([t, b]) => `- ${t}: ${b}`).join('\n')}
- One platform for the whole sale: leads, sales teams, projects and inventory, site visits, bookings and channel partners, instead of separate tools.
- Set up with you rather than left to self-service: sources connected, teams and routing rules created, existing leads imported.

## Lead sources
Ready to use: ${HOME.sourcesReady.join(', ')}.
Need your own business account or API access first: ${HOME.sourcesWithSetup.join(', ')}. Never say these work without setup.

## Packages
${packages()}
${PRICES_PUBLISHED ? `One-time onboarding: ${formatInr(ONBOARDING_FEE_INR)}, excluding GST.` : 'Do not state or estimate any price, discount or fee: prices are not published yet. Offer a demo or the plans page.'}

## Frequently asked
${HOME.faq.map(([q, a]) => `Q: ${q}\nA: ${a}`).join('\n')}

## Getting started and accounts
- There is no self sign-up: after a demo, RE creates the company's workspace and the admin receives an invitation. The admin then invites the team from Team, each with a role and their own sign-in.
- Forgot password: on the sign-in page choose "Forgot password?" and follow the e-mailed link; if no e-mail arrives, ask the company's RE admin to invite you again.
- Two-step verification uses an authenticator app; set it up under Account security.
- Developers and agencies sign in to separate kinds of workspace; someone in several workspaces chooses one after signing in.

## Data, privacy and support
- Each company's data is separated inside the database. RE staff cannot open a customer's records unless the customer's admin approves time-limited support access, and every such access is logged.
- Inside a workspace, problems are reported from Help & support as a support case; replies arrive on the same page.
- Refunds and cancellation: see the refund policy page.

## Using a workspace (where things are)
${how}
`
}
