// app/platform/integrations/page.tsx — is RE by PX's central integration set-up complete?
// One central Meta app (Lead Ads + WhatsApp Cloud API) and one Google Cloud app serve every workspace. This page shows
// which platform settings are present (names and yes/no only — never a value), the URLs to register with Meta and
// Google, the steps outside the code, and how many workspaces are connected per provider (counts only, no customer data).
import type { Metadata } from 'next'
import { getConsoleAccess } from '@/lib/auth/platform'
import { can, type StaffRole } from '@/lib/platform/portal'
import { integrationReadiness, integrationUrls } from '@/lib/integrations/readiness'
import { appUrl } from '@/lib/site/urls'
import { createServiceClient } from '@/lib/supabase/server'
import { Alert, Badge, Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui'
import { PageHeader } from '@/components/platform/ConsoleUI'

export const metadata: Metadata = { title: 'Integrations' }
export const dynamic = 'force-dynamic'

const PROVIDER_OF: Record<string, string> = { meta_lead_ads: 'meta_ads', whatsapp_cloud: 'whatsapp_cloud', google_ads: 'google_ads', website: 'website_webhook' }

export default async function PlatformIntegrationsPage() {
  const access = await getConsoleAccess()
  if (access.state !== 'ok') return null
  if (!can(access.role as StaffRole, 'integrations')) return <Alert tone="warning">Only the Platform Owner and platform admins see the integration set-up.</Alert>

  const items = integrationReadiness()
  const urls = integrationUrls(appUrl())
  // Counts only: how many workspaces have each provider connected (no names, no records).
  const { data: rows } = await createServiceClient().from('integration_connections').select('provider, status').eq('status', 'connected')
  const connected = (rows ?? []).reduce<Record<string, number>>((m, r) => ({ ...m, [r.provider]: (m[r.provider] ?? 0) + 1 }), {})

  return (
    <div className="space-y-5">
      <PageHeader title="Integrations" description="RE by PX runs one central Meta app and one Google app for every workspace; customers only authorise their own pages, ad accounts and WhatsApp numbers. Settings are read from the hosting environment — only their names and whether they are set are shown here." />

      <Card>
        <CardHeader><div><CardTitle>Register these URLs</CardTitle><CardDescription>Paste them into the Meta app and the Google Cloud OAuth client.</CardDescription></div></CardHeader>
        <CardContent className="space-y-1.5 text-[13px]">
          {([
            ['Meta OAuth redirect (Facebook Login for Business)', urls.metaOAuthRedirect],
            ['Meta webhook — Page → leadgen', urls.metaLeadWebhook],
            ['Meta webhook — WhatsApp Business Account → messages', urls.whatsappWebhook],
            ['Google OAuth redirect', urls.googleOAuthRedirect],
          ] as const).map(([label, url]) => (
            <p key={label}><span className="text-muted">{label}:</span> <code className="break-all rounded bg-surface-hover px-1.5 py-0.5 text-[12px]">{url}</code></p>
          ))}
        </CardContent>
      </Card>

      {items.map((it) => {
        const provider = PROVIDER_OF[it.key]
        return (
          <Card key={it.key} className={it.ready ? '' : 'border-warning/40'}>
            <CardHeader>
              <div>
                <CardTitle>
                  {it.label}{' '}
                  {it.requirements.length === 0 ? <Badge tone="success">No set-up needed</Badge> : it.ready ? <Badge tone="success">Configured</Badge> : <Badge tone="warning">{it.missing.length} missing</Badge>}
                  {provider && <span className="ml-2 text-[12px] font-normal text-muted">{connected[provider] ?? 0} workspace(s) connected</span>}
                </CardTitle>
              </div>
            </CardHeader>
            <CardContent className="space-y-3 text-[13px]">
              {it.requirements.length > 0 && (
                <ul className="space-y-1">
                  {it.requirements.map((r) => (
                    <li key={r.name} className="flex flex-wrap gap-x-2">
                      <code className="text-[12px]">{r.name}</code>
                      <span className={r.present ? 'text-success' : r.optional ? 'text-muted' : 'text-danger'}>{r.present ? 'set' : r.optional ? 'not set (optional)' : 'missing'}</span>
                      <span className="text-muted">— {r.purpose}</span>
                    </li>
                  ))}
                </ul>
              )}
              {it.outsideSteps.length > 0 && (
                <div>
                  <p className="mb-1 font-medium text-foreground">Outside the code</p>
                  <ol className="list-decimal space-y-0.5 pl-5 text-muted">{it.outsideSteps.map((s) => <li key={s}>{s}</li>)}</ol>
                </div>
              )}
            </CardContent>
          </Card>
        )
      })}
    </div>
  )
}
