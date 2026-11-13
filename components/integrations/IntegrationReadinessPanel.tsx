// components/integrations/IntegrationReadinessPanel.tsx
'use client'

import { useState } from 'react'
import {
  Layers,
  ShieldCheck,
  Radio,
  FileCode2,
  Workflow,
  CheckCircle2,
  AlertCircle,
} from 'lucide-react'

interface ProviderItem {
  id: string
  name: string
  category: string
  status: string
  badgeColor: string
  description: string
  routingCapabilities: string[]
  verifiedRequirements: string
  proposedArchitecture: string
  futureStage4Requirements: string
}

const PROVIDERS: ProviderItem[] = [
  {
    id: 'meta_ads',
    name: 'Meta Lead Ads (Facebook & Instagram)',
    category: 'Paid Social Ads',
    status: 'Not Connected (Readiness Mode)',
    badgeColor: 'bg-amber-50 text-amber-700 border-amber-200',
    description:
      'Configured for real-time webhook ingestion of lead generation form submissions from Facebook Pages and Instagram Business accounts.',
    routingCapabilities: ['Campaign ID Mapping', 'Lead Form ID Mapping', 'Account Default Project'],
    verifiedRequirements:
      'Requires Facebook App Secret HMAC-SHA256 signature verification via X-Hub-Signature-256 header and GET webhook challenge handshake (hub.mode, hub.verify_token, hub.challenge).',
    proposedArchitecture:
      'Deterministic SHA-256 idempotency on external leadgen_id; external Vault credential reference; non-destructive duplicate tagging.',
    futureStage4Requirements:
      'Live Meta App registration, Page Access Token exchange, webhook subscription to leadgen topic, and secure secret resolution.',
  },
  {
    id: 'google_ads',
    name: 'Google Ads (Lead Form Submissions)',
    category: 'Search & Display Ads',
    status: 'Not Connected (Readiness Mode)',
    badgeColor: 'bg-amber-50 text-amber-700 border-amber-200',
    description:
      'Configured to receive lead form extension payloads from Google Search, Display, Discovery, and YouTube campaigns.',
    routingCapabilities: ['Campaign ID Mapping', 'Google Form ID Mapping', 'Account Default Project'],
    verifiedRequirements:
      'Requires webhook URL with key parameter verification; Google sends lead_id, form_id, campaign_id and user_column_data in JSON payload over HTTPS.',
    proposedArchitecture:
      'Matches campaign_id and form_id against integration_project_mappings; resolves lead fields to standard schema; captures Google click ID (gclid).',
    futureStage4Requirements:
      'Google Ads Developer Token, production webhook URL generation with per-account webhook key, and CRM lead delivery webhook activation.',
  },
  {
    id: 'website_webhook',
    name: 'Website Enquiry Forms & Microsites',
    category: 'First-Party Web',
    status: 'Not Connected (Readiness Mode)',
    badgeColor: 'bg-blue-50 text-blue-700 border-blue-200',
    description:
      'Inbound REST ingestion endpoint for official developer websites, project landing pages, and interactive floor plan enquiry widgets.',
    routingCapabilities: ['Project Slug / ID Mapping', 'Landing Page URL Mapping', 'UTM Source Tracking'],
    verifiedRequirements:
      'Standardized REST endpoint contract with per-organization API Key and optional HMAC SHA-256 signature header.',
    proposedArchitecture:
      'Strict server-side validation using InboundLeadPayload schema; direct project attribution; E.164 phone normalization.',
    futureStage4Requirements:
      'Public webhook intake route (/api/webhooks/enquiries/[orgSlug]) with rate limiting, origin allowlisting, and anti-spam verification.',
  },
  {
    id: 'whatsapp_cloud',
    name: 'WhatsApp Business Cloud API',
    category: 'Direct Messaging',
    status: 'Not Connected (Readiness Mode)',
    badgeColor: 'bg-emerald-50 text-emerald-700 border-emerald-200',
    description:
      'Engineered for incoming click-to-WhatsApp ad leads, catalogue enquiries, and inbound customer conversations via Meta Cloud API.',
    routingCapabilities: ['Phone Number Mapping', 'Initial Keyword / Campaign Mapping', 'Default Project'],
    verifiedRequirements:
      'Meta Graph API Webhook contract; requires verification token handshake and X-Hub-Signature-256 verification with System User Token.',
    proposedArchitecture:
      'Extracts customer profile name, normalized phone (+91/E.164), and conversation timestamp; maps to internal project via keyword/number.',
    futureStage4Requirements:
      'WhatsApp Business Account (WABA) registration, approved messaging templates, and durable webhook ingestion worker.',
  },
  {
    id: 'property_portals',
    name: 'Property Portals (99acres, Magicbricks, Housing.com)',
    category: 'Real Estate Aggregators',
    status: 'Not Connected (Readiness Mode)',
    badgeColor: 'bg-purple-50 text-purple-700 border-purple-200',
    description:
      'Prepared for aggregator lead feed webhooks and server-to-server pull sync once developer enterprise agreements are established.',
    routingCapabilities: ['Portal Project / Listing ID Mapping', 'Portal Category Mapping', 'Org Default'],
    verifiedRequirements:
      'Varies by portal: typically requires static IP allowlisting, portal developer API key, and XML/JSON webhook or scheduled pull sync.',
    proposedArchitecture:
      'Adapter pattern per portal normalizing proprietary payloads into canonical InboundLeadPayload; isolates channel partner vs developer feeds.',
    futureStage4Requirements:
      'Direct developer portal API enterprise agreements, OAuth/API token setup, and scheduled poller daemons.',
  },
]

