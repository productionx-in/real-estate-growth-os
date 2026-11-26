// lib/support/guide.ts — Rio's knowledge: short, true answers about RE with a link to where it's done.
// Answers only state what the product and the website already state (see tests/website-claims.test.mjs);
// anything else hands over to a person. Pure functions, unit-tested in tests/support-bubble.test.mjs.

export type GuideContext = 'website' | 'auth' | 'workspace'
export interface GuideLink { label: string; href: string }
export interface GuideAnswer { id: string; text: string; links: GuideLink[] }
interface Entry { id: string; contexts: GuideContext[]; keys: string[]; text: string; links: GuideLink[]; chip?: string }

// `{org}` is replaced with the workspace slug.
const KB: Entry[] = [
  // ── Website ────────────────────────────────────────────────────────────────────────────────────
  { id: 'what', contexts: ['website', 'auth'], chip: 'What is RE?', keys: ['what is re by px', 'what does re by px', 'what is re ', 'about re by px', 're by px do', 'explain re by px', 'about re', 'production x', 'overview', 'features', 'what can it do', 'real estate crm'],
    text: 'RE brings every lead into one place, gives it to the right salesperson straight away, and tracks follow-ups, site visits, inventory, bookings and channel partners — built for real estate developers and agencies.',
    links: [{ label: 'See all features', href: '/features' }, { label: 'Book a demo', href: '/demo' }] },
  { id: 'demo', contexts: ['website', 'auth'], chip: 'Book a demo', keys: ['demo', 'walkthrough', 'show me', 'call', 'meeting', 'presentation'],
    text: 'A demo is a short call where we show RE on your own lead flow. Leave your details and the team will reach out to fix a time.',
    links: [{ label: 'Book a demo', href: '/demo' }] },
  { id: 'price', contexts: ['website', 'auth'], chip: 'Pricing', keys: ['price', 'pricing', 'cost', 'plan', 'how much', 'subscription', 'charge', 'rate', 'fee', 'package', 'expensive', 'afford', 'budget', 'quote'],
    text: 'Plans and what each includes are on the pricing page. The team confirms the right plan for your team size in the demo.',
    links: [{ label: 'View plans', href: '/pricing' }, { label: 'Book a demo', href: '/demo' }] },
  { id: 'trial', contexts: ['website', 'auth'], chip: 'Can I try it?', keys: ['trial', 'free', 'sign up', 'signup', 'register', 'try', 'create account', 'start'],
    text: 'RE is set up for you rather than by self sign-up: after a short demo we create your workspace and send your admin an invitation, so your data starts clean and private.',
    links: [{ label: 'Book a demo', href: '/demo' }] },
  { id: 'sources', contexts: ['website', 'auth'], chip: 'Where do leads come from?', keys: ['source', 'sources', 'facebook', 'meta', 'google', 'portal', '99acres', 'magicbricks', 'housing', 'integration', 'integrations', 'connect', 'website form', 'import'],
    text: 'Ready to use: website forms, walk-ins and referrals, CSV import, and webhooks/API. With your own business account or API access: Meta lead forms, Google Ads lead forms, WhatsApp Business, 99acres, MagicBricks and Housing.com.',
    links: [{ label: 'Integrations', href: '/integrations' }] },
  { id: 'partners', contexts: ['website', 'auth'], keys: ['channel partner', 'partners', 'broker', 'brokers', 'agent', 'agents', 'cp', 'commission'],
    text: 'Channel partners register buyers with you, you see who brought whom, and deals and commissions are tracked on the record.',
    links: [{ label: 'Channel partner management', href: '/channel-partner-management' }] },
  { id: 'inventory', contexts: ['website', 'auth'], keys: ['inventory', 'unit', 'units', 'tower', 'flat', 'flats', 'availability', 'block', 'hold'],
    text: 'Projects, towers and units with live availability, so sales never sells a unit twice.',
    links: [{ label: 'Inventory management', href: '/inventory-management' }] },
  { id: 'visits', contexts: ['website', 'auth'], keys: ['site visit', 'visits', 'booking', 'bookings'],
    text: 'Schedule site visits, record outcomes and move buyers to booking — with everyone seeing the same picture.',
    links: [{ label: 'Site visits and bookings', href: '/site-visits-and-bookings' }] },
  { id: 'analytics', contexts: ['website', 'auth'], keys: ['report', 'reports', 'analytics', 'dashboard', 'conversion', 'roi'],
    text: 'See response times, conversion by source and how each salesperson is doing.',
    links: [{ label: 'Sales analytics', href: '/sales-analytics' }] },
  { id: 'migrate', contexts: ['website', 'auth'], keys: ['migrate', 'migration', 'switch', 'move from', 'excel', 'sheet', 'spreadsheet', 'existing crm'],
    text: 'You can bring your existing leads across from spreadsheets or another CRM with a CSV import, and we help map the columns.',
    links: [{ label: 'Moving to RE', href: '/migration' }] },
  { id: 'who', contexts: ['website', 'auth'], keys: ['developer', 'developers', 'agency', 'agencies', 'builder', 'builders', 'who is it for'],
    text: 'RE has a workspace for developers (projects, inventory, sales team, partners) and one for agencies and channel partners (your buyers, your team, the developers you work with).',
    links: [{ label: 'For developers', href: '/developers' }, { label: 'For agencies', href: '/agencies' }] },
  { id: 'different', contexts: ['website', 'auth'], chip: 'Why RE?', keys: ['different', 'difference', 'why re by px', 'why should', 'better', 'compare', 'comparison', 'versus', 'vs', 'unique', 'special', 'alternative', 'competitor', 'other crm', 'advantage', 'benefit'],
    text: 'What sets RE apart: routing rules you can read in plain language; a fair rotation you can tune (bigger share for senior closers, daily caps, off-duty for site visits); returning buyers go back to the salesperson who knows them; managers see why every lead went to whom; agencies keep their own workspace and buyers; and leads, inventory, site visits, bookings and channel partners live in one platform — set up with you.',
    links: [{ label: 'See all features', href: '/features' }, { label: 'Book a demo', href: '/demo' }] },
  { id: 'setup', contexts: ['website', 'auth'], keys: ['setup', 'set up', 'onboarding', 'how long', 'implementation', 'go live', 'get started', 'start using'],
    text: 'We set it up with you: connect your lead sources, create your teams and routing rules, and import your existing leads. How long it takes depends mainly on how many sources you connect and whether they need third-party approval (Meta, Google, portals).',
    links: [{ label: 'Book a demo', href: '/demo' }] },
  { id: 'includes', contexts: ['website', 'auth'], keys: ['include', 'features', 'module', 'modules', 'besides', 'all in one', 'what else', 'capabilit'],
    text: 'Besides lead management: projects and property inventory with holds and bookings, site visits, channel partner sharing and buyer registration, sales analytics, roles and an audit log — in the same platform as your leads.',
    links: [{ label: 'See all features', href: '/features' }] },
  { id: 'unavailable', contexts: ['website', 'auth', 'workspace'], keys: ['nobody available', 'no one available', 'off duty', 'on leave', 'unassigned', 'daily limit'],
    text: 'If nobody is available, the lead stays unassigned instead of going to someone who is off duty or over their daily limit, and your managers are notified straight away.',
    links: [] },
  { id: 'owner', contexts: ['website', 'auth', 'workspace'], keys: ['own the data', 'data owner', 'ownership', 'who owns', 'export'],
    text: 'You own your data. Channel-partner agencies have their own independent workspace and own their leads.',
    links: [{ label: 'Privacy', href: '/privacy' }] },
  { id: 'returning', contexts: ['website', 'auth', 'workspace'], keys: ['duplicate', 'returning buyer', 'same buyer', 'repeat enquiry', 'same number', 'enquires again'],
    text: 'Duplicates are merged, and when the same phone number enquires again it goes back to the salesperson who already knows that buyer.',
    links: [] },
  { id: 'security', contexts: ['website', 'auth', 'workspace'], keys: ['secure', 'security', 'privacy', 'data', 'safe', 'gdpr', 'dpdp', 'who can see'],
    text: 'Each company’s data is kept separate. RE staff cannot open your records unless your admin approves time-limited support access, and every such access is logged.',
    links: [{ label: 'Privacy', href: '/privacy' }] },
  { id: 'leak', contexts: ['website', 'auth'], keys: ['leak', 'leakage', 'losing leads', 'missed leads', 'audit'],
    text: 'The lead leakage audit shows where enquiries slip through today and what that costs.',
    links: [{ label: 'Lead leakage audit', href: '/leakage-audit' }] },
  { id: 'refund', contexts: ['website', 'auth'], keys: ['refund', 'cancel', 'cancellation'],
    text: 'Refunds and cancellation are covered in the refund policy.',
    links: [{ label: 'Refund policy', href: '/refund-policy' }] },

  // ── Sign-in ──────────────────────────────────────────────────────────────────────────────────────
  { id: 'forgot', contexts: ['auth', 'workspace'], chip: 'Forgot password', keys: ['forgot', 'password', 'reset', 'cannot login', "can't login", 'cant login', 'locked'],
    text: 'On the sign-in page choose “Forgot password?”, enter your work e-mail and follow the link we send. If no e-mail arrives, ask your company’s RE admin to invite you again.',
    links: [{ label: 'Go to sign-in', href: '/login' }] },
  { id: 'noaccount', contexts: ['auth'], chip: 'I don’t have an account', keys: ['no account', 'not registered', 'not found', "don't have", 'dont have', 'invite', 'invitation', 'access'],
    text: 'Accounts are created by invitation: your company’s RE owner or admin adds you from Team, and you get a link to set your password. If your company isn’t on RE yet, book a demo.',
    links: [{ label: 'Book a demo', href: '/demo' }] },
  { id: 'twostep', contexts: ['auth', 'workspace'], keys: ['two step', '2fa', 'authenticator', 'otp', 'code', 'mfa'],
    text: 'Two-step verification uses an authenticator app (Google Authenticator, Microsoft Authenticator…). Set it up under Account security; if you lost your phone, ask your admin or RE support.',
    links: [{ label: 'Account security', href: '/account/security' }] },

  // ── Workspace ────────────────────────────────────────────────────────────────────────────────────
  { id: 'w-import', contexts: ['workspace'], chip: 'Import my leads', keys: ['import', 'upload', 'csv', 'excel', 'bulk', 'spreadsheet'],
    text: 'Leads → Import lets you upload a CSV or Excel file, match the columns and check duplicates before anything is saved.',
    links: [{ label: 'Import leads', href: '/{org}/leads/import' }] },
  { id: 'w-add', contexts: ['workspace'], keys: ['add lead', 'new lead', 'create lead', 'walk in', 'walk-in', 'enter lead'],
    text: 'Add a single lead — a walk-in or a referral — from Leads → New lead.',
    links: [{ label: 'New lead', href: '/{org}/leads/new' }] },
  { id: 'w-connect', contexts: ['workspace'], chip: 'Connect Facebook / portals', keys: ['connect', 'facebook', 'meta', 'google', 'portal', '99acres', 'magicbricks', 'housing', 'website form', 'webhook', 'api', 'integration', 'integrations'],
    text: 'Integrations is where owners and admins connect lead sources: website forms and webhooks work straight away; Meta, Google Ads, WhatsApp Business and portals need your own business account or API access.',
    links: [{ label: 'Integrations', href: '/{org}/integrations' }] },
  { id: 'w-team', contexts: ['workspace'], chip: 'Add my team', keys: ['team', 'invite', 'add user', 'salesperson', 'salespeople', 'people', 'staff', 'employee', 'colleague', 'user', 'member', 'seat', 'role', 'login for'],
    text: 'Owners and admins invite people from Team and choose their role. Each person gets their own sign-in; seats follow your plan.',
    links: [{ label: 'Team', href: '/{org}/team' }] },
  { id: 'w-routing', contexts: ['workspace'], keys: ['assign', 'assignment', 'routing', 'round robin', 'rotation', 'distribute', 'auto assign'],
    text: 'Lead routing decides who gets each new lead — by rotation, project or source. Owners and admins set it under Lead routing.',
    links: [{ label: 'Lead routing', href: '/{org}/routing' }] },
  { id: 'w-whatsapp', contexts: ['workspace'], keys: ['whatsapp', 'message', 'messages', 'template', 'chat'],
    text: 'The WhatsApp inbox shows conversations with your leads once WhatsApp Business is connected under Integrations.',
    links: [{ label: 'WhatsApp inbox', href: '/{org}/inbox' }, { label: 'Integrations', href: '/{org}/integrations' }] },
  { id: 'w-today', contexts: ['workspace'], chip: 'What should I do today?', keys: ['today', 'follow up', 'follow-up', 'followup', 'reminder', 'reminders', 'tasks', 'overdue'],
    text: 'Today lists your follow-ups due and overdue, newest leads first — work it top to bottom.',
    links: [{ label: 'Today', href: '/{org}/today' }] },
  { id: 'w-speed', contexts: ['workspace'], keys: ['speed', 'response time', 'first response', 'escalate', 'escalation', 'sla'],
    text: 'Speed to lead shows how fast new leads get a first response and escalates the ones left waiting.',
    links: [{ label: 'Speed to lead', href: '/{org}/speed-to-lead' }] },
  { id: 'w-visits', contexts: ['workspace'], keys: ['site visit', 'visits', 'schedule visit'],
    text: 'Plan and record site visits under Site visits; the outcome goes back on the lead.',
    links: [{ label: 'Site visits', href: '/{org}/visits' }] },
  { id: 'w-inventory', contexts: ['workspace'], keys: ['project', 'projects', 'inventory', 'unit', 'units', 'tower', 'availability', 'block'],
    text: 'Projects holds your towers and units; Inventory shows live availability and holds.',
    links: [{ label: 'Projects', href: '/{org}/projects' }, { label: 'Inventory', href: '/{org}/inventory' }] },
  { id: 'w-partners', contexts: ['workspace'], keys: ['partner', 'partners', 'channel partner', 'broker', 'agent', 'commission'],
    text: 'The Partner network is where you work with channel partners: registrations, who brought which buyer, deals and commissions.',
    links: [{ label: 'Partner network', href: '/{org}/partners' }] },
  { id: 'w-docs', contexts: ['workspace'], keys: ['document', 'documents', 'brochure', 'cost sheet', 'pdf', 'share'],
    text: 'Document templates let you share brochures and cost sheets with buyers through a private link.',
    links: [{ label: 'Document templates', href: '/{org}/documents' }] },
  { id: 'w-reports', contexts: ['workspace'], keys: ['report', 'reports', 'analytics', 'dashboard', 'conversion', 'performance'],
    text: 'Analytics shows leads by source, response times, conversion and each person’s results.',
    links: [{ label: 'Analytics', href: '/{org}/analytics' }] },
  { id: 'w-billing', contexts: ['workspace'], keys: ['bill', 'billing', 'invoice', 'invoices', 'payment', 'pay', 'renew', 'plan', 'upgrade', 'gst'],
    text: 'Plan & billing shows your plan, seats, invoices and renewal. Owners can pay or change the plan there.',
    links: [{ label: 'Plan & billing', href: '/{org}/billing' }] },
  { id: 'w-access', contexts: ['workspace'], keys: ['support access', 'give access', 'allow support', 'grant'],
    text: 'If RE support needs to look at your records, your admin approves it under Support access — it is time-limited and logged.',
    links: [{ label: 'Support access', href: '/{org}/support-access' }] },
  { id: 'w-problem', contexts: ['workspace'], chip: 'Report a problem', keys: ['problem', 'issue', 'bug', 'error', 'not working', 'broken', 'help', 'support', 'complaint', 'ticket'],
    text: 'Open a support case from Help & support — describe what happened and our team replies there. You can follow every reply on the same page.',
    links: [{ label: 'Open a support case', href: '/{org}/help' }] },
  { id: 'human', contexts: ['website', 'auth', 'workspace'], keys: ['human', 'person', 'talk to', 'speak', 'real person', 'call me', 'contact', 'phone', 'number', 'email'],
    text: 'Happy to hand you to a person — use one of the options below.',
    links: [] },
]

