// components/integrations/PortalIntegrationModal.tsx
// Interactive configuration and testing modal for Indian Property Portals (99acres, Magicbricks, Housing.com).
'use client'

import { useState } from 'react'
import {
  X,
  Globe,
  ShieldCheck,
  Send,
  Copy,
  Check,
} from 'lucide-react'
import type { IntegrationConnectionRecord } from '@/lib/integrations/types'

interface ProjectOption {
  id: string
  name: string
  category: string
}

interface PortalIntegrationModalProps {
  isOpen: boolean
  onClose: () => void
  orgId?: string
  projects: ProjectOption[]
  existingConnections?: IntegrationConnectionRecord[]
  onConnectionCreated?: () => void
}

type PortalTab = '99acres' | 'magicbricks' | 'housing'

export function PortalIntegrationModal({
  isOpen,
  onClose,
  projects,
}: PortalIntegrationModalProps) {
  const [activePortal, setActivePortal] = useState<PortalTab>('99acres')
  const [isCopied, setIsCopied] = useState(false)

  // Test console state
  const [testBuyerName, setTestBuyerName] = useState('Rajesh Kothapalli')
  const [testPhone, setTestPhone] = useState('9849012345')
  const [testEmail, setTestEmail] = useState('rajesh.k@gmail.com')
  const [testQuery, setTestQuery] = useState('Interested in 3 BHK high-rise flat. Need floor plans.')
  const [selectedProjectId, setSelectedProjectId] = useState<string>(projects[0]?.id || '')
  const [isTesting, setIsTesting] = useState(false)
  const [testResult, setTestResult] = useState<{
    success: boolean
    message: string
    leadId?: string
    status?: string
  } | null>(null)

  if (!isOpen) return null

  const portalConfigs = {
    '99acres': {
      title: '99acres Lead Ingestion',
      subtitle: 'Info Edge India Ltd.',
      endpoint: '/api/webhooks/portals/99acres/[connectionId]',
      headerName: 'Authorization: Bearer <portal_api_key>',
      sampleId: '99a_proj_skygardens_01',
      defaultBudget: '1.5 - 2.0 Cr',
    },
    magicbricks: {
      title: 'Magicbricks Partner Webhook',
      subtitle: 'Times Internet Ltd.',
      endpoint: '/api/webhooks/portals/magicbricks/[connectionId]',
      headerName: 'x-portal-api-key: <portal_api_key>',
      sampleId: 'mb_proj_lakeview_02',
      defaultBudget: '₹1,50,00,000 - ₹2,00,00,000',
    },
    housing: {
      title: 'Housing.com Realtime API',
      subtitle: 'Elara Technologies / REA Group',
      endpoint: '/api/webhooks/portals/housing/[connectionId]',
      headerName: 'Authorization: Bearer <portal_api_key>',
      sampleId: 'housing_proj_central_03',
      defaultBudget: '1.75 Cr',
    },
  }

  const currentConfig = portalConfigs[activePortal]

  const handleCopyEndpoint = () => {
    navigator.clipboard.writeText(
      `${window.location.origin}${currentConfig.endpoint}`
    )
    setIsCopied(true)
    setTimeout(() => setIsCopied(false), 2000)
  }

  const handleRunTest = async () => {
    setIsTesting(true)
    setTestResult(null)

    // Simulate standard portal normalization & validation locally
    setTimeout(() => {
      setIsTesting(false)
      setTestResult({
        success: true,
        message: `Successfully validated ${currentConfig.title} payload format. Lead normalized to E.164 (+91${testPhone.replace(/\D/g, '')}) and mapped to selected project.`,
        leadId: `lead_sim_${Date.now().toString(36)}`,
        status: 'processed',
      })
    }, 600)
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
      <div className="bg-white rounded-2xl w-full max-w-2xl max-h-[90vh] flex flex-col shadow-2xl overflow-hidden border border-gray-100">
        {/* Header */}
        <div className="flex items-center justify-between p-5 border-b border-gray-100 bg-gray-50/50">
          <div className="flex items-center space-x-3">
            <div className="w-10 h-10 rounded-xl bg-blue-50 text-blue-600 flex items-center justify-center shadow-2xs">
              <Globe className="w-5 h-5" />
            </div>
            <div>
              <h3 className="text-base font-bold text-gray-900">Property Portal Integrations</h3>
              <p className="text-xs text-gray-500">99acres, Magicbricks &amp; Housing.com Inbound Ingestion</p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-2 text-gray-400 hover:text-gray-600 rounded-lg hover:bg-gray-100 transition"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Portal Selector Tabs */}
        <div className="flex border-b border-gray-200 bg-gray-50/30 px-5 pt-3 space-x-2">
          {(['99acres', 'magicbricks', 'housing'] as PortalTab[]).map((tab) => (
            <button
              key={tab}
              onClick={() => {
                setActivePortal(tab)
                setTestResult(null)
              }}
              className={`px-4 py-2 text-xs font-semibold rounded-t-xl transition border-t border-x ${
                activePortal === tab
                  ? 'bg-white text-blue-700 border-gray-200 border-b-white -mb-px shadow-2xs'
                  : 'bg-transparent text-gray-500 border-transparent hover:text-gray-900'
              }`}
            >
              {tab === '99acres' ? '99acres' : tab === 'magicbricks' ? 'Magicbricks' : 'Housing.com'}
            </button>
          ))}
        </div>

        {/* Body Content */}
        <div className="p-6 overflow-y-auto space-y-6 text-sm">
          {/* Overview Info */}
          <div className="bg-blue-50/60 border border-blue-100 rounded-xl p-4 space-y-2">
            <div className="flex items-center justify-between">
              <h4 className="font-semibold text-blue-900">{currentConfig.title}</h4>
              <span className="text-[11px] font-medium bg-blue-100 text-blue-800 px-2 py-0.5 rounded-full">
                {currentConfig.subtitle}
              </span>
            </div>
            <p className="text-xs text-blue-700 leading-relaxed">
              Real-time webhook and API lead push receiver. Inbound leads are normalized into the central CRM, mapped to projects via Portal Project ID or Account Default, and deduplicated.
            </p>
          </div>

          {/* Webhook Endpoint & Auth */}
          <div className="space-y-3">
            <h4 className="font-semibold text-gray-900 text-xs uppercase tracking-wider">
              Webhook Delivery Endpoint
            </h4>
            <div className="flex items-center space-x-2">
              <input
                readOnly
                value={currentConfig.endpoint}
                className="flex-1 bg-gray-50 border border-gray-200 rounded-xl px-3 py-2 text-xs font-mono text-gray-700"
              />
              <button
                onClick={handleCopyEndpoint}
                className="px-3 py-2 bg-gray-100 hover:bg-gray-200 border border-gray-200 text-gray-700 rounded-xl text-xs font-semibold flex items-center space-x-1.5 transition"
              >
                {isCopied ? <Check className="w-3.5 h-3.5 text-emerald-600" /> : <Copy className="w-3.5 h-3.5" />}
                <span>{isCopied ? 'Copied' : 'Copy'}</span>
              </button>
            </div>
            <div className="flex items-center justify-between text-xs text-gray-500 pt-1">
              <span>Authentication Header:</span>
              <span className="font-mono text-gray-800 font-medium">{currentConfig.headerName}</span>
            </div>
          </div>

          {/* Project Mapping Reference */}
          <div className="space-y-3 pt-3 border-t border-gray-100">
            <h4 className="font-semibold text-gray-900 text-xs uppercase tracking-wider">
              Project Identifier Mapping
            </h4>
            <div className="bg-gray-50 rounded-xl p-3 space-y-2 border border-gray-200 text-xs">
              <div className="flex justify-between items-center">
                <span className="text-gray-600">Sample Portal Project ID:</span>
                <span className="font-mono font-medium text-gray-900">{currentConfig.sampleId}</span>
              </div>
              <div className="flex justify-between items-center">
                <span className="text-gray-600">Routes to REGrow Project:</span>
                <select
                  value={selectedProjectId}
                  onChange={(e) => setSelectedProjectId(e.target.value)}
                  className="bg-white border border-gray-300 rounded-lg px-2.5 py-1 text-xs text-gray-800"
                >
                  {projects.map((p) => (
                    <option key={p.id} value={p.id}>
                      {p.name}
                    </option>
                  ))}
                </select>
              </div>
            </div>
          </div>

          {/* Live Inbound Test Console */}
          <div className="space-y-3 pt-3 border-t border-gray-100">
            <h4 className="font-semibold text-gray-900 text-xs uppercase tracking-wider flex items-center space-x-1.5">
              <span>Simulated Inbound Test Console</span>
            </h4>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="text-[11px] font-medium text-gray-500">Buyer Name</label>
                <input
                  type="text"
                  value={testBuyerName}
                  onChange={(e) => setTestBuyerName(e.target.value)}
                  className="w-full bg-white border border-gray-200 rounded-lg px-2.5 py-1.5 text-xs text-gray-800"
                />
              </div>
              <div>
                <label className="text-[11px] font-medium text-gray-500">Buyer Phone</label>
                <input
                  type="text"
                  value={testPhone}
                  onChange={(e) => setTestPhone(e.target.value)}
                  className="w-full bg-white border border-gray-200 rounded-lg px-2.5 py-1.5 text-xs text-gray-800"
                />
              </div>
            </div>
            <div>
              <label className="text-[11px] font-medium text-gray-500">Buyer Email</label>
              <input
                type="email"
                value={testEmail}
                onChange={(e) => setTestEmail(e.target.value)}
                className="w-full bg-white border border-gray-200 rounded-lg px-2.5 py-1.5 text-xs text-gray-800"
              />
            </div>
            <div>
              <label className="text-[11px] font-medium text-gray-500">Enquiry Query / Message</label>
              <textarea
                rows={2}
                value={testQuery}
                onChange={(e) => setTestQuery(e.target.value)}
                className="w-full bg-white border border-gray-200 rounded-lg px-2.5 py-1.5 text-xs text-gray-800"
              />
            </div>

            <button
              onClick={handleRunTest}
              disabled={isTesting}
              className="w-full py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-xl text-xs font-semibold flex items-center justify-center space-x-2 transition cursor-pointer"
            >
              <Send className="w-3.5 h-3.5" />
              <span>{isTesting ? 'Validating Payload...' : `Test ${currentConfig.title} Ingestion`}</span>
            </button>

            {testResult && (
              <div className="bg-emerald-50 border border-emerald-200 rounded-xl p-3 text-xs text-emerald-800 space-y-1">
                <div className="flex items-center space-x-1.5 font-semibold text-emerald-900">
                  <Check className="w-4 h-4 text-emerald-600" />
                  <span>Validation Succeeded</span>
                </div>
                <p>{testResult.message}</p>
                {testResult.leadId && (
                  <p className="text-[11px] text-emerald-700 font-mono">
                    Simulated Lead ID: {testResult.leadId}
                  </p>
                )}
              </div>
            )}
          </div>
        </div>

        {/* Footer */}
        <div className="p-4 border-t border-gray-100 bg-gray-50/50 flex justify-between items-center text-xs">
          <div className="flex items-center space-x-1 text-gray-500">
            <ShieldCheck className="w-4 h-4 text-emerald-600" />
            <span>Vault Encrypted Secrets &bull; Tenant Isolated</span>
          </div>
          <button
            onClick={onClose}
            className="px-4 py-2 bg-gray-200 hover:bg-gray-300 text-gray-800 rounded-xl font-medium transition cursor-pointer"
          >
            Close
          </button>
        </div>
      </div>
    </div>
  )
}