export function IntegrationReadinessPanel() {
  const [selectedProvider, setSelectedProvider] = useState<string>('meta_ads')
  const activeProvider = PROVIDERS.find((p) => p.id === selectedProvider) ?? PROVIDERS[0]

  return (
    <div className="bg-[var(--surface)] border border-[var(--border)] rounded-xl p-5 shadow-2xs space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b border-[var(--border)] pb-4">
        <div>
          <div className="flex items-center gap-2">
            <Layers className="w-4 h-4 text-[var(--brand)]" />
            <h2 className="text-[14px] font-semibold text-[var(--foreground)]">
              CRM Lead Source & Integration Readiness
            </h2>
          </div>
          <p className="text-[12px] text-[var(--foreground-muted)] mt-1">
            Stage 3G architectural foundation: multi-account routing, non-destructive deduplication,
            and tenant isolation.
          </p>
        </div>
        <div className="flex items-center gap-2">
          <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-[11px] font-medium bg-amber-50 text-amber-800 border border-amber-200">
            <Radio className="w-3 h-3 text-amber-600 animate-pulse" />
            Readiness Mode
          </span>
        </div>
      </div>

      {/* Architecture Principles Notice */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
        <div className="p-3 bg-[var(--surface-hover)] border border-[var(--border)] rounded-lg space-y-1">
          <div className="flex items-center gap-1.5 text-[12px] font-semibold text-[var(--foreground)]">
            <ShieldCheck className="w-3.5 h-3.5 text-emerald-600" />
            Non-Destructive Deduplication
          </div>
          <p className="text-[11px] text-[var(--foreground-muted)] leading-relaxed">
            Existing leads are never overwritten or merged. Distinguishes event replays, same-project duplicates,
            and multi-project enquiries.
          </p>
        </div>

        <div className="p-3 bg-[var(--surface-hover)] border border-[var(--border)] rounded-lg space-y-1">
          <div className="flex items-center gap-1.5 text-[12px] font-semibold text-[var(--foreground)]">
            <Workflow className="w-3.5 h-3.5 text-blue-600" />
            Multi-Account Project Routing
          </div>
          <p className="text-[11px] text-[var(--foreground-muted)] leading-relaxed">
            Each ad account maps specific campaigns and forms to internal projects. Unmapped leads
            remain unassigned.
          </p>
        </div>

        <div className="p-3 bg-[var(--surface-hover)] border border-[var(--border)] rounded-lg space-y-1">
          <div className="flex items-center gap-1.5 text-[12px] font-semibold text-[var(--foreground)]">
            <FileCode2 className="w-3.5 h-3.5 text-purple-600" />
            Vault Credential References
          </div>
          <p className="text-[11px] text-[var(--foreground-muted)] leading-relaxed">
            No plaintext tokens or secrets in database tables. Connections reference isolated KMS
            or Secret Manager credentials.
          </p>
        </div>
      </div>

      {/* Provider Tabs */}
      <div className="space-y-4">
        <h3 className="text-[12px] font-semibold text-[var(--foreground)] uppercase tracking-wider">
          Integration Providers Architecture
        </h3>

        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-2.5">
          {PROVIDERS.map((provider) => {
            const isSelected = provider.id === selectedProvider
            return (
              <button
                key={provider.id}
                type="button"
                onClick={() => setSelectedProvider(provider.id)}
                className={`text-left p-3.5 rounded-lg border transition-all ${
                  isSelected
                    ? 'bg-blue-50/40 border-[var(--brand)] ring-1 ring-[var(--brand)]'
                    : 'bg-[var(--surface)] border-[var(--border)] hover:bg-[var(--surface-hover)]'
                }`}
              >
                <div className="flex items-start justify-between gap-2">
                  <div className="text-[12px] font-medium text-[var(--foreground)] leading-snug">
                    {provider.name}
                  </div>
                </div>
                <div className="mt-2 flex items-center justify-between text-[11px]">
                  <span className="text-[var(--foreground-muted)]">{provider.category}</span>
                  <span
                    className={`inline-flex items-center px-1.5 py-0.5 rounded text-[10px] font-medium border ${provider.badgeColor}`}
                  >
                    {provider.status.split(' ')[0]}
                  </span>
                </div>
              </button>
            )
          })}
        </div>

        {/* Selected Provider Specification Detail */}
        <div className="border border-[var(--border)] rounded-lg p-4 bg-[var(--surface-hover)] space-y-4">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 border-b border-[var(--border)] pb-3">
            <div>
              <h4 className="text-[13px] font-semibold text-[var(--foreground)]">
                {activeProvider.name}
              </h4>
              <p className="text-[12px] text-[var(--foreground-muted)] mt-0.5">
                {activeProvider.description}
              </p>
            </div>
            <span
              className={`inline-flex items-center self-start sm:self-center px-2 py-0.5 rounded text-[11px] font-medium border ${activeProvider.badgeColor}`}
            >
              {activeProvider.status}
            </span>
          </div>

          <div className="space-y-3 text-[12px]">
            <div>
              <span className="font-semibold text-[var(--foreground)] block mb-1">
                Routing & Mapping Capabilities:
              </span>
              <ul className="grid grid-cols-1 sm:grid-cols-3 gap-2">
                {activeProvider.routingCapabilities.map((cap, i) => (
                  <li key={i} className="flex items-center gap-1.5 text-[var(--foreground-muted)] bg-[var(--surface)] p-2 rounded border border-[var(--border)]">
                    <CheckCircle2 className="w-3.5 h-3.5 text-emerald-600 flex-shrink-0" />
                    <span>{cap}</span>
                  </li>
                ))}
              </ul>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-3 gap-3 pt-2">
              <div className="p-3 bg-[var(--surface)] rounded border border-[var(--border)] space-y-1">
                <span className="text-[11px] font-semibold text-blue-700 block uppercase">
                  1. Verified Provider Contract
                </span>
                <p className="text-[11px] text-[var(--foreground-muted)] leading-relaxed">
                  {activeProvider.verifiedRequirements}
                </p>
              </div>

              <div className="p-3 bg-[var(--surface)] rounded border border-[var(--border)] space-y-1">
                <span className="text-[11px] font-semibold text-emerald-700 block uppercase">
                  2. Proposed OS Architecture
                </span>
                <p className="text-[11px] text-[var(--foreground-muted)] leading-relaxed">
                  {activeProvider.proposedArchitecture}
                </p>
              </div>

              <div className="p-3 bg-[var(--surface)] rounded border border-[var(--border)] space-y-1">
                <span className="text-[11px] font-semibold text-amber-700 block uppercase">
                  3. Future Stage 4 Requirements
                </span>
                <p className="text-[11px] text-[var(--foreground-muted)] leading-relaxed">
                  {activeProvider.futureStage4Requirements}
                </p>
              </div>
            </div>
          </div>

          <div className="pt-2 border-t border-[var(--border)] flex items-center justify-between text-[11px] text-[var(--foreground-muted)]">
            <span className="flex items-center gap-1">
              <AlertCircle className="w-3.5 h-3.5 text-amber-600" />
              All live network bindings and credential storage are deferred to Stage 4.
            </span>
            <span className="text-[var(--foreground-subtle)] font-mono">Stage 3G Architectural Readiness</span>
          </div>
        </div>
      </div>
    </div>
  )
}
