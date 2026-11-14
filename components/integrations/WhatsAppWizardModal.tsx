// components/integrations/WhatsAppWizardModal.tsx
// Interactive modal for WhatsApp Business Cloud API configuration, template review, and live testing.
'use client'

import { useState } from 'react'
import {
  X,
  MessageCircle,
  ShieldCheck,
  Send,
  FileText,
  Copy,
  Check,
  PhoneCall,
  AlertTriangle,
} from 'lucide-react'
import type { IntegrationConnectionRecord } from '@/lib/integrations/types'
import { STANDARD_REAL_ESTATE_TEMPLATES } from '@/lib/integrations/whatsapp/templates'

interface ProjectOption {
  id: string
  name: string
  category: string
}

interface WhatsAppWizardModalProps {
  isOpen: boolean
  onClose: () => void
  orgId?: string
  projects: ProjectOption[]
  existingConnection?: IntegrationConnectionRecord | null
  onConnectionCreated?: () => void
}

export function WhatsAppWizardModal({
  isOpen,
  onClose,
  projects,
  existingConnection,
}: WhatsAppWizardModalProps) {
  const [activeTab, setActiveTab] = useState<'overview' | 'templates' | 'consent' | 'test'>('overview')

  // Configuration state
  const [phoneNumberId, setPhoneNumberId] = useState('phone_num_skygardens_01')
  const [wabaId, setWabaId] = useState('waba_act_premier_01')
  const [displayPhone, setDisplayPhone] = useState('+91 98765 00001')
  const [selectedProjectId, setSelectedProjectId] = useState<string>(projects[0]?.id || '')
  const [isCopied, setIsCopied] = useState(false)

  // Live test console state
  const [testBuyerName, setTestBuyerName] = useState('Vikram Sen')
  const [testPhone, setTestPhone] = useState('+919876500001')
  const [testMessage, setTestMessage] = useState('Hello, I am interested in 3 BHK flat. Please share pricing.')
  const [testAdHeadline, setTestAdHeadline] = useState('Sky Gardens - Luxury 3 BHK')
  const [testAdId, setTestAdId] = useState('ad_ctwa_skygardens_99')
  const [testLoading, setTestLoading] = useState(false)
  const [testResponse, setTestResponse] = useState<Record<string, unknown> | null>(null)

  const connectionId = existingConnection?.id || 'conn_whatsapp_default'

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
      const mockWamid = `wamid.test_${Date.now()}_${Math.random().toString(36).substring(7)}`
      const payload = {
        object: 'whatsapp_business_account',
        entry: [
          {
            id: wabaId,
            changes: [
              {
                field: 'messages',
                value: {
                  messaging_product: 'whatsapp',
                  metadata: {
                    display_phone_number: displayPhone,
                    phone_number_id: phoneNumberId,
                  },
                  contacts: [
                    {
                      profile: { name: testBuyerName },
                      wa_id: testPhone.replace(/\D/g, ''),
                    },
                  ],
                  messages: [
                    {
                      from: testPhone.replace(/\D/g, ''),
                      id: mockWamid,
                      timestamp: String(Math.floor(Date.now() / 1000)),
                      type: 'text',
                      text: { body: testMessage },
                      referral: testAdHeadline
                        ? {
                            source_url: 'https://fb.me/ad',
                            source_type: 'ad',
                            source_id: testAdId || undefined,
                            headline: testAdHeadline,
                            body: 'Book priority site visit',
                          }
                        : undefined,
                    },
                  ],
                },
              },
            ],
          },
        ],
      }

      const res = await fetch(`/api/webhooks/whatsapp/${connectionId}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
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
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-xs">
      <div className="bg-white rounded-2xl shadow-2xl border border-slate-200 w-full max-w-3xl overflow-hidden flex flex-col max-h-[90vh]">
        {/* Header */}
        <div className="px-6 py-5 border-b border-slate-200 flex items-center justify-between bg-slate-50/50">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-emerald-100 text-emerald-700 flex items-center justify-center font-bold">
              <MessageCircle className="w-5 h-5" />
            </div>
            <div>
              <h2 className="text-base font-bold text-slate-900">WhatsApp Business Cloud API Integration</h2>
              <p className="text-xs text-slate-500">
                Click-to-WhatsApp Ads attribution, conversation history &amp; CRM lead ingestion.
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-2 text-slate-400 hover:text-slate-600 rounded-lg hover:bg-slate-100 transition cursor-pointer"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Tab Navigation */}
        <div className="px-6 pt-3 border-b border-slate-200 flex items-center gap-6 text-sm font-medium">
          <button
            onClick={() => setActiveTab('overview')}
            className={`pb-3 flex items-center gap-2 border-b-2 transition cursor-pointer ${
              activeTab === 'overview'
                ? 'border-emerald-600 text-emerald-700 font-semibold'
                : 'border-transparent text-slate-500 hover:text-slate-700'
            }`}
          >
            <PhoneCall className="w-4 h-4" />
            Setup &amp; Numbers
          </button>

          <button
            onClick={() => setActiveTab('templates')}
            className={`pb-3 flex items-center gap-2 border-b-2 transition cursor-pointer ${
              activeTab === 'templates'
                ? 'border-emerald-600 text-emerald-700 font-semibold'
                : 'border-transparent text-slate-500 hover:text-slate-700'
            }`}
          >
            <FileText className="w-4 h-4" />
            Approved Templates
          </button>

          <button
            onClick={() => setActiveTab('consent')}
            className={`pb-3 flex items-center gap-2 border-b-2 transition cursor-pointer ${
              activeTab === 'consent'
                ? 'border-emerald-600 text-emerald-700 font-semibold'
                : 'border-transparent text-slate-500 hover:text-slate-700'
            }`}
          >
            <ShieldCheck className="w-4 h-4" />
            Consent &amp; Opt-Out
          </button>

          <button
            onClick={() => setActiveTab('test')}
            className={`pb-3 flex items-center gap-2 border-b-2 transition cursor-pointer ${
              activeTab === 'test'
                ? 'border-emerald-600 text-emerald-700 font-semibold'
                : 'border-transparent text-slate-500 hover:text-slate-700'
            }`}
          >
            <Send className="w-4 h-4" />
            Live Inbound Test
          </button>
        </div>

        {/* Content Body */}
        <div className="p-6 overflow-y-auto flex-1 space-y-6">
          {/* TAB 1: Overview & Number Discovery */}
          {activeTab === 'overview' && (
            <div className="space-y-5">
              <div className="p-3.5 bg-amber-50 border border-amber-200 rounded-xl text-xs text-amber-900 flex items-start gap-2.5">
                <AlertTriangle className="w-4 h-4 text-amber-600 flex-shrink-0 mt-0.5" />
                <div>
                  <span className="font-bold">Provider Setup Status: Deferred per DEC-004 &amp; DEC-013.</span>
                  <p className="mt-0.5 text-amber-800">
                    The platform code and Cloud API architecture are verified. Live WhatsApp Business Account
                    registration and phone number verification will occur during final deployment.
                  </p>
                </div>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs font-semibold text-slate-700 mb-1">
                    WhatsApp Business Account ID (WABA)
                  </label>
                  <input
                    type="text"
                    value={wabaId}
                    onChange={(e) => setWabaId(e.target.value)}
                    className="w-full text-xs px-3 py-2 border border-slate-300 rounded-lg bg-slate-50 text-slate-800"
                  />
                </div>

                <div>
                  <label className="block text-xs font-semibold text-slate-700 mb-1">
                    Phone Number ID
                  </label>
                  <input
                    type="text"
                    value={phoneNumberId}
                    onChange={(e) => setPhoneNumberId(e.target.value)}
                    className="w-full text-xs px-3 py-2 border border-slate-300 rounded-lg bg-slate-50 text-slate-800"
                  />
                </div>

                <div>
                  <label className="block text-xs font-semibold text-slate-700 mb-1">
                    Display Phone Number
                  </label>
                  <input
                    type="text"
                    value={displayPhone}
                    onChange={(e) => setDisplayPhone(e.target.value)}
                    className="w-full text-xs px-3 py-2 border border-slate-300 rounded-lg text-slate-800"
                  />
                </div>

                <div>
                  <label className="block text-xs font-semibold text-slate-700 mb-1">
                    Default Project Routing
                  </label>
                  <select
                    value={selectedProjectId}
                    onChange={(e) => setSelectedProjectId(e.target.value)}
                    className="w-full text-xs px-2.5 py-2 border border-slate-300 rounded-lg bg-white text-slate-800"
                  >
                    {projects.map((p) => (
                      <option key={p.id} value={p.id}>
                        {p.name}
                      </option>
                    ))}
                  </select>
                </div>
              </div>

              {/* Webhook Configuration Box */}
              <div className="border border-slate-200 rounded-xl p-4 bg-slate-50 space-y-2">
                <div className="flex items-center justify-between">
                  <span className="text-xs font-bold text-slate-700">Webhook Callback URL:</span>
                  <button
                    onClick={() =>
                      handleCopy(`https://app.productionx.com/api/webhooks/whatsapp/${connectionId}`)
                    }
                    className="text-[11px] text-emerald-700 flex items-center gap-1 hover:underline cursor-pointer"
                  >
                    {isCopied ? <Check className="w-3 h-3 text-emerald-600" /> : <Copy className="w-3 h-3" />}
                    <span>{isCopied ? 'Copied' : 'Copy URL'}</span>
                  </button>
                </div>
                <code className="block p-2 rounded bg-white border border-slate-200 text-xs font-mono text-slate-800 break-all">
                  https://app.productionx.com/api/webhooks/whatsapp/{connectionId}
                </code>
              </div>
            </div>
          )}

          {/* TAB 2: Approved Templates */}
          {activeTab === 'templates' && (
            <div className="space-y-4">
              <p className="text-xs text-slate-600">
                Meta requires pre-approved message templates for business-initiated outreach outside the
                24-hour customer service window.
              </p>

              <div className="space-y-3">
                {STANDARD_REAL_ESTATE_TEMPLATES.map((tpl) => (
                  <div key={tpl.id} className="p-4 rounded-xl border border-slate-200 bg-white space-y-2">
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-2">
                        <span className="text-xs font-bold text-slate-900 font-mono">{tpl.name}</span>
                        <span className="px-2 py-0.5 rounded text-[10px] font-semibold bg-emerald-100 text-emerald-800">
                          {tpl.status}
                        </span>
                        <span className="px-2 py-0.5 rounded text-[10px] font-medium bg-slate-100 text-slate-700">
                          {tpl.category}
                        </span>
                      </div>
                      <span className="text-[11px] text-slate-400">Language: {tpl.language}</span>
                    </div>
                    <div className="p-3 bg-slate-50 rounded-lg text-xs font-mono text-slate-700 whitespace-pre-wrap">
                      {tpl.components.find((c) => c.type === 'BODY')?.text || 'Template Body'}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* TAB 3: Consent & Compliance */}
          {activeTab === 'consent' && (
            <div className="space-y-4">
              <div className="border border-slate-200 rounded-xl p-4 bg-white space-y-2">
                <h4 className="text-xs font-bold text-slate-900 uppercase tracking-wider">
                  Automated Opt-Out &amp; STOP Processing
                </h4>
                <p className="text-xs text-slate-600 leading-relaxed">
                  In compliance with Meta WhatsApp policy and TRAI/DND guidelines, any incoming message
                  matching opt-out keywords immediately flags the lead as opted-out and blocks all outbound
                  automated messages.
                </p>
                <div className="flex flex-wrap gap-1.5 pt-2">
                  {['STOP', 'UNSUBSCRIBE', 'CANCEL', 'QUIT', 'OPT OUT', 'END', 'REVOKE'].map((kw) => (
                    <span
                      key={kw}
                      className="px-2 py-1 rounded bg-rose-50 border border-rose-200 text-rose-800 text-[11px] font-mono font-semibold"
                    >
                      {kw}
                    </span>
                  ))}
                </div>
              </div>

              <div className="border border-slate-200 rounded-xl p-4 bg-white space-y-2">
                <h4 className="text-xs font-bold text-slate-900 uppercase tracking-wider">
                  24-Hour Customer Service Window
                </h4>
                <p className="text-xs text-slate-600 leading-relaxed">
                  Free-form messages can only be sent within 24 hours of the home buyer&apos;s last inbound message.
                  Outside this window, only pre-approved WhatsApp templates can be dispatched.
                </p>
              </div>
            </div>
          )}

          {/* TAB 4: Live Test Console */}
          {activeTab === 'test' && (
            <div className="space-y-4">
              <p className="text-xs text-slate-600">
                Simulate an incoming Click-to-WhatsApp Ads message. This verifies lead creation,
                campaign attribution, and conversation association.
              </p>

              <form onSubmit={handleRunLiveTest} className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs font-semibold text-slate-700 mb-1">
                    Buyer Name *
                  </label>
                  <input
                    type="text"
                    required
                    value={testBuyerName}
                    onChange={(e) => setTestBuyerName(e.target.value)}
                    className="w-full text-xs px-3 py-2 border border-slate-300 rounded-lg text-slate-800"
                  />
                </div>

                <div>
                  <label className="block text-xs font-semibold text-slate-700 mb-1">
                    Buyer WhatsApp Number *
                  </label>
                  <input
                    type="tel"
                    required
                    value={testPhone}
                    onChange={(e) => setTestPhone(e.target.value)}
                    className="w-full text-xs px-3 py-2 border border-slate-300 rounded-lg text-slate-800"
                  />
                </div>

                <div className="md:col-span-2">
                  <label className="block text-xs font-semibold text-slate-700 mb-1">
                    Inbound Message Text
                  </label>
                  <input
                    type="text"
                    required
                    value={testMessage}
                    onChange={(e) => setTestMessage(e.target.value)}
                    className="w-full text-xs px-3 py-2 border border-slate-300 rounded-lg text-slate-800"
                  />
                </div>

                <div>
                  <label className="block text-xs font-semibold text-slate-700 mb-1">
                    Click-to-WhatsApp Ad Headline (Referral)
                  </label>
                  <input
                    type="text"
                    value={testAdHeadline}
                    onChange={(e) => setTestAdHeadline(e.target.value)}
                    className="w-full text-xs px-3 py-2 border border-slate-300 rounded-lg text-slate-800"
                  />
                </div>

                <div>
                  <label className="block text-xs font-semibold text-slate-700 mb-1">
                    Ad ID (Campaign Attribution)
                  </label>
                  <input
                    type="text"
                    value={testAdId}
                    onChange={(e) => setTestAdId(e.target.value)}
                    className="w-full text-xs px-3 py-2 border border-slate-300 rounded-lg text-slate-800"
                  />
                </div>

                <div className="md:col-span-2 pt-2">
                  <button
                    type="submit"
                    disabled={testLoading}
                    className="w-full py-2.5 px-4 bg-emerald-600 hover:bg-emerald-700 text-white font-medium rounded-lg text-xs shadow-sm transition disabled:opacity-50 cursor-pointer flex items-center justify-center gap-2"
                  >
                    {testLoading ? 'Processing Inbound Event...' : 'Simulate Inbound WhatsApp Event'}
                  </button>
                </div>
              </form>

              {testResponse && (
                <div className="mt-4 p-4 rounded-xl border border-slate-200 bg-slate-50 font-mono text-xs">
                  <div className="flex items-center justify-between mb-2">
                    <span className="font-bold text-slate-700">Webhook Dispatch Outcome:</span>
                    <span
                      className={`px-2 py-0.5 rounded text-[11px] font-semibold ${
                        testResponse.success
                          ? 'bg-emerald-100 text-emerald-800'
                          : 'bg-rose-100 text-rose-800'
                      }`}
                    >
                      HTTP {String(testResponse.httpStatus || 200)}
                    </span>
                  </div>
                  <pre className="text-slate-800 overflow-x-auto text-[11px]">
                    {JSON.stringify(testResponse, null, 2)}
                  </pre>
                </div>
              )}
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="px-6 py-4 border-t border-slate-200 bg-slate-50/50 flex items-center justify-end">
          <button
            onClick={onClose}
            className="px-4 py-2 text-xs font-medium text-slate-600 hover:text-slate-800 hover:bg-slate-100 rounded-lg transition cursor-pointer"
          >
            Close
          </button>
        </div>
      </div>
    </div>
  )
}
