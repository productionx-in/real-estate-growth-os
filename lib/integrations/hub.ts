// lib/integrations/hub.ts — the Integrations dashboard (components/integrations/IntegrationHub.tsx): one card per service
// with a plain status — Connected, Not connected, Action required, or Coming soon (REGrow has not finished setting the
// service up on its side yet). Pure: built from the workspace's connections, verified domains, and the platform's
// yes/no readiness (never a setting's value).
export type HubStatus = 'connected' | 'not_connected' | 'action_required' | 'coming_soon'
export type HubKey = 'meta' | 'whatsapp' | 'website' | 'email' | 'google' | 'portals'

export interface HubCard { key: HubKey; title: string; emoji: string; blurb: string; status: HubStatus; detail: string; cta: string }
export interface HubInput {
  connections: { provider: string; status: string }[]
  domains: { purpose: 'website' | 'email'; domain: string; status: 'pending' | 'verified' }[]
  ready: { meta_lead_ads: boolean; whatsapp_cloud: boolean; google_ads: boolean }
}

export const STATUS_LABEL: Record<HubStatus, { label: string; emoji: string }> = {
  connected: { label: 'Connected', emoji: '✅' },
  not_connected: { label: 'Not connected', emoji: '⚪' },
  action_required: { label: 'Action required', emoji: '⚠️' },
  coming_soon: { label: 'Coming soon', emoji: '🕒' },
}

const count = (n: number, one: string, many = `${one}s`) => `${n} ${n === 1 ? one : many}`

export function hubCards(i: HubInput): HubCard[] {
  const of = (p: string | ((x: string) => boolean)) => i.connections.filter((c) => (typeof p === 'string' ? c.provider === p : p(c.provider)))
  const status = (list: { status: string }[], ready = true): HubStatus =>
    list.some((c) => c.status === 'error') ? 'action_required' : list.some((c) => c.status === 'connected') ? 'connected' : !ready ? 'coming_soon' : 'not_connected'

  const meta = of('meta_ads'), wa = of('whatsapp_cloud'), site = of('website_webhook'), google = of('google_ads'), portals = of((p) => p.startsWith('property_portal_'))
  const siteDomains = i.domains.filter((d) => d.purpose === 'website'), mail = i.domains.filter((d) => d.purpose === 'email')
  const metaN = meta.filter((c) => c.status === 'connected').length, waN = wa.filter((c) => c.status === 'connected').length
  const siteStatus: HubStatus = site.some((c) => c.status === 'error') ? 'action_required'
    : site.some((c) => c.status === 'connected') ? (siteDomains.some((d) => d.status === 'pending') ? 'action_required' : 'connected')
    : siteDomains.length ? 'action_required' : 'not_connected'
  const mailStatus: HubStatus = mail.some((d) => d.status === 'verified') ? 'connected' : mail.length ? 'action_required' : 'not_connected'

  return [
    { key: 'meta', title: 'Facebook & Instagram leads', emoji: '📣', blurb: 'Sign in with Facebook and pick your Pages. Leads from your ad forms arrive here instantly.',
      status: status(meta, i.ready.meta_lead_ads), detail: metaN ? `${count(metaN, 'account')} connected` : meta.length ? 'Sign in again to reconnect' : i.ready.meta_lead_ads ? 'Takes about a minute' : 'REGrow is finishing the Facebook setup', cta: metaN ? 'Manage' : 'Connect with Facebook' },
    { key: 'whatsapp', title: 'WhatsApp Business', emoji: '💬', blurb: 'Sign in with your WhatsApp Business account. Chats and new enquiries come into your inbox.',
      status: status(wa, i.ready.whatsapp_cloud), detail: waN ? `${count(waN, 'number')} connected` : i.ready.whatsapp_cloud ? 'Takes about two minutes' : 'REGrow is finishing the WhatsApp setup', cta: waN ? 'Add another number' : 'Connect WhatsApp' },
    { key: 'website', title: 'Your website', emoji: '🌐', blurb: 'Add one line to your site, or use our ready-made form. Enquiries arrive with where they came from.',
      status: siteStatus, detail: siteStatus === 'connected' ? `Receiving enquiries${siteDomains.length ? ` · ${count(siteDomains.length, 'domain')} verified` : ''}` : siteDomains.some((d) => d.status === 'pending') ? 'Finish verifying your domain' : 'No coding needed', cta: siteStatus === 'not_connected' ? 'Connect website' : 'Manage' },
    { key: 'email', title: 'E-mail', emoji: '📧', blurb: 'Send from your own domain, so buyers see your name and replies come to you.',
      status: mailStatus, detail: mailStatus === 'connected' ? mail.filter((d) => d.status === 'verified').map((d) => d.domain).join(', ') : mail.length ? 'Add the DNS records, then check' : 'Two minutes with your domain provider', cta: mail.length ? 'Manage' : 'Connect e-mail' },
    { key: 'google', title: 'Google Ads lead forms', emoji: '🔎', blurb: 'Sign in with Google. Leads from Search, YouTube and Display forms flow in.',
      status: status(google, i.ready.google_ads), detail: google.some((c) => c.status === 'connected') ? 'Connected' : i.ready.google_ads ? 'Takes about a minute' : 'REGrow is finishing the Google setup', cta: google.some((c) => c.status === 'connected') ? 'Manage' : 'Connect with Google' },
    { key: 'portals', title: 'Property portals', emoji: '🏠', blurb: '99acres, MagicBricks and Housing.com enquiries, without copying them by hand.',
      status: status(portals), detail: portals.some((c) => c.status === 'connected') ? `${count(portals.filter((c) => c.status === 'connected').length, 'portal')} connected` : 'Paste the details your portal gives you', cta: portals.length ? 'Manage' : 'Connect a portal' },
  ]
}
