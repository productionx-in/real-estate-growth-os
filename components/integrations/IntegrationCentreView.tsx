// components/integrations/IntegrationCentreView.tsx
// Customer-facing Integration Centre view for managing marketing channels, Meta connections, and project mappings.
'use client'

import { MAX_WHATSAPP_NUMBERS, numberLabel } from '@/lib/integrations/whatsapp/numbers'
import { useState } from 'react'
import {
  Plug,
  Search,
  Globe,
  MessageCircle,
  Building,
  Code,
  CheckCircle2,
  ShieldCheck,
  Plus,
  RefreshCw,
  Sliders,
} from 'lucide-react'
import { FacebookIcon } from '@/components/icons/FacebookIcon'
import type {
  IntegrationConnectionRecord,
  IntegrationProjectMappingRecord,
  MetaPageAsset,
} from '@/lib/integrations/types'
import { MetaConnectWizardModal } from '@/components/integrations/MetaConnectWizardModal'
import { ConnectionDetailsModal } from '@/components/integrations/ConnectionDetailsModal'
import { WebsiteEnquiryWizardModal } from '@/components/integrations/WebsiteEnquiryWizardModal'
import { WhatsAppWizardModal } from '@/components/integrations/WhatsAppWizardModal'
import { WhatsAppEmbeddedSignup } from '@/components/integrations/WhatsAppEmbeddedSignup'
import { PortalIntegrationModal } from '@/components/integrations/PortalIntegrationModal'
import { DeveloperApiDocsModal } from '@/components/integrations/DeveloperApiDocsModal'

interface ProjectOption {
  id: string
  name: string
  category: string
}

interface IntegrationCentreViewProps {
  org: {
    id: string
    name: string
    slug: string
  }
  initialConnections: (IntegrationConnectionRecord & {
    mappingsCount?: number
    mappings?: IntegrationProjectMappingRecord[]
  })[]
  initialMappings: IntegrationProjectMappingRecord[]
  projects: ProjectOption[]
  canManage: boolean
  schemaAvailable?: boolean
  schemaError?: string | null
}