/** Lower-case words with simple English endings removed, so "prices", "pricing" and "price" all match. */
const stem = (w: string) => (w.length <= 3 ? w : w.replace(/ies$/, 'y').replace(/(ing|es|s)$/, '').replace(/e$/, ''))
const norm = (s: string) => ` ${s.toLowerCase().replace(/[’']/g, "'").replace(/[^a-z0-9' ]+/g, ' ').trim().split(/\s+/).map(stem).join(' ')} `

/** Best answer for a question in this context, or null when nothing matches well enough. */
export function answer(question: string, context: GuideContext, orgSlug?: string): GuideAnswer | null {
  const q = norm(question)
  if (q.trim().length < 2) return null
  let best: { e: Entry; score: number } | null = null
  for (const e of KB) {
    if (!e.contexts.includes(context)) continue
    let score = 0
    for (const k of e.keys) if (q.includes(norm(k))) score += k.includes(' ') ? 3 : 2 // phrases outrank words
    if (score > (best?.score ?? 0)) best = { e, score }
  }
  return best ? resolve(best.e, orgSlug) : null
}

function resolve(e: Entry, orgSlug?: string): GuideAnswer {
  return { id: e.id, text: e.text, links: e.links.map((l) => ({ ...l, href: l.href.replace('{org}', orgSlug ?? '') })).filter((l) => !l.href.startsWith('//') && !l.href.includes('{org}')) }
}

