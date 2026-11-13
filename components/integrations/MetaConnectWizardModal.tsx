// components/integrations/MetaConnectWizardModal.tsx
// Guided multi-step customer journey for connecting Facebook Pages and mapping lead forms to projects.
'use client'

import { useState } from 'react'
import {
  X,
  ShieldCheck,
  CheckCircle2,
  AlertCircle,
  ArrowRight,
  ArrowLeft,
  FileText,
  Lock,
  RefreshCw,
} from 'lucide-react'
import { FacebookIcon } from '@/components/icons/FacebookIcon'
import type { MetaPageAsset, MetaLeadFormAsset } from '@/lib/integrations/types'

const PREVIEW_EXTERNAL_ACCOUNT_ID = 'act_8291039481'
const PREVIEW_TOKEN_EXPIRY = '2027-01-01T00:00:00.000Z'

interface ProjectOption {
  id: string
  name: string
  category: string
}

interface MetaConnectWizardModalProps {
  isOpen: boolean
  onClose: () => void
  orgId: string
  orgSlug: string
  projects: ProjectOption[]
  onConnectionCreated: () => void
}

// Sample detected Facebook Pages for staging / design validation
const PREVIEW_DETECTED_PAGES: MetaPageAsset[] = [
  {
    id: 'page_fb_001',
    name: 'Prestige Living & Residences',
    category: 'Real Estate Developer',
    accessStatus: 'active',
    forms: [
      {
        id: 'form_meta_101',
        name: 'Tower A — 3BHK Premium Brochure Enquiry',
        status: 'ACTIVE',
        leadsCount: 142,
      },
      {
        id: 'form_meta_102',
        name: 'Weekend Site Visit Registration',
        status: 'ACTIVE',
        leadsCount: 88,
      },
    ],
  },
  {
    id: 'page_fb_002',
    name: 'Emerald Bay Luxury Villas',
    category: 'Property Development',
    accessStatus: 'active',
    forms: [
      {
        id: 'form_meta_201',
        name: 'Waterfront Villa E-Brochure Request',
        status: 'ACTIVE',
        leadsCount: 65,
      },
      {
        id: 'form_meta_202',
        name: 'Exclusive VIP Launch Invitation Form',
        status: 'ACTIVE',
        leadsCount: 34,
      },
    ],
  },
]