export function IntegrationCentreView({
  org,
  initialConnections,
  initialMappings,
  projects,
  canManage,
  schemaAvailable = true,
  schemaError = null,
}: IntegrationCentreViewProps) {
  const [connections, setConnections] = useState(initialConnections)
  const [mappings, setMappings] = useState(initialMappings)
  const [isWizardOpen, setIsWizardOpen] = useState(false)
  const [isWebsiteWizardOpen, setIsWebsiteWizardOpen] = useState(false)
  const [isWhatsAppWizardOpen, setIsWhatsAppWizardOpen] = useState(false)
  const [isPortalModalOpen, setIsPortalModalOpen] = useState(false)
  const [isDeveloperApiDocsOpen, setIsDeveloperApiDocsOpen] = useState(false)
  const [selectedConnection, setSelectedConnection] = useState<
    (IntegrationConnectionRecord & { mappings?: IntegrationProjectMappingRecord[] }) | null
  >(null)
  const [isRefreshing, setIsRefreshing] = useState(false)

  // Filter connections by provider and active verified state
  const metaConnections = connections.filter((c) => c.provider === 'meta_ads')
  const activeMetaConnections = metaConnections.filter((c) => c.status === 'connected')
  const websiteConnection = connections.find((c) => c.provider === 'website_webhook')
  const whatsappConnection = connections.find((c) => c.provider === 'whatsapp_cloud')
  // A workspace can connect several WhatsApp numbers (lib/integrations/whatsapp/numbers.ts).
  const whatsappNumbers = connections.filter((c) => c.provider === 'whatsapp_cloud' && c.status === 'connected')
  const activeVerifiedConnections = connections.filter((c) => c.status === 'connected')

  // Refresh data from API
  const refreshData = async () => {
    setIsRefreshing(true)
    try {
      const res = await fetch(`/api/integrations/connections?orgId=${org.id}`)
      if (res.ok) {
        const data = await res.json()
        setConnections(data.connections || [])
      }
      const mapRes = await fetch(`/api/integrations/mappings?orgId=${org.id}`)
      if (mapRes.ok) {
        const mapData = await mapRes.json()
        setMappings(mapData.mappings || [])
      }
    } catch (err) {
      console.error('Failed to refresh integrations data:', err)
    } finally {
      setIsRefreshing(false)
    }
  }

  const formatDate = (isoString?: string | null) => {
    if (!isoString) return 'Never'
    try {
      return new Date(isoString).toLocaleString('en-IN', {
        day: 'numeric',
        month: 'short',
        year: 'numeric',
        hour: '2-digit',
        minute: '2-digit',
      })
    } catch {
      return isoString
    }
  }

  return (
    <div className="max-w-6xl space-y-8 pb-12">
      {/* Schema / Migration Readiness Notice */}
      {!schemaAvailable && (
        <div className="p-4 rounded-2xl bg-warning-bg border border-warning/30 text-warning text-[13px] flex items-start gap-3 shadow-2xs">
          <div className="w-8 h-8 rounded-xl bg-warning-bg text-warning flex items-center justify-center flex-shrink-0 font-bold">
            !
          </div>
          <div>
            <h4 className="font-bold text-warning">Database Schema Notice: Migration 20260015 Pending</h4>
            <p className="text-warning text-[12px] mt-0.5 leading-relaxed">
              The CRM integration tables (`integration_connections` and `integration_project_mappings`)
              have not been applied to this database environment. The Integration Centre is currently
              running in safe architectural preview mode. Database writes will remain deferred until
              Migration 20260015 is officially applied.
              {schemaError && (
                <span className="block mt-1 text-[11px] font-mono text-warning bg-warning-bg/60 p-1.5 rounded border border-warning/30">
                  {schemaError}
                </span>
              )}
            </p>
          </div>
        </div>
      )}

      {/* Top Banner: Central Provider Architecture & Tenant Privacy Guarantee */}
      <div className="bg-gradient-to-r from-blue-500/10 via-indigo-500/10 to-transparent border border-brand/80 rounded-2xl p-6 relative overflow-hidden">
        <div className="flex flex-col md:flex-row items-start md:items-center justify-between gap-4">
          <div className="space-y-1.5 max-w-3xl">
            <div className="flex items-center gap-2">
              <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[11px] font-semibold bg-brand-light text-brand border border-brand/30">
                <ShieldCheck className="w-3.5 h-3.5" />
                Verified Multi-Tenant Lead Pipeline
              </span>
              <span className="text-[12px] text-subtle">•</span>
              <span className="text-[12px] text-muted font-medium">Central Developer App Architecture</span>
            </div>
            <h2 className="text-[18px] font-bold text-foreground">
              Welcome to the Real Estate Integration Centre
            </h2>
            <p className="text-[13px] text-muted leading-relaxed">
              Connect your advertising channels directly to your CRM. REGrow operates a central,
              multi-tenant application architecture (external app registration deferred per DEC-004 &amp; DEC-011).
              Customer leads remain completely private and isolated to <strong>{org.name}</strong>.
            </p>
          </div>

          {canManage && (
            <button
              onClick={() => setIsWizardOpen(true)}
              className="px-4 py-2.5 text-[13px] font-semibold text-brand-foreground bg-brand hover:bg-brand rounded-xl transition-all shadow-sm flex items-center gap-2 flex-shrink-0 cursor-pointer"
            >
              <FacebookIcon className="w-4 h-4" />
              Preview Meta Wizard (App Pending)
            </button>
          )}
        </div>
      </div>

      {/* SECTION 1: ALL 5 MARKETING CHANNELS */}
      <div className="space-y-4">
        <div className="flex items-center justify-between">
          <div>
            <h3 className="text-[16px] font-bold text-foreground">Supported Inbound Channels</h3>
            <p className="text-[12px] text-subtle">
              Overview of all marketing platforms and lead capture channels supported by REGrow.
            </p>
          </div>
          <button
            onClick={refreshData}
            disabled={isRefreshing}
            className="px-3 py-1.5 text-[12px] font-medium text-muted hover:text-foreground bg-surface border border-default rounded-lg hover:bg-surface-muted transition-colors flex items-center gap-1.5 shadow-2xs cursor-pointer"
          >
            <RefreshCw className={`w-3.5 h-3.5 ${isRefreshing ? 'animate-spin' : ''}`} />
            Refresh Status
          </button>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {/* 1. Meta Lead Ads */}
          <div className="bg-surface border border-default rounded-2xl p-5 space-y-4 hover:border-brand/30 transition-all shadow-2xs flex flex-col justify-between">
            <div className="space-y-3">
              <div className="flex items-start justify-between">
                <div className="w-10 h-10 rounded-xl bg-brand-light text-brand flex items-center justify-center shadow-2xs">
                  <FacebookIcon className="w-5 h-5" />
                </div>
                <span
                  className={`inline-flex items-center px-2 py-0.5 rounded-full text-[11px] font-semibold border ${
                    activeMetaConnections.length > 0
                      ? 'bg-success-bg text-success border-success/30'
                      : 'bg-surface-hover text-muted border-default'
                  }`}
                >
                  {activeMetaConnections.length > 0
                    ? `${activeMetaConnections.length} Connected Account${
                        activeMetaConnections.length > 1 ? 's' : ''
                      }`
                    : 'Not Connected'}
                </span>
              </div>

              <div>
                <h4 className="text-[14px] font-bold text-foreground">Meta Lead Ads</h4>
                <p className="text-[11px] text-subtle">Facebook &amp; Instagram Lead Generation</p>
              </div>

              <p className="text-[12px] text-muted leading-relaxed">
                Stream buyer submissions instantly from Facebook &amp; Instagram lead forms directly into
                your development projects.
              </p>

              <div className="space-y-1.5 pt-2 border-t border-default text-[11px] text-subtle">
                <div className="flex justify-between">
                  <span>Implementation:</span>
                  <span className="font-semibold text-foreground">Code Verified (Stage 4B)</span>
                </div>
                <div className="flex justify-between">
                  <span>Provider Setup:</span>
                  <span className="text-warning font-medium">Central Meta App Deferred (DEC-004)</span>
                </div>
                <div className="flex justify-between">
                  <span>Connection Status:</span>
                  <span
                    className={
                      activeMetaConnections.length > 0
                        ? 'text-success font-medium'
                        : 'text-muted font-medium'
                    }
                  >
                    {activeMetaConnections.length > 0
                      ? `${activeMetaConnections.length} Active Account(s)`
                      : 'Not Connected (OAuth Required)'}
                  </span>
                </div>
              </div>
            </div>

            <div className="pt-3">
              {activeMetaConnections.length > 0 ? (
                <button
                  onClick={() => setSelectedConnection(activeMetaConnections[0])}
                  className="w-full py-2 px-3 text-[12px] font-medium text-brand bg-brand-light hover:bg-brand-light border border-brand/30 rounded-xl transition-colors flex items-center justify-center gap-1.5 cursor-pointer"
                >
                  <Sliders className="w-3.5 h-3.5" />
                  Manage Connection &amp; Mappings
                </button>
              ) : canManage ? (
                <button
                  onClick={() => setIsWizardOpen(true)}
                  className="w-full py-2 px-3 text-[12px] font-medium text-brand bg-brand-light hover:bg-brand-light border border-brand/30 rounded-xl transition-colors flex items-center justify-center gap-1.5 cursor-pointer"
                >
                  <Plus className="w-3.5 h-3.5" />
                  Preview Connection Wizard (App Pending)
                </button>
              ) : (
                <div className="text-[11px] text-center text-subtle py-1.5">
                  Manager access required to connect
                </div>
              )}
            </div>
          </div>

          {/* 2. Google Ads */}
          <div className="bg-surface border border-default rounded-2xl p-5 space-y-4 hover:border-strong transition-all shadow-2xs flex flex-col justify-between">
            <div className="space-y-3">
              <div className="flex items-start justify-between">
                <div className="w-10 h-10 rounded-xl bg-warning-bg text-warning flex items-center justify-center shadow-2xs">
                  <Search className="w-5 h-5" />
                </div>
                <span className="inline-flex items-center px-2 py-0.5 rounded-full text-[11px] font-semibold bg-surface-hover text-muted border border-default">
                  Not Connected
                </span>
              </div>

              <div>
                <h4 className="text-[14px] font-bold text-foreground">Google Ads</h4>
                <p className="text-[11px] text-subtle">Search, Display &amp; YouTube Lead Forms</p>
              </div>

              <p className="text-[12px] text-muted leading-relaxed">
                Receive lead form submissions directly from Google Search campaigns, Display ads, and
                Performance Max extensions.
              </p>

              <div className="space-y-1.5 pt-2 border-t border-default text-[11px] text-subtle">
                <div className="flex justify-between">
                  <span>Implementation:</span>
                  <span className="font-semibold text-foreground">Code Verified (Stage 4D)</span>
                </div>
                <div className="flex justify-between">
                  <span>Provider Setup:</span>
                  <span className="text-warning font-medium">Google Cloud Project Pending (DEC-011)</span>
                </div>
                <div className="flex justify-between">
                  <span>Connection Status:</span>
                  <span className="text-muted font-medium">Not Connected • Credentials Pending</span>
                </div>
              </div>
            </div>

            <div className="pt-3">
              <button
                disabled
                className="w-full py-2 px-3 text-[12px] font-medium text-subtle bg-surface-muted border border-default rounded-xl cursor-not-allowed text-center"
              >
                Developer App Registration Pending (Stage 4D)
              </button>
            </div>
          </div>

          {/* 3. Website Enquiry Forms */}
          <div className="bg-surface border border-default rounded-2xl p-5 space-y-4 hover:border-strong transition-all shadow-2xs flex flex-col justify-between">
            <div className="space-y-3">
              <div className="flex items-start justify-between">
                <div className="w-10 h-10 rounded-xl bg-accent-bg text-accent flex items-center justify-center shadow-2xs">
                  <Globe className="w-5 h-5" />
                </div>
                <span
                  className={`inline-flex items-center px-2 py-0.5 rounded-full text-[11px] font-semibold border ${
                    websiteConnection?.status === 'connected'
                      ? 'bg-success-bg text-success border-success/30'
                      : 'bg-surface-hover text-muted border-default'
                  }`}
                >
                  {websiteConnection?.status === 'connected' ? 'Connected' : 'Not Connected'}
                </span>
              </div>

              <div>
                <h4 className="text-[14px] font-bold text-foreground">Website Enquiries</h4>
                <p className="text-[11px] text-subtle">Project Microsites &amp; Interactive Floorplans</p>
              </div>

              <p className="text-[12px] text-muted leading-relaxed">
                Connect official developer websites, project landing pages, and interactive floorplan
                widgets with built-in anti-spam &amp; honeypot traps.
              </p>

              <div className="space-y-1.5 pt-2 border-t border-default text-[11px] text-subtle">
                <div className="flex justify-between">
                  <span>Implementation:</span>
                  <span className="font-semibold text-success">Code Verified (Stage 4E)</span>
                </div>
                <div className="flex justify-between">
                  <span>Provider Setup:</span>
                  <span className="text-success font-medium">SaaS Native REST &amp; Embed Runtime</span>
                </div>
                <div className="flex justify-between">
                  <span>Connection Status:</span>
                  <span
                    className={
                      websiteConnection?.status === 'connected'
                        ? 'text-success font-medium'
                        : 'text-muted font-medium'
                    }
                  >
                    {websiteConnection?.status === 'connected' ? 'Active & Receiving' : 'Not Connected'}
                  </span>
                </div>
              </div>
            </div>

            <div className="pt-3">
              <button
                onClick={() => setIsWebsiteWizardOpen(true)}
                disabled={!canManage}
                className="w-full py-2 px-3 text-[12px] font-semibold text-accent bg-accent-bg hover:bg-accent-bg border border-accent-border rounded-xl transition cursor-pointer text-center"
              >
                Configure &amp; Embed Forms
              </button>
            </div>
          </div>

          {/* 4. WhatsApp Business */}
          <div className="bg-surface border border-default rounded-2xl p-5 space-y-4 hover:border-strong transition-all shadow-2xs flex flex-col justify-between">
            <div className="space-y-3">
              <div className="flex items-start justify-between">
                <div className="w-10 h-10 rounded-xl bg-success-bg text-success flex items-center justify-center shadow-2xs">
                  <MessageCircle className="w-5 h-5" />
                </div>
                <span
                  className={`inline-flex items-center px-2 py-0.5 rounded-full text-[11px] font-semibold ${
                    whatsappNumbers.length > 0
                      ? 'bg-success-bg text-success border border-success/30'
                      : 'bg-surface-hover text-muted border border-default'
                  }`}
                >
                  {whatsappNumbers.length > 1 ? `${whatsappNumbers.length} numbers` : whatsappNumbers.length ? 'Connected' : 'Not Connected'}
                </span>
              </div>

              <div>
                <h4 className="text-[14px] font-bold text-foreground">WhatsApp Business</h4>
                <p className="text-[11px] text-subtle">Click-to-WhatsApp Ads &amp; Catalogues</p>
              </div>

              <p className="text-[12px] text-muted leading-relaxed">
                Capture prospective home buyers who reach out via Click-to-WhatsApp ads or property
                brochure download chats.
              </p>

              <div className="space-y-1.5 pt-2 border-t border-default text-[11px] text-subtle">
                {whatsappNumbers.length === 0 ? (
                  <div className="flex justify-between gap-2"><span>Number:</span><span className="font-medium text-foreground">Not connected</span></div>
                ) : (
                  <ul className="space-y-1" aria-label="Connected WhatsApp numbers">
                    {whatsappNumbers.map((c) => (
                      <li key={c.id} className="flex items-center justify-between gap-2">
                        <span className="min-w-0 truncate font-medium text-foreground">{numberLabel({ name: c.name, metadata: c.metadata as Record<string, unknown> | null })}</span>
                        {canManage && (
                          <button type="button" onClick={() => setSelectedConnection(c)} className="shrink-0 text-brand hover:underline">Manage</button>
                        )}
                      </li>
                    ))}
                  </ul>
                )}
                {whatsappConnection?.last_error && (
                  <p className="text-warning">{whatsappConnection.last_error}</p>
                )}
              </div>
            </div>

            <div className="space-y-2 pt-3">
              <WhatsAppEmbeddedSignup orgId={org.id} connected={whatsappNumbers.length > 0} canManage={canManage} full={whatsappNumbers.length >= MAX_WHATSAPP_NUMBERS} />
              <button
                onClick={() => setIsWhatsAppWizardOpen(true)}
                disabled={!canManage}
                className="w-full py-2 px-3 text-[12px] font-semibold text-success bg-success-bg hover:bg-success-bg border border-success/30 rounded-xl transition cursor-pointer text-center"
              >
                Test WhatsApp webhook
              </button>
            </div>
          </div>

          {/* 5. Property Portals */}
          <div className="bg-surface border border-default rounded-2xl p-5 space-y-4 hover:border-strong transition-all shadow-2xs flex flex-col justify-between">
            <div className="space-y-3">
              <div className="flex items-start justify-between">
                <div className="w-10 h-10 rounded-xl bg-danger-bg text-danger flex items-center justify-center shadow-2xs">
                  <Building className="w-5 h-5" />
                </div>
                <span className="inline-flex items-center px-2 py-0.5 rounded-full text-[11px] font-semibold bg-surface-hover text-muted border border-default">
                  Not Connected
                </span>
              </div>

              <div>
                <h4 className="text-[14px] font-bold text-foreground">Property Portals</h4>
                <p className="text-[11px] text-subtle">99acres, Magicbricks &amp; Housing.com</p>
              </div>

              <p className="text-[12px] text-muted leading-relaxed">
                Ingest buyer enquiries from prominent Indian real estate portals via official developer
                syndication agreements.
              </p>

              <div className="space-y-1.5 pt-2 border-t border-default text-[11px] text-subtle">
                <div className="flex justify-between">
                  <span>Implementation:</span>
                  <span className="font-semibold text-success">Code Verified (Stage 4G)</span>
                </div>
                <div className="flex justify-between">
                  <span>Provider Setup:</span>
                  <span className="text-warning font-medium">Developer Syndication Agreements Pending</span>
                </div>
                <div className="flex justify-between">
                  <span>Connection Status:</span>
                  <span className="text-muted font-medium">0 Active Feeds • Access Pending</span>
                </div>
              </div>
            </div>

            <div className="pt-3">
              <button
                onClick={() => setIsPortalModalOpen(true)}
                disabled={!canManage}
                className="w-full py-2 px-3 text-[12px] font-semibold text-danger bg-danger-bg hover:bg-danger-bg border border-danger/30 rounded-xl transition cursor-pointer text-center"
              >
                Configure &amp; Test Portals
              </button>
            </div>
          </div>

          {/* 6. Developer APIs & Webhooks */}
          <div className="bg-surface border border-default rounded-2xl p-5 space-y-4 hover:border-strong transition-all shadow-2xs flex flex-col justify-between">
            <div className="space-y-3">
              <div className="flex items-start justify-between">
                <div className="w-10 h-10 rounded-xl bg-accent-bg text-accent flex items-center justify-center shadow-2xs">
                  <Code className="w-5 h-5" />
                </div>
                <span className="inline-flex items-center px-2 py-0.5 rounded-full text-[11px] font-semibold bg-success-bg text-success border border-success/30">
                  Active Runtime
                </span>
              </div>

              <div>
                <h4 className="text-[14px] font-bold text-foreground">Developer APIs &amp; Webhooks</h4>
                <p className="text-[11px] text-subtle">REST Ingestion &amp; Outbound Event Dispatch</p>
              </div>

              <p className="text-[12px] text-muted leading-relaxed">
                Connect custom landing pages, mobile apps or ERPs, and receive real-time cryptographically signed
                webhook events on lead state transitions.
              </p>

              <div className="space-y-1.5 pt-2 border-t border-default text-[11px] text-subtle">
                <div className="flex justify-between">
                  <span>Implementation:</span>
                  <span className="font-semibold text-success">Code Verified (Stage 4H)</span>
                </div>
                <div className="flex justify-between">
                  <span>Provider Setup:</span>
                  <span className="text-success font-medium">Standard REST &amp; HMAC-SHA256</span>
                </div>
                <div className="flex justify-between">
                  <span>Connection Status:</span>
                  <span className="text-success font-medium">Ready • Bearer Key Auth</span>
                </div>
              </div>
            </div>

            <div className="pt-3">
              <button
                onClick={() => setIsDeveloperApiDocsOpen(true)}
                className="w-full py-2 px-3 text-[12px] font-semibold text-accent bg-accent-bg hover:bg-accent-bg border border-accent-border rounded-xl transition cursor-pointer text-center"
              >
                View API Docs &amp; Webhooks
              </button>
            </div>
          </div>
        </div>
      </div>

      {/* SECTION 2: CONNECTED ACCOUNTS & CONNECTION MANAGEMENT */}
      <div className="space-y-4">
        <div className="flex items-center justify-between">
          <div>
            <h3 className="text-[16px] font-bold text-foreground">Connected Accounts &amp; Assets</h3>
            <p className="text-[12px] text-subtle">
              Active external connections authorized for {org.name}. Only real, verified connections are
              displayed here.
            </p>
          </div>
        </div>

        {activeVerifiedConnections.length > 0 ? (
          <div className="grid grid-cols-1 gap-4">
            {activeVerifiedConnections.map((conn) => {
              const meta = (conn.metadata || {}) as Record<string, unknown>
              const pages = (meta.pages || []) as MetaPageAsset[]

              const ProviderIcon =
                conn.provider === 'meta_ads'
                  ? FacebookIcon
                  : conn.provider === 'google_ads'
                  ? Search
                  : Globe

              const providerLabel =
                conn.provider === 'meta_ads'
                  ? 'Meta Lead Ads'
                  : conn.provider === 'google_ads'
                  ? 'Google Ads'
                  : 'Website Enquiry Form'

              return (
                <div
                  key={conn.id}
                  className="bg-surface border border-default rounded-2xl p-5 shadow-2xs hover:border-strong transition-all space-y-4"
                >
                  <div className="flex flex-col md:flex-row items-start md:items-center justify-between gap-3">
                    <div className="flex items-center gap-3">
                      <div className="w-10 h-10 rounded-xl bg-brand flex items-center justify-center text-brand-foreground shadow-2xs">
                        <ProviderIcon className="w-5 h-5" />
                      </div>
                      <div>
                        <div className="flex items-center gap-2">
                          <h4 className="text-[15px] font-bold text-foreground">{conn.name}</h4>
                          <span className="inline-flex items-center px-2 py-0.5 rounded-full text-[11px] font-semibold bg-success-bg text-success border border-success/30">
                            Active &amp; Verified
                          </span>
                        </div>
                        <p className="text-[12px] text-subtle">
                          {providerLabel} • External ID: {conn.external_account_id || 'Primary Account'} • Last
                          Synchronized: {formatDate(conn.last_sync_at)}
                        </p>
                      </div>
                    </div>

                    <div className="flex items-center gap-2">
                      <button
                        onClick={() => setSelectedConnection(conn)}
                        className="px-3 py-1.5 text-[12px] font-medium text-muted bg-surface border border-default rounded-xl hover:bg-surface-muted transition-colors flex items-center gap-1.5 shadow-2xs cursor-pointer"
                      >
                        <Sliders className="w-3.5 h-3.5" />
                        Manage Mappings ({conn.mappingsCount || 0})
                      </button>
                    </div>
                  </div>

                  {/* Connected Pages Pills */}
                  {pages.length > 0 && (
                    <div className="pt-2 border-t border-default flex flex-wrap items-center gap-2">
                      <span className="text-[11px] font-semibold text-subtle uppercase tracking-wider">
                        Authorized Pages:
                      </span>
                      {pages.map((p) => (
                        <span
                          key={p.id}
                          className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg text-[12px] bg-brand-light/70 text-brand border border-brand/60 font-medium"
                        >
                          <FacebookIcon className="w-3 h-3 text-brand" />
                          {p.name}
                          <span className="text-[11px] text-brand font-mono">
                            ({p.forms?.length || 0} forms)
                          </span>
                        </span>
                      ))}
                    </div>
                  )}
                </div>
              )
            })}
          </div>
        ) : (
          <div className="bg-surface border border-dashed border-strong rounded-2xl p-8 text-center space-y-3">
            <div className="w-12 h-12 rounded-2xl bg-surface-muted text-subtle mx-auto flex items-center justify-center shadow-2xs">
              <Plug className="w-6 h-6" />
            </div>
            <div className="max-w-md mx-auto space-y-1">
              <h4 className="text-[15px] font-bold text-foreground">No Verified Accounts Connected Yet</h4>
              <p className="text-[12px] text-subtle">
                Live marketing accounts will appear here once external OAuth authorisation or form setup
                succeeds. Unconnected, draft, or mock integrations are never shown as active.
              </p>
            </div>
          </div>
        )}
      </div>

      {/* SECTION 3: LIVE FORM-TO-PROJECT ROUTING SUMMARY */}
      <div className="space-y-4">
        <div>
          <h3 className="text-[16px] font-bold text-foreground">Active Form Routing Overview</h3>
          <p className="text-[12px] text-subtle">
            How incoming marketing form submissions are routed into specific CRM projects.
          </p>
        </div>

        <div className="bg-surface border border-default rounded-2xl overflow-hidden shadow-2xs">
          <table className="w-full text-left text-[12px]">
            <thead className="bg-surface-muted/80 border-b border-default text-muted font-semibold">
              <tr>
                <th className="py-3 px-5">Lead Form / Identifier</th>
                <th className="py-3 px-4">Routing Type</th>
                <th className="py-3 px-4">Destination Project</th>
                <th className="py-3 px-4">Status</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-default">
              {mappings.length > 0 ? (
                mappings.map((m) => (
                  <tr key={m.id} className="hover:bg-surface-muted/60 transition-colors">
                    <td className="py-3 px-5">
                      <p className="font-semibold text-foreground">
                        {m.description || m.external_identifier_value}
                      </p>
                      <p className="text-[11px] text-subtle font-mono">
                        ID: {m.external_identifier_value}
                      </p>
                    </td>
                    <td className="py-3 px-4">
                      <span className="capitalize px-2 py-0.5 rounded-full text-[11px] bg-surface-hover text-muted font-medium">
                        {m.external_identifier_type.replace('_', ' ')}
                      </span>
                    </td>
                    <td className="py-3 px-4 font-semibold text-foreground">
                      {m.project?.name || 'Project Mapped'}
                    </td>
                    <td className="py-3 px-4">
                      <span className="inline-flex items-center gap-1 text-[11px] font-medium text-success bg-success-bg px-2 py-0.5 rounded-full border border-success/30">
                        <CheckCircle2 className="w-3 h-3" />
                        Active Routing
                      </span>
                    </td>
                  </tr>
                ))
              ) : (
                <tr>
                  <td colSpan={4} className="py-8 text-center text-subtle">
                    No active form mappings found. Connect a Meta account or add a form mapping to begin
                    automatic lead routing.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* META CONNECT WIZARD MODAL */}
      <MetaConnectWizardModal
        isOpen={isWizardOpen}
        onClose={() => setIsWizardOpen(false)}
        orgId={org.id}
        orgSlug={org.slug}
        projects={projects}
        onConnectionCreated={refreshData}
      />

      {/* CONNECTION DETAILS MODAL */}
      <ConnectionDetailsModal
        isOpen={Boolean(selectedConnection)}
        onClose={() => setSelectedConnection(null)}
        connection={selectedConnection}
        projects={projects}
        onRefreshNeeded={refreshData}
      />

      {/* WEBSITE ENQUIRY WIZARD MODAL */}
      <WebsiteEnquiryWizardModal
        isOpen={isWebsiteWizardOpen}
        onClose={() => setIsWebsiteWizardOpen(false)}
        orgId={org.id}
        projects={projects}
        existingConnection={websiteConnection}
        onConnectionCreated={refreshData}
      />

      {/* WHATSAPP WIZARD MODAL */}
      <WhatsAppWizardModal
        isOpen={isWhatsAppWizardOpen}
        onClose={() => setIsWhatsAppWizardOpen(false)}
        orgId={org.id}
        projects={projects}
        existingConnection={whatsappConnection}
        onConnectionCreated={refreshData}
      />

      {/* PROPERTY PORTAL INTEGRATION MODAL */}
      <PortalIntegrationModal
        isOpen={isPortalModalOpen}
        onClose={() => setIsPortalModalOpen(false)}
        orgId={org.id}
        projects={projects}
        onConnectionCreated={refreshData}
      />

      {/* DEVELOPER API & WEBHOOK DOCS MODAL */}
      <DeveloperApiDocsModal
        isOpen={isDeveloperApiDocsOpen}
        onClose={() => setIsDeveloperApiDocsOpen(false)}
      />
    </div>
  )
}