/** Starter questions, tuned to where the person is. */
export function suggestions(context: GuideContext, pathname = '/'): string[] {
  const chipOf = (id: string) => KB.find((e) => e.id === id)?.chip
  const pick = (...ids: string[]) => ids.map(chipOf).filter(Boolean) as string[]
  if (context === 'auth') return pick('forgot', 'noaccount', 'what', 'different', 'price')
  if (context === 'workspace') {
    if (/\/leads/.test(pathname)) return pick('w-import', 'w-connect', 'w-today', 'w-problem')
    if (/\/(team|settings|routing)/.test(pathname)) return pick('w-team', 'w-connect', 'w-problem', 'w-today')
    return pick('w-today', 'w-import', 'w-team', 'w-connect', 'w-problem')
  }
  if (/\/pricing/.test(pathname)) return pick('price', 'different', 'trial', 'demo')
  if (/\/demo/.test(pathname)) return pick('demo', 'trial', 'what', 'price')
  return pick('what', 'different', 'sources', 'price', 'demo')
}

/** Answer a starter chip exactly. */
export function answerChip(chip: string, context: GuideContext, orgSlug?: string): GuideAnswer | null {
  const e = KB.find((x) => x.chip === chip && x.contexts.includes(context))
  return e ? resolve(e, orgSlug) : null
}

export const GUIDE_ENTRIES = KB
