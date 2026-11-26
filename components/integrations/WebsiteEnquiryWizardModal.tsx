// components/integrations/WebsiteEnquiryWizardModal.tsx
// Interactive modal for configuring website enquiry forms, generating embed codes, and live testing.
'use client'

import { useState } from 'react'
import {
  X,
  Code2,
  Copy,
  Check,
  Globe,
  ShieldCheck,
  Send,
} from 'lucide-react'
import type { IntegrationConnectionRecord } from '@/lib/integrations/types'
import { generateFormEmbedSnippets } from '@/lib/integrations/forms/generator'
import { WebsiteCapturePanel } from '@/components/integrations/WebsiteCapturePanel'
import { Alert, Input, Select } from '@/components/ui'
import { ModalShell } from '@/components/ui/modal-shell'

interface ProjectOption {
  id: string
  name: string
  category: string
}

interface WebsiteEnquiryWizardModalProps {
  isOpen: boolean
  onClose: () => void
  orgId?: string
  projects: ProjectOption[]
  existingConnection?: IntegrationConnectionRecord | null
  onConnectionCreated?: () => void
}

export function WebsiteEnquiryWizardModal({
  isOpen,
  onClose,
  orgId,
  projects,
  existingConnection,
  onConnectionCreated,
}: WebsiteEnquiryWizardModalProps) {
  const [activeTab, setActiveTab] = useState<'capture' | 'snippets' | 'test' | 'settings'>('capture')
  const [snippetType, setSnippetType] = useState<'script' | 'iframe' | 'api'>('script')

  // Form configuration state
  const [selectedProjectId, setSelectedProjectId] = useState<string>(projects[0]?.id || '')
  const [formTitle, setFormTitle] = useState('Enquire Now')
  const [buttonText, setButtonText] = useState('Schedule Site Visit')
  const [allowedDomains] = useState(() => {
    const meta = existingConnection?.metadata as Record<string, unknown> | undefined
    if (meta && Array.isArray(meta.allowedDomains)) {
      return meta.allowedDomains.join(', ')
    }
    return ''
  })
  const [isCopied, setIsCopied] = useState(false)

  // Live test submission state
  const [testName, setTestName] = useState('John Developer')
  const [testPhone, setTestPhone] = useState('+919876543210')
  const [testEmail, setTestEmail] = useState('buyer@example.com')
  const [testUnit, setTestUnit] = useState('3 BHK Apartment')
  const [testLoading, setTestLoading] = useState(false)
  const [testResponse, setTestResponse] = useState<Record<string, unknown> | null>(null)

  // The real website connection, or none yet (set up on the Capture tab). Never a placeholder id.
  const connectionId = existingConnection?.id ?? null

  const snippets = generateFormEmbedSnippets({
    connectionId: connectionId ?? '',
    appUrl: typeof window !== 'undefined' ? window.location.origin : undefined,
    projectId: selectedProjectId || undefined,
    projectName: projects.find((p) => p.id === selectedProjectId)?.name,
    formTitle,
    buttonText,
  })

  if (!isOpen) return null

  const handleCopy = (text: string) => {
    navigator.clipboard.writeText(text)
    setIsCopied(true)
    setTimeout(() => setIsCopied(false), 2000)
  }

  const handleRunLiveTest = async (e: React.FormEvent) => {
    e.preventDefault()
    setTestLoading(true)
    setTestResponse(null)

    try {
      const res = await fetch('/api/forms/submit', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          connectionId,
          projectId: selectedProjectId || undefined,
          name: testName,
          phone: testPhone,
          email: testEmail || undefined,
          unitPreference: testUnit || undefined,
          scheduleSiteVisit: true,
          formLoadTime: Date.now() - 5000, // Simulates human fill duration (>1.2s)
          submissionTime: Date.now(),
          utmSource: 'website_test_console',
          utmCampaign: 'stage_4e_verification',
        }),
      })

      const data = await res.json()
      setTestResponse({
        httpStatus: res.status,
        ...data,
      })
    } catch (err: unknown) {
      setTestResponse({
        httpStatus: 500,
        success: false,
        error: err instanceof Error ? err.message : 'Network request failed',
      })
    } finally {
      setTestLoading(false)
    }
  }

  return (
    <ModalShell onClose={onClose} label="Connect your website" size="xl" className="overflow-hidden flex flex-col">
        {/* Header */}
        <div className="px-6 py-5 border-b border-default flex items-center justify-between bg-surface-muted/50">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-accent-bg text-accent flex items-center justify-center font-bold">
              <Globe className="w-5 h-5" />
            </div>
            <div>
              <h2 className="text-base font-bold text-foreground">Website Enquiry Form Integration</h2>
              <p className="text-xs text-subtle">
                Embed responsive enquiry widgets on project websites with spam defense & CRM routing.
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-2 text-subtle hover:text-muted rounded-lg hover:bg-surface-hover transition cursor-pointer"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Tab Navigation */}
        <div className="px-6 pt-3 border-b border-default flex items-center gap-6 overflow-x-auto text-sm font-medium">
          <button
            onClick={() => setActiveTab('capture')}
            className={`pb-3 flex shrink-0 items-center gap-2 border-b-2 transition cursor-pointer ${
              activeTab === 'capture'
                ? 'border-brand text-brand font-semibold'
                : 'border-transparent text-subtle hover:text-muted'
            }`}
          >
            <Globe className="w-4 h-4" />
            Capture your forms
          </button>

          <button
            onClick={() => setActiveTab('snippets')}
            className={`pb-3 flex items-center gap-2 border-b-2 transition cursor-pointer ${
              activeTab === 'snippets'
                ? 'border-accent text-accent font-semibold'
                : 'border-transparent text-subtle hover:text-muted'
            }`}
          >
            <Code2 className="w-4 h-4" />
            Embed Snippets
          </button>

          <button
            onClick={() => setActiveTab('test')}
            className={`pb-3 flex items-center gap-2 border-b-2 transition cursor-pointer ${
              activeTab === 'test'
                ? 'border-accent text-accent font-semibold'
                : 'border-transparent text-subtle hover:text-muted'
            }`}
          >
            <Send className="w-4 h-4" />
            Live Test Console
          </button>

          <button
            onClick={() => setActiveTab('settings')}
            className={`pb-3 flex items-center gap-2 border-b-2 transition cursor-pointer ${
              activeTab === 'settings'
                ? 'border-accent text-accent font-semibold'
                : 'border-transparent text-subtle hover:text-muted'
            }`}
          >
            <ShieldCheck className="w-4 h-4" />
            Protection & Settings
          </button>
        </div>

        {/* Content Body */}
        <div className="p-6 overflow-y-auto flex-1 space-y-6">
          {/* TAB 0: Capture the site's own forms */}
          {activeTab === 'capture' && orgId && (
            <WebsiteCapturePanel orgId={orgId} projects={projects} onSaved={() => onConnectionCreated?.()} />
          )}

          {(activeTab === 'snippets' || activeTab === 'test') && !connectionId && (
            <Alert tone="info">Set up your website on the “Capture your forms” tab first — the form widget uses the same website settings.</Alert>
          )}

          {/* TAB 1: Embed Snippets */}
          {activeTab === 'snippets' && connectionId && (
            <div className="space-y-5">
              {/* Configuration Controls */}
              <div className="grid grid-cols-1 md:grid-cols-3 gap-4 p-4 bg-surface-muted rounded-xl border border-default">
                <div>
                  <label className="block text-xs font-semibold text-muted mb-1">
                    Route to Project
                  </label>
                  <Select
                    value={selectedProjectId}
                    onChange={(e) => setSelectedProjectId(e.target.value)}>
                    <option value="">Default (Unassigned)</option>
                    {projects.map((p) => (
                      <option key={p.id} value={p.id}>
                        {p.name}
                      </option>
                    ))}
                  </Select>
                </div>

                <div>
                  <label className="block text-xs font-semibold text-muted mb-1">
                    Form Title
                  </label>
                  <Input
                    type="text"
                    value={formTitle}
                    onChange={(e) => setFormTitle(e.target.value)}
                  />
                </div>

                <div>
                  <label className="block text-xs font-semibold text-muted mb-1">
                    Button Label
                  </label>
                  <Input
                    type="text"
                    value={buttonText}
                    onChange={(e) => setButtonText(e.target.value)}
                  />
                </div>
              </div>

              {/* Sub-tab selection: Script vs iframe vs API */}
              <div className="flex items-center gap-2">
                <button
                  onClick={() => setSnippetType('script')}
                  className={`px-3 py-1.5 text-xs rounded-lg font-medium transition cursor-pointer ${
                    snippetType === 'script'
                      ? 'bg-accent-bg text-accent border border-accent-border'
                      : 'bg-surface-hover text-muted hover:bg-surface-hover'
                  }`}
                >
                  Inline Widget (Script Tag)
                </button>
                <button
                  onClick={() => setSnippetType('iframe')}
                  className={`px-3 py-1.5 text-xs rounded-lg font-medium transition cursor-pointer ${
                    snippetType === 'iframe'
                      ? 'bg-accent-bg text-accent border border-accent-border'
                      : 'bg-surface-hover text-muted hover:bg-surface-hover'
                  }`}
                >
                  Sandbox (iframe)
                </button>
                <button
                  onClick={() => setSnippetType('api')}
                  className={`px-3 py-1.5 text-xs rounded-lg font-medium transition cursor-pointer ${
                    snippetType === 'api'
                      ? 'bg-accent-bg text-accent border border-accent-border'
                      : 'bg-surface-hover text-muted hover:bg-surface-hover'
                  }`}
                >
                  Custom REST API (JavaScript Fetch)
                </button>
              </div>

              {/* Code Snippet Box */}
              <div className="relative rounded-xl overflow-hidden border border-slate-800 bg-foreground text-slate-100 font-mono text-xs">
                <div className="flex items-center justify-between px-4 py-2 bg-foreground/80 border-b border-slate-700">
                  <span className="text-[11px] text-subtle">
                    {snippetType === 'script'
                      ? 'HTML + embed.js'
                      : snippetType === 'iframe'
                      ? 'HTML iframe'
                      : 'JavaScript fetch'}
                  </span>
                  <button
                    onClick={() =>
                      handleCopy(
                        snippetType === 'script'
                          ? snippets.scriptTag
                          : snippetType === 'iframe'
                          ? snippets.iframe
                          : snippets.apiFetch
                      )
                    }
                    className="flex items-center gap-1 text-[11px] px-2 py-1 rounded bg-slate-700 hover:bg-slate-600 text-slate-200 transition cursor-pointer"
                  >
                    {isCopied ? <Check className="w-3.5 h-3.5 text-emerald-400" /> : <Copy className="w-3.5 h-3.5" />}
                    <span>{isCopied ? 'Copied!' : 'Copy Code'}</span>
                  </button>
                </div>
                <pre className="p-4 overflow-x-auto text-[11.5px] leading-relaxed text-slate-200">
                  {snippetType === 'script' && snippets.scriptTag}
                  {snippetType === 'iframe' && snippets.iframe}
                  {snippetType === 'api' && snippets.apiFetch}
                </pre>
              </div>

              <div className="text-xs text-subtle bg-accent-bg border border-accent-border rounded-lg p-3">
                <p className="font-semibold text-accent mb-0.5">Automated Ingestion Features:</p>
                <p>
                  Includes automatic UTM parameter tracking, honeypot spam protection, submission
                  speed verification, and central CRM deduplication.
                </p>
              </div>
            </div>
          )}

          {/* TAB 2: Live Test Console */}
          {activeTab === 'test' && connectionId && (
            <div className="space-y-4">
              <p className="text-xs text-muted">
                Test the public submission endpoint directly from this console. This sends a real
                payload to <code className="text-accent bg-accent-bg px-1 py-0.5 rounded">/api/forms/submit</code>.
              </p>

              <form onSubmit={handleRunLiveTest} className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs font-semibold text-muted mb-1">
                    Customer Name *
                  </label>
                  <Input
                    type="text"
                    required
                    value={testName}
                    onChange={(e) => setTestName(e.target.value)}
                  />
                </div>

                <div>
                  <label className="block text-xs font-semibold text-muted mb-1">
                    Phone Number *
                  </label>
                  <Input
                    type="tel"
                    required
                    value={testPhone}
                    onChange={(e) => setTestPhone(e.target.value)}
                  />
                </div>

                <div>
                  <label className="block text-xs font-semibold text-muted mb-1">
                    Email Address
                  </label>
                  <Input
                    type="email"
                    value={testEmail}
                    onChange={(e) => setTestEmail(e.target.value)}
                  />
                </div>

                <div>
                  <label className="block text-xs font-semibold text-muted mb-1">
                    Unit Preference
                  </label>
                  <Input
                    type="text"
                    value={testUnit}
                    onChange={(e) => setTestUnit(e.target.value)}
                  />
                </div>

                <div className="md:col-span-2 pt-2">
                  <button
                    type="submit"
                    disabled={testLoading}
                    className="w-full py-2.5 px-4 bg-accent hover:bg-accent text-accent-foreground font-medium rounded-lg text-xs shadow-sm transition disabled:opacity-50 cursor-pointer flex items-center justify-center gap-2"
                  >
                    {testLoading ? (
                      'Submitting Enquiry...'
                    ) : (
                      <>
                        <Send className="w-3.5 h-3.5" />
                        Execute Live Submission
                      </>
                    )}
                  </button>
                </div>
              </form>

              {testResponse && (
                <div className="mt-4 p-4 rounded-xl border border-default bg-surface-muted font-mono text-xs">
                  <div className="flex items-center justify-between mb-2">
                    <span className="font-bold text-muted">API Response:</span>
                    <span
                      className={`px-2 py-0.5 rounded text-[11px] font-semibold ${
                        testResponse.success
                          ? 'bg-success-bg text-success'
                          : 'bg-danger-bg text-danger'
                      }`}
                    >
                      HTTP {String(testResponse.httpStatus || 200)}
                    </span>
                  </div>
                  <pre className="text-foreground overflow-x-auto text-[11px]">
                    {JSON.stringify(testResponse, null, 2)}
                  </pre>
                </div>
              )}
            </div>
          )}

          {/* TAB 3: Protection & Settings */}
          {activeTab === 'settings' && (
            <div className="space-y-4">
              <div className="surface-raised border border-default rounded-2xl p-4 bg-surface space-y-3">
                <h4 className="text-xs font-bold text-foreground uppercase tracking-wider">
                  Origin Domain Whitelist (CORS & Domain Protection)
                </h4>
                <p className="text-xs text-subtle">
                  Enquiries are accepted only from the domains listed on the “Capture your forms” tab
                  (the capture script and the form widget share them).
                </p>
                <p className="text-xs font-medium text-foreground">{allowedDomains || 'No domains yet — website enquiries are off.'}</p>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                <div className="p-3.5 bg-surface-muted rounded-xl border border-default space-y-1">
                  <div className="flex items-center gap-2 text-xs font-bold text-foreground">
                    <ShieldCheck className="w-4 h-4 text-success" />
                    Honeypot Trap
                  </div>
                  <p className="text-[11px] text-subtle">
                    Hidden inputs catch automated bot scrapers without human CAPTCHA friction.
                  </p>
                </div>

                <div className="p-3.5 bg-surface-muted rounded-xl border border-default space-y-1">
                  <div className="flex items-center gap-2 text-xs font-bold text-foreground">
                    <ShieldCheck className="w-4 h-4 text-brand" />
                    Speed Check
                  </div>
                  <p className="text-[11px] text-subtle">
                    Submissions completed under 1.2s are rejected as automated bot scripts.
                  </p>
                </div>

                <div className="p-3.5 bg-surface-muted rounded-xl border border-default space-y-1">
                  <div className="flex items-center gap-2 text-xs font-bold text-foreground">
                    <ShieldCheck className="w-4 h-4 text-accent" />
                    Distributed Rate Limit
                  </div>
                  <p className="text-[11px] text-subtle">
                    15 submissions per 5 min per client IP; 120 per min per connection.
                  </p>
                </div>

                <div className="p-3.5 bg-surface-muted rounded-xl border border-default space-y-1">
                  <div className="flex items-center gap-2 text-xs font-bold text-foreground">
                    <ShieldCheck className="w-4 h-4 text-warning" />
                    Non-Destructive Deduplication
                  </div>
                  <p className="text-[11px] text-subtle">
                    Preserves duplicate enquiry history while keeping CRM contacts clean.
                  </p>
                </div>
              </div>
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="px-6 py-4 border-t border-default bg-surface-muted/50 flex items-center justify-end">
          <button
            onClick={onClose}
            className="px-4 py-2 text-xs font-medium text-muted hover:text-foreground hover:bg-surface-hover rounded-lg transition cursor-pointer"
          >
            Close
          </button>
        </div>
      </ModalShell>
  )
}