export function MetaConnectWizardModal({
  isOpen,
  onClose,
  orgId,
  orgSlug,
  projects,
  onConnectionCreated,
}: MetaConnectWizardModalProps) {
  const [currentStep, setCurrentStep] = useState<number>(1)
  const [connectionName, setConnectionName] = useState('Meta Advertising Account')
  const [selectedPages, setSelectedPages] = useState<string[]>([PREVIEW_DETECTED_PAGES[0].id])
  const [formMappings, setFormMappings] = useState<Record<string, string>>({})
  const [defaultProjectId, setDefaultProjectId] = useState<string>(projects[0]?.id || '')
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [errorMessage, setErrorMessage] = useState<string | null>(null)

  if (!isOpen) return null

  // Handle page selection toggle
  const togglePageSelection = (pageId: string) => {
    setSelectedPages((prev) =>
      prev.includes(pageId) ? prev.filter((id) => id !== pageId) : [...prev, pageId]
    )
  }

  // Handle individual form mapping change
  const handleFormMappingChange = (formId: string, projectId: string) => {
    setFormMappings((prev) => ({
      ...prev,
      [formId]: projectId,
    }))
  }

  // Active pages with their forms
  const activePages = PREVIEW_DETECTED_PAGES.filter((p) => selectedPages.includes(p.id))
  const allDetectedForms: Array<{ page: MetaPageAsset; form: MetaLeadFormAsset }> = []
  for (const p of activePages) {
    for (const f of p.forms || []) {
      allDetectedForms.push({ page: p, form: f })
    }
  }

  // Handle connection save
  const handleSaveConnection = async () => {
    setIsSubmitting(true)
    setErrorMessage(null)

    try {
      // Build initial mappings
      const initialMappings = []

      // 1. Account default mapping
      if (defaultProjectId) {
        initialMappings.push({
          projectId: defaultProjectId,
          externalIdentifierType: 'account_default' as const,
          externalIdentifierValue: 'default',
          description: 'Account Default Project Fallback',
        })
      }

      // 2. Specific form mappings
      for (const item of allDetectedForms) {
        const mappedProjId = formMappings[item.form.id] || defaultProjectId
        if (mappedProjId) {
          initialMappings.push({
            projectId: mappedProjId,
            externalIdentifierType: 'form_id' as const,
            externalIdentifierValue: item.form.id,
            description: `${item.page.name} — ${item.form.name}`,
          })
        }
      }

      const payload = {
        orgId,
        orgSlug,
        provider: 'meta_ads',
        name: connectionName.trim() || 'Meta Lead Ads Connection',
        externalAccountId: PREVIEW_EXTERNAL_ACCOUNT_ID,
        status: 'connected',
        metadata: {
          pages: activePages,
          authorizedUserName: 'Marketing Administrator',
          healthStatus: 'healthy',
          tokenExpiry: PREVIEW_TOKEN_EXPIRY,
          scopes: [
            'pages_show_list',
            'leads_retrieval',
            'pages_read_engagement',
            'pages_manage_ads',
          ],
        },
        initialMappings,
      }

      const res = await fetch('/api/integrations/connections', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      })

      const data = await res.json()
      if (!res.ok) {
        throw new Error(data.error || 'Failed to save integration connection')
      }

      onConnectionCreated()
      onClose()
    } catch (err: unknown) {
      setErrorMessage(err instanceof Error ? err.message : 'Failed to save connection')
    } finally {
      setIsSubmitting(false)
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-xs">
      <div className="bg-[var(--surface)] border border-[var(--border)] rounded-2xl w-full max-w-2xl max-h-[90vh] flex flex-col shadow-2xl overflow-hidden animate-in fade-in zoom-in-95 duration-150">
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-[var(--border)] bg-gray-50/50">
          <div className="flex items-center gap-2.5">
            <div className="w-8 h-8 rounded-lg bg-blue-600 flex items-center justify-center text-white shadow-2xs">
              <FacebookIcon className="w-5 h-5" />
            </div>
            <div>
              <h2 className="text-[15px] font-bold text-[var(--foreground)]">
                Connect Meta Lead Ads
              </h2>
              <p className="text-[12px] text-[var(--foreground-muted)]">
                Step {currentStep} of 5: {getStepTitle(currentStep)}
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-1.5 text-gray-400 hover:text-gray-600 rounded-lg hover:bg-gray-100 transition-colors"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Stepper Progress Indicator */}
        <div className="grid grid-cols-5 border-b border-[var(--border)] bg-gray-50/20 text-[11px] font-medium text-center">
          {['Overview', 'Permissions', 'Select Pages', 'Map Forms', 'Review'].map((label, idx) => {
            const stepNum = idx + 1
            const isCompleted = stepNum < currentStep
            const isCurrent = stepNum === currentStep
            return (
              <div
                key={label}
                className={`py-2 px-1 border-b-2 transition-colors ${
                  isCurrent
                    ? 'border-blue-600 text-blue-600 font-semibold bg-blue-50/40'
                    : isCompleted
                    ? 'border-emerald-500 text-emerald-600'
                    : 'border-transparent text-gray-400'
                }`}
              >
                {stepNum}. {label}
              </div>
            )
          })}
        </div>

        {/* Body */}
        <div className="p-6 overflow-y-auto flex-1 space-y-5">
          {errorMessage && (
            <div className="p-3.5 rounded-xl bg-red-50 border border-red-200 text-red-700 text-[13px] flex items-start gap-2.5">
              <AlertCircle className="w-4 h-4 mt-0.5 flex-shrink-0 text-red-600" />
              <span>{errorMessage}</span>
            </div>
          )}

          {/* STEP 1: Overview & Architecture Explanation */}
          {currentStep === 1 && (
            <div className="space-y-4">
              <div className="p-4 rounded-xl bg-blue-50/70 border border-blue-200 text-blue-900 text-[13px] leading-relaxed">
                <p className="font-semibold mb-1 flex items-center gap-1.5 text-blue-950">
                  <ShieldCheck className="w-4 h-4 text-blue-600" />
                  Official Single-App Multi-Tenant Integration
                </p>
                Production X maintains a single verified Meta developer application. Each real estate
                company securely connects its own Facebook Pages and business accounts. Leads submitted
                by customers flow directly and exclusively into your private organisation workspace.
              </div>

              <div>
                <label className="block text-[12px] font-semibold text-[var(--foreground)] mb-1.5">
                  Connection Name
                </label>
                <input
                  type="text"
                  value={connectionName}
                  onChange={(e) => setConnectionName(e.target.value)}
                  placeholder="e.g. Meta Advertising — Main Account"
                  className="w-full px-3.5 py-2 text-[13px] rounded-lg border border-[var(--border)] bg-[var(--surface)] text-[var(--foreground)] focus:outline-hidden focus:ring-2 focus:ring-blue-500"
                />
                <p className="mt-1 text-[11px] text-[var(--foreground-muted)]">
                  Helps distinguish this account if your organisation manages multiple advertising
                  accounts.
                </p>
              </div>

              <div className="space-y-2.5 pt-2">
                <h4 className="text-[12px] font-semibold text-gray-700 uppercase tracking-wider">
                  How Connection Works
                </h4>
                <div className="grid grid-cols-1 gap-2.5">
                  <div className="flex items-start gap-3 p-3 rounded-xl border border-gray-200 bg-white">
                    <div className="w-6 h-6 rounded-full bg-blue-100 text-blue-700 flex items-center justify-center text-[12px] font-bold flex-shrink-0 mt-0.5">
                      1
                    </div>
                    <div className="text-[12px]">
                      <p className="font-semibold text-gray-900">Authorize through Meta</p>
                      <p className="text-gray-500">
                        Log in with your official business Facebook account and choose which business
                        Pages you manage.
                      </p>
                    </div>
                  </div>

                  <div className="flex items-start gap-3 p-3 rounded-xl border border-gray-200 bg-white">
                    <div className="w-6 h-6 rounded-full bg-blue-100 text-blue-700 flex items-center justify-center text-[12px] font-bold flex-shrink-0 mt-0.5">
                      2
                    </div>
                    <div className="text-[12px]">
                      <p className="font-semibold text-gray-900">Select Permitted Pages & Forms</p>
                      <p className="text-gray-500">
                        Production X detects your lead generation forms and lets you route each form to
                        the appropriate property project.
                      </p>
                    </div>
                  </div>

                  <div className="flex items-start gap-3 p-3 rounded-xl border border-gray-200 bg-white">
                    <div className="w-6 h-6 rounded-full bg-blue-100 text-blue-700 flex items-center justify-center text-[12px] font-bold flex-shrink-0 mt-0.5">
                      3
                    </div>
                    <div className="text-[12px]">
                      <p className="font-semibold text-gray-900">Receive Leads in Real Time</p>
                      <p className="text-gray-500">
                        New home-buyer enquiries are instantly delivered to your CRM with full campaign
                        attribution.
                      </p>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          )}

          {/* STEP 2: Permissions Explanation & Security Guarantees */}
          {currentStep === 2 && (
            <div className="space-y-4">
              <div className="space-y-3">
                <h3 className="text-[14px] font-bold text-gray-900">
                  Permissions Requested by Production X
                </h3>
                <p className="text-[12px] text-gray-600">
                  To automatically import buyer leads, Meta requires you to approve specific access
                  scopes during login:
                </p>

                <div className="space-y-2">
                  <div className="p-3 rounded-xl border border-emerald-200 bg-emerald-50/40 text-[12px] flex items-start gap-3">
                    <CheckCircle2 className="w-4 h-4 text-emerald-600 flex-shrink-0 mt-0.5" />
                    <div>
                      <p className="font-semibold text-emerald-950">Read Lead Form Submissions</p>
                      <p className="text-emerald-800">
                        Allows Production X to retrieve contact info (name, phone, email) when buyers
                        submit a Facebook or Instagram Lead Ad form.
                      </p>
                    </div>
                  </div>

                  <div className="p-3 rounded-xl border border-emerald-200 bg-emerald-50/40 text-[12px] flex items-start gap-3">
                    <CheckCircle2 className="w-4 h-4 text-emerald-600 flex-shrink-0 mt-0.5" />
                    <div>
                      <p className="font-semibold text-emerald-950">View Managed Pages</p>
                      <p className="text-emerald-800">
                        Allows Production X to list your business Pages so you can select which project
                        Pages to link.
                      </p>
                    </div>
                  </div>

                  <div className="p-3 rounded-xl border border-emerald-200 bg-emerald-50/40 text-[12px] flex items-start gap-3">
                    <CheckCircle2 className="w-4 h-4 text-emerald-600 flex-shrink-0 mt-0.5" />
                    <div>
                      <p className="font-semibold text-emerald-950">View Ad Campaign Names</p>
                      <p className="text-emerald-800">
                        Allows attributing enquiries to the right ad campaign and marketing creative
                        for ROI tracking.
                      </p>
                    </div>
                  </div>
                </div>
              </div>

              {/* Security & Privacy Commitment */}
              <div className="p-4 rounded-xl border border-gray-200 bg-gray-50/60 space-y-2">
                <h4 className="text-[12px] font-bold text-gray-900 flex items-center gap-1.5">
                  <Lock className="w-3.5 h-3.5 text-gray-700" />
                  Our Privacy & Security Promises
                </h4>
                <ul className="text-[12px] text-gray-600 space-y-1.5 list-disc list-inside">
                  <li>
                    Production X will <strong>NEVER</strong> post to your Facebook timeline or
                    Instagram feed.
                  </li>
                  <li>
                    Production X will <strong>NEVER</strong> read your personal messages or private
                    photos.
                  </li>
                  <li>
                    Production X will <strong>NEVER</strong> ask for or store your Facebook password.
                  </li>
                  <li>
                    Your connection credentials are encrypted using secure vault storage and are never
                    exposed in the browser.
                  </li>
                </ul>
              </div>
            </div>
          )}

          {/* STEP 3: Page & Form Discovery (Multiple Pages Supported) */}
          {currentStep === 3 && (
            <div className="space-y-4">
              <div>
                <h3 className="text-[14px] font-bold text-gray-900 mb-1">
                  Select Facebook Pages to Connect
                </h3>
                <p className="text-[12px] text-gray-600">
                  Select which Facebook Pages belong to your property projects. You can connect
                  multiple Pages to one account.
                </p>
              </div>

              <div className="space-y-3">
                {PREVIEW_DETECTED_PAGES.map((page) => {
                  const isChecked = selectedPages.includes(page.id)
                  return (
                    <div
                      key={page.id}
                      onClick={() => togglePageSelection(page.id)}
                      className={`p-4 rounded-xl border cursor-pointer transition-all ${
                        isChecked
                          ? 'border-blue-500 bg-blue-50/30 ring-1 ring-blue-500'
                          : 'border-gray-200 bg-white hover:border-gray-300'
                      }`}
                    >
                      <div className="flex items-center justify-between">
                        <div className="flex items-center gap-3">
                          <input
                            type="checkbox"
                            checked={isChecked}
                            onChange={() => togglePageSelection(page.id)}
                            className="w-4 h-4 text-blue-600 rounded-md border-gray-300 focus:ring-blue-500"
                            onClick={(e) => e.stopPropagation()}
                          />
                          <div>
                            <p className="text-[13px] font-semibold text-gray-900">{page.name}</p>
                            <p className="text-[11px] text-gray-500">
                              {page.category} • {page.forms?.length ?? 0} Lead Forms Detected
                            </p>
                          </div>
                        </div>
                        <span className="text-[11px] font-medium px-2 py-0.5 rounded-full bg-emerald-50 text-emerald-700 border border-emerald-200">
                          Ready to Link
                        </span>
                      </div>

                      {/* Display detected forms inside page */}
                      {isChecked && page.forms && page.forms.length > 0 && (
                        <div className="mt-3 pt-3 border-t border-gray-100 pl-7 space-y-1.5">
                          <p className="text-[11px] font-semibold text-gray-600 uppercase tracking-wider">
                            Active Lead Forms on this Page:
                          </p>
                          {page.forms.map((form) => (
                            <div
                              key={form.id}
                              className="text-[12px] text-gray-700 flex items-center justify-between"
                            >
                              <span className="flex items-center gap-1.5">
                                <FileText className="w-3.5 h-3.5 text-gray-400" />
                                {form.name}
                              </span>
                              <span className="text-[11px] text-gray-500 font-mono">
                                ID: {form.id}
                              </span>
                            </div>
                          ))}
                        </div>
                      )}
                    </div>
                  )
                })}
              </div>

              {selectedPages.length === 0 && (
                <p className="text-[12px] text-red-600 font-medium">
                  Please select at least one Facebook Page to proceed.
                </p>
              )}
            </div>
          )}

          {/* STEP 4: Form-to-Project Mapping Configuration */}
          {currentStep === 4 && (
            <div className="space-y-4">
              <div>
                <h3 className="text-[14px] font-bold text-gray-900 mb-1">
                  Map Lead Forms to Production X Projects
                </h3>
                <p className="text-[12px] text-gray-600">
                  Assign each Meta lead form to the specific development project it belongs to.
                  Incoming leads will automatically be tagged and routed to that project.
                </p>
              </div>

              {/* Default fallback project */}
              <div className="p-3.5 rounded-xl border border-gray-200 bg-gray-50/70 space-y-1.5">
                <label className="block text-[12px] font-semibold text-gray-900">
                  Default Fallback Project
                </label>
                <select
                  value={defaultProjectId}
                  onChange={(e) => setDefaultProjectId(e.target.value)}
                  className="w-full px-3 py-2 text-[13px] rounded-lg border border-gray-300 bg-white text-gray-900 focus:outline-hidden focus:ring-2 focus:ring-blue-500"
                >
                  <option value="">-- No Default (Leave Unmapped for Manual Assignment) --</option>
                  {projects.map((proj) => (
                    <option key={proj.id} value={proj.id}>
                      {proj.name} ({proj.category})
                    </option>
                  ))}
                </select>
                <p className="text-[11px] text-gray-500">
                  Used if a new lead form is created on Facebook in the future before you configure a
                  specific mapping.
                </p>
              </div>

              {/* Individual Form Mappings */}
              <div className="space-y-3 pt-2">
                <h4 className="text-[12px] font-semibold text-gray-700 uppercase tracking-wider">
                  Individual Form Mappings ({allDetectedForms.length} Forms Detected)
                </h4>

                {allDetectedForms.map(({ page, form }) => {
                  const currentMappedProject = formMappings[form.id] || defaultProjectId
                  return (
                    <div
                      key={form.id}
                      className="p-3.5 rounded-xl border border-gray-200 bg-white space-y-2 shadow-2xs"
                    >
                      <div className="flex items-start justify-between">
                        <div>
                          <p className="text-[13px] font-semibold text-gray-900 flex items-center gap-1.5">
                            <FileText className="w-4 h-4 text-blue-600" />
                            {form.name}
                          </p>
                          <p className="text-[11px] text-gray-500">
                            Page: {page.name} • Form ID: {form.id}
                          </p>
                        </div>
                      </div>

                      <div className="pt-1">
                        <label className="block text-[11px] font-medium text-gray-600 mb-1">
                          Route Leads From This Form To:
                        </label>
                        <select
                          value={currentMappedProject}
                          onChange={(e) => handleFormMappingChange(form.id, e.target.value)}
                          className="w-full px-3 py-1.5 text-[12px] rounded-lg border border-gray-300 bg-white text-gray-900 focus:outline-hidden focus:ring-2 focus:ring-blue-500"
                        >
                          <option value="">
                            -- Unmapped (Requires Manual Assignment in Leads) --
                          </option>
                          {projects.map((proj) => (
                            <option key={proj.id} value={proj.id}>
                              {proj.name} ({proj.category})
                            </option>
                          ))}
                        </select>
                      </div>
                    </div>
                  )
                })}
              </div>
            </div>
          )}

          {/* STEP 5: Final Review & Confirmation */}
          {currentStep === 5 && (
            <div className="space-y-4">
              <div className="p-4 rounded-xl bg-emerald-50/70 border border-emerald-200 text-emerald-950 text-[13px]">
                <p className="font-semibold flex items-center gap-1.5 text-emerald-900 mb-1">
                  <CheckCircle2 className="w-4 h-4 text-emerald-600" />
                  Connection Summary
                </p>
                Please verify the configuration below. Once activated, incoming Meta lead form submissions
                will automatically stream into your CRM.
              </div>

              <div className="bg-white border border-gray-200 rounded-xl divide-y divide-gray-100 text-[12px]">
                <div className="p-3.5 flex justify-between">
                  <span className="text-gray-500 font-medium">Connection Name</span>
                  <span className="font-semibold text-gray-900">{connectionName}</span>
                </div>
                <div className="p-3.5 flex justify-between">
                  <span className="text-gray-500 font-medium">Connected Facebook Pages</span>
                  <span className="font-semibold text-gray-900">
                    {activePages.map((p) => p.name).join(', ')} ({activePages.length} Pages)
                  </span>
                </div>
                <div className="p-3.5 flex justify-between">
                  <span className="text-gray-500 font-medium">Configured Form Mappings</span>
                  <span className="font-semibold text-gray-900">
                    {allDetectedForms.length} Forms Configured
                  </span>
                </div>
                <div className="p-3.5 flex justify-between">
                  <span className="text-gray-500 font-medium">Fallback Project</span>
                  <span className="font-semibold text-gray-900">
                    {projects.find((p) => p.id === defaultProjectId)?.name || 'None (Unmapped)'}
                  </span>
                </div>
                <div className="p-3.5 flex justify-between">
                  <span className="text-gray-500 font-medium">Data Privacy & Security</span>
                  <span className="text-emerald-700 font-medium flex items-center gap-1">
                    <ShieldCheck className="w-3.5 h-3.5 text-emerald-600" />
                    Strict Organisation Isolation Enforced
                  </span>
                </div>
              </div>

              <p className="text-[11px] text-gray-500 leading-relaxed">
                Note: In this readiness release, saving this connection establishes the complete
                connection foundation and form mappings in your workspace. You can update project
                mappings or disconnect at any time without losing historical leads.
              </p>
            </div>
          )}
        </div>

        {/* Footer Navigation */}
        <div className="flex items-center justify-between px-6 py-4 border-t border-[var(--border)] bg-gray-50/50">
          {currentStep > 1 ? (
            <button
              onClick={() => setCurrentStep((prev) => Math.max(1, prev - 1))}
              disabled={isSubmitting}
              className="px-4 py-2 text-[13px] font-medium text-gray-700 bg-white border border-gray-300 rounded-xl hover:bg-gray-50 transition-colors flex items-center gap-1.5"
            >
              <ArrowLeft className="w-4 h-4" />
              Back
            </button>
          ) : (
            <button
              onClick={onClose}
              disabled={isSubmitting}
              className="px-4 py-2 text-[13px] font-medium text-gray-600 hover:text-gray-900 transition-colors"
            >
              Cancel
            </button>
          )}

          {currentStep < 5 ? (
            <button
              onClick={() => {
                if (currentStep === 3 && selectedPages.length === 0) return
                setCurrentStep((prev) => Math.min(5, prev + 1))
              }}
              disabled={currentStep === 3 && selectedPages.length === 0}
              className="px-5 py-2 text-[13px] font-medium text-white bg-blue-600 rounded-xl hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors flex items-center gap-1.5 shadow-2xs"
            >
              Continue
              <ArrowRight className="w-4 h-4" />
            </button>
          ) : (
            <button
              onClick={handleSaveConnection}
              disabled={isSubmitting}
              className="px-5 py-2 text-[13px] font-medium text-white bg-emerald-600 rounded-xl hover:bg-emerald-700 disabled:opacity-50 transition-colors flex items-center gap-1.5 shadow-2xs"
            >
              {isSubmitting ? (
                <>
                  <RefreshCw className="w-4 h-4 animate-spin" />
                  Saving Connection...
                </>
              ) : (
                <>
                  <CheckCircle2 className="w-4 h-4" />
                  Activate Connection & Mappings
                </>
              )}
            </button>
          )}
        </div>
      </div>
    </div>
  )
}

function getStepTitle(step: number): string {
  switch (step) {
    case 1:
      return 'Overview & Architecture'
    case 2:
      return 'Permissions & Privacy'
    case 3:
      return 'Select Facebook Pages'
    case 4:
      return 'Map Forms to Projects'
    case 5:
      return 'Review & Activate'
    default:
      return ''
  }
}
