// components/integrations/ConnectionDetailsModal.tsx
// Comprehensive connection management modal for viewing assets, updating project mappings, and disconnecting/reconnecting.
'use client'

import { useState } from 'react'
import {
  X,
  ShieldCheck,
  CheckCircle2,
  AlertTriangle,
  RefreshCw,
  PowerOff,
  Layers,
  FileText,
  Trash2,
  Save,
  Plus,
} from 'lucide-react'
import { FacebookIcon } from '@/components/icons/FacebookIcon'
import type {
  IntegrationConnectionRecord,
  IntegrationProjectMappingRecord,
  MetaPageAsset,
} from '@/lib/integrations/types'

interface ProjectOption {
  id: string
  name: string
  category: string
}

interface ConnectionDetailsModalProps {
  isOpen: boolean
  onClose: () => void
  connection: (IntegrationConnectionRecord & { mappings?: IntegrationProjectMappingRecord[] }) | null
  projects: ProjectOption[]
  onRefreshNeeded: () => void
}

export function ConnectionDetailsModal({
  isOpen,
  onClose,
  connection,
  projects,
  onRefreshNeeded,
}: ConnectionDetailsModalProps) {
  const [activeTab, setActiveTab] = useState<'mappings' | 'assets' | 'settings'>('mappings')
  const [isUpdating, setIsUpdating] = useState(false)
  const [actionError, setActionError] = useState<string | null>(null)
  const [actionSuccess, setActionSuccess] = useState<string | null>(null)
  const [showDisconnectConfirm, setShowDisconnectConfirm] = useState(false)

  // Local state for editing mappings
  const [editingMappings, setEditingMappings] = useState<Record<string, string>>({})
  const [newFormId, setNewFormId] = useState('')
  const [newFormDescription, setNewFormDescription] = useState('')
  const [newFormProjectId, setNewFormProjectId] = useState(projects[0]?.id || '')
  const [isAddingMapping, setIsAddingMapping] = useState(false)

  if (!isOpen || !connection) return null

  const metadata = (connection.metadata || {}) as Record<string, unknown>
  const pages = (metadata.pages || []) as MetaPageAsset[]
  const isConnected = connection.status === 'connected'
  const isError = connection.status === 'error'
  const isDisabled = connection.status === 'disabled'

  // Format date helper
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

  // Handle single mapping project update
  const handleUpdateMappingProject = async (mappingId: string, newProjectId: string) => {
    setIsUpdating(true)
    setActionError(null)
    setActionSuccess(null)

    try {
      const res = await fetch(`/api/integrations/mappings/${mappingId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ projectId: newProjectId }),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error || 'Failed to update project mapping')

      setActionSuccess('Mapping updated successfully. Future leads will route to the new project.')
      onRefreshNeeded()
    } catch (err: unknown) {
      setActionError(err instanceof Error ? err.message : 'Failed to update mapping')
    } finally {
      setIsUpdating(false)
    }
  }

  // Handle mapping deletion
  const handleDeleteMapping = async (mappingId: string) => {
    if (!confirm('Are you sure you want to remove this project mapping? Incoming leads for this form will use the account default project.')) {
      return
    }

    setIsUpdating(true)
    setActionError(null)
    setActionSuccess(null)

    try {
      const res = await fetch(`/api/integrations/mappings/${mappingId}`, {
        method: 'DELETE',
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error || 'Failed to delete project mapping')

      setActionSuccess('Mapping removed. Historical leads remain unaffected.')
      onRefreshNeeded()
    } catch (err: unknown) {
      setActionError(err instanceof Error ? err.message : 'Failed to delete mapping')
    } finally {
      setIsUpdating(false)
    }
  }

  // Handle adding a new mapping
  const handleCreateNewMapping = async () => {
    if (!newFormId.trim()) {
      setActionError('Please enter a valid Lead Form ID or Campaign ID')
      return
    }
    if (!newFormProjectId) {
      setActionError('Please select a target project')
      return
    }

    setIsUpdating(true)
    setActionError(null)
    setActionSuccess(null)

    try {
      const res = await fetch('/api/integrations/mappings', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          connectionId: connection.id,
          projectId: newFormProjectId,
          externalIdentifierType: 'form_id',
          externalIdentifierValue: newFormId.trim(),
          description: newFormDescription.trim() || `Form ID: ${newFormId.trim()}`,
        }),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error || 'Failed to create project mapping')

      setNewFormId('')
      setNewFormDescription('')
      setIsAddingMapping(false)
      setActionSuccess('New form mapping added successfully.')
      onRefreshNeeded()
    } catch (err: unknown) {
      setActionError(err instanceof Error ? err.message : 'Failed to create mapping')
    } finally {
      setIsUpdating(false)
    }
  }

  // Handle Disconnect
  const handleDisconnect = async () => {
    setIsUpdating(true)
    setActionError(null)

    try {
      const res = await fetch(`/api/integrations/connections/${connection.id}/disconnect`, {
        method: 'POST',
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error || 'Failed to disconnect integration')

      setShowDisconnectConfirm(false)
      setActionSuccess('Connection disabled. All historical leads are preserved.')
      onRefreshNeeded()
      onClose()
    } catch (err: unknown) {
      setActionError(err instanceof Error ? err.message : 'Failed to disconnect')
    } finally {
      setIsUpdating(false)
    }
  }

  // Handle Reconnect
  const handleReconnect = async () => {
    setIsUpdating(true)
    setActionError(null)
    setActionSuccess(null)

    try {
      const res = await fetch(`/api/integrations/connections/${connection.id}/reconnect`, {
        method: 'POST',
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error || 'Failed to reconnect integration')

      setActionSuccess('Connection re-activated. Normal sync resumed.')
      onRefreshNeeded()
    } catch (err: unknown) {
      setActionError(err instanceof Error ? err.message : 'Failed to reconnect')
    } finally {
      setIsUpdating(false)
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-xs">
      <div className="bg-[var(--surface)] border border-[var(--border)] rounded-2xl w-full max-w-3xl max-h-[90vh] flex flex-col shadow-2xl overflow-hidden animate-in fade-in zoom-in-95 duration-150">
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-[var(--border)] bg-gray-50/50">
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 rounded-xl bg-blue-600 flex items-center justify-center text-white shadow-2xs">
              <FacebookIcon className="w-5 h-5" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h2 className="text-[16px] font-bold text-[var(--foreground)]">{connection.name}</h2>
                <span
                  className={`inline-flex items-center px-2 py-0.5 rounded-full text-[11px] font-semibold border ${
                    isConnected
                      ? 'bg-emerald-50 text-emerald-700 border-emerald-200'
                      : isError
                      ? 'bg-red-50 text-red-700 border-red-200'
                      : isDisabled
                      ? 'bg-gray-100 text-gray-700 border-gray-200'
                      : 'bg-amber-50 text-amber-700 border-amber-200'
                  }`}
                >
                  {isConnected
                    ? 'Active & Healthy'
                    : isError
                    ? 'Action Required'
                    : isDisabled
                    ? 'Disabled'
                    : 'Not Connected (Awaiting Meta OAuth in Stage 4B)'}
                </span>
              </div>
              <p className="text-[12px] text-[var(--foreground-muted)]">
                Status: {connection.status} • Planned Forms: {connection.mappings?.length || 0} •
                Last Sync: {formatDate(connection.last_sync_at)}
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

        {/* Tab Navigation */}
        <div className="flex border-b border-[var(--border)] bg-gray-50/20 px-6 text-[13px] font-medium">
          <button
            onClick={() => setActiveTab('mappings')}
            className={`py-3 px-3 border-b-2 transition-colors flex items-center gap-2 ${
              activeTab === 'mappings'
                ? 'border-blue-600 text-blue-600 font-semibold'
                : 'border-transparent text-gray-500 hover:text-gray-900'
            }`}
          >
            <Layers className="w-4 h-4" />
            Form-to-Project Mappings ({connection.mappings?.length || 0})
          </button>
          <button
            onClick={() => setActiveTab('assets')}
            className={`py-3 px-3 border-b-2 transition-colors flex items-center gap-2 ${
              activeTab === 'assets'
                ? 'border-blue-600 text-blue-600 font-semibold'
                : 'border-transparent text-gray-500 hover:text-gray-900'
            }`}
          >
            <FileText className="w-4 h-4" />
            Connected Facebook Pages ({pages.length})
          </button>
          <button
            onClick={() => setActiveTab('settings')}
            className={`py-3 px-3 border-b-2 transition-colors flex items-center gap-2 ${
              activeTab === 'settings'
                ? 'border-blue-600 text-blue-600 font-semibold'
                : 'border-transparent text-gray-500 hover:text-gray-900'
            }`}
          >
            <ShieldCheck className="w-4 h-4" />
            Connection Health & Settings
          </button>
        </div>

        {/* Body */}
        <div className="p-6 overflow-y-auto flex-1 space-y-4">
          {actionError && (
            <div className="p-3.5 rounded-xl bg-red-50 border border-red-200 text-red-700 text-[13px] flex items-start gap-2.5">
              <AlertTriangle className="w-4 h-4 mt-0.5 flex-shrink-0 text-red-600" />
              <span>{actionError}</span>
            </div>
          )}

          {actionSuccess && (
            <div className="p-3.5 rounded-xl bg-emerald-50 border border-emerald-200 text-emerald-800 text-[13px] flex items-start gap-2.5">
              <CheckCircle2 className="w-4 h-4 mt-0.5 flex-shrink-0 text-emerald-600" />
              <span>{actionSuccess}</span>
            </div>
          )}

          {/* TAB 1: FORM-TO-PROJECT MAPPINGS */}
          {activeTab === 'mappings' && (
            <div className="space-y-4">
              <div className="flex items-center justify-between">
                <div>
                  <h3 className="text-[14px] font-bold text-gray-900">Project Routing Rules</h3>
                  <p className="text-[12px] text-gray-600">
                    Control which real estate project each Meta form routes into. Updating a mapping
                    does not delete past leads.
                  </p>
                </div>
                <button
                  onClick={() => setIsAddingMapping(!isAddingMapping)}
                  className="px-3 py-1.5 text-[12px] font-medium text-blue-600 bg-blue-50 border border-blue-200 rounded-lg hover:bg-blue-100 transition-colors flex items-center gap-1.5"
                >
                  <Plus className="w-3.5 h-3.5" />
                  Add Manual Form Mapping
                </button>
              </div>

              {/* Add Mapping Drawer */}
              {isAddingMapping && (
                <div className="p-4 rounded-xl border border-blue-200 bg-blue-50/40 space-y-3">
                  <h4 className="text-[13px] font-semibold text-blue-950">Add Lead Form Mapping</h4>
                  <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
                    <div>
                      <label className="block text-[11px] font-medium text-gray-700 mb-1">
                        Meta Form ID or Campaign ID
                      </label>
                      <input
                        type="text"
                        value={newFormId}
                        onChange={(e) => setNewFormId(e.target.value)}
                        placeholder="e.g. 10928374652"
                        className="w-full px-3 py-1.5 text-[12px] rounded-lg border border-gray-300 bg-white"
                      />
                    </div>
                    <div>
                      <label className="block text-[11px] font-medium text-gray-700 mb-1">
                        Form Label / Description
                      </label>
                      <input
                        type="text"
                        value={newFormDescription}
                        onChange={(e) => setNewFormDescription(e.target.value)}
                        placeholder="e.g. VIP Phase 2 Form"
                        className="w-full px-3 py-1.5 text-[12px] rounded-lg border border-gray-300 bg-white"
                      />
                    </div>
                    <div>
                      <label className="block text-[11px] font-medium text-gray-700 mb-1">
                        Destination Project
                      </label>
                      <select
                        value={newFormProjectId}
                        onChange={(e) => setNewFormProjectId(e.target.value)}
                        className="w-full px-3 py-1.5 text-[12px] rounded-lg border border-gray-300 bg-white"
                      >
                        {projects.map((p) => (
                          <option key={p.id} value={p.id}>
                            {p.name}
                          </option>
                        ))}
                      </select>
                    </div>
                  </div>
                  <div className="flex justify-end gap-2 pt-1">
                    <button
                      onClick={() => setIsAddingMapping(false)}
                      className="px-3 py-1 text-[12px] text-gray-600 hover:text-gray-900"
                    >
                      Cancel
                    </button>
                    <button
                      onClick={handleCreateNewMapping}
                      disabled={isUpdating}
                      className="px-4 py-1 text-[12px] font-medium text-white bg-blue-600 rounded-lg hover:bg-blue-700"
                    >
                      Save Rule
                    </button>
                  </div>
                </div>
              )}

              {/* Mappings Table */}
              <div className="border border-gray-200 rounded-xl overflow-hidden bg-white shadow-2xs">
                <table className="w-full text-left text-[12px]">
                  <thead className="bg-gray-50 border-b border-gray-200 text-gray-600 font-semibold">
                    <tr>
                      <th className="py-2.5 px-4">Identifier / Form</th>
                      <th className="py-2.5 px-4">Type</th>
                      <th className="py-2.5 px-4">Mapped Production X Project</th>
                      <th className="py-2.5 px-4 text-right">Actions</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-100">
                    {connection.mappings && connection.mappings.length > 0 ? (
                      connection.mappings.map((mapping) => {
                        const currentVal = editingMappings[mapping.id] ?? mapping.project_id
                        const hasChanged = currentVal !== mapping.project_id

                        return (
                          <tr key={mapping.id} className="hover:bg-gray-50/60 transition-colors">
                            <td className="py-3 px-4">
                              <p className="font-semibold text-gray-900">
                                {mapping.description || mapping.external_identifier_value}
                              </p>
                              <p className="text-[11px] text-gray-500 font-mono">
                                ID: {mapping.external_identifier_value}
                              </p>
                            </td>
                            <td className="py-3 px-4">
                              <span className="capitalize px-2 py-0.5 rounded-full text-[11px] bg-gray-100 text-gray-700 font-medium">
                                {mapping.external_identifier_type.replace('_', ' ')}
                              </span>
                            </td>
                            <td className="py-3 px-4">
                              <div className="flex items-center gap-2">
                                <select
                                  value={currentVal}
                                  onChange={(e) =>
                                    setEditingMappings((prev) => ({
                                      ...prev,
                                      [mapping.id]: e.target.value,
                                    }))
                                  }
                                  className="px-2.5 py-1 text-[12px] rounded-lg border border-gray-300 bg-white text-gray-900 focus:ring-1 focus:ring-blue-500"
                                >
                                  {projects.map((proj) => (
                                    <option key={proj.id} value={proj.id}>
                                      {proj.name} ({proj.category})
                                    </option>
                                  ))}
                                </select>
                                {hasChanged && (
                                  <button
                                    onClick={() => handleUpdateMappingProject(mapping.id, currentVal)}
                                    disabled={isUpdating}
                                    title="Save project change"
                                    className="p-1 rounded-md text-emerald-600 hover:bg-emerald-50 border border-emerald-300"
                                  >
                                    <Save className="w-3.5 h-3.5" />
                                  </button>
                                )}
                              </div>
                            </td>
                            <td className="py-3 px-4 text-right">
                              <button
                                onClick={() => handleDeleteMapping(mapping.id)}
                                disabled={isUpdating}
                                title="Delete mapping"
                                className="p-1 text-gray-400 hover:text-red-600 rounded-md hover:bg-red-50 transition-colors"
                              >
                                <Trash2 className="w-3.5 h-3.5" />
                              </button>
                            </td>
                          </tr>
                        )
                      })
                    ) : (
                      <tr>
                        <td colSpan={4} className="py-8 text-center text-gray-500">
                          No project mappings configured yet. Click &quot;Add Manual Form Mapping&quot; to route
                          incoming Meta forms.
                        </td>
                      </tr>
                    )}
                  </tbody>
                </table>
              </div>
            </div>
          )}

          {/* TAB 2: CONNECTED PAGES & ASSETS */}
          {activeTab === 'assets' && (
            <div className="space-y-4">
              <div>
                <h3 className="text-[14px] font-bold text-gray-900">Connected Facebook Pages</h3>
                <p className="text-[12px] text-gray-600">
                  Business Pages currently authorized through this Meta connection.
                </p>
              </div>

              <div className="space-y-3">
                {pages.length > 0 ? (
                  pages.map((page) => (
                    <div
                      key={page.id}
                      className="p-4 rounded-xl border border-gray-200 bg-white space-y-3 shadow-2xs"
                    >
                      <div className="flex items-center justify-between">
                        <div className="flex items-center gap-3">
                          <div className="w-8 h-8 rounded-lg bg-blue-50 text-blue-600 flex items-center justify-center font-bold text-[13px]">
                            FP
                          </div>
                          <div>
                            <p className="text-[13px] font-semibold text-gray-900">{page.name}</p>
                            <p className="text-[11px] text-gray-500">
                              {page.category || 'Real Estate'} • Page ID: {page.id}
                            </p>
                          </div>
                        </div>
                        <span className="text-[11px] font-medium px-2 py-0.5 rounded-full bg-emerald-50 text-emerald-700 border border-emerald-200">
                          Active & Synced
                        </span>
                      </div>

                      {page.forms && page.forms.length > 0 && (
                        <div className="pt-2 border-t border-gray-100 space-y-1.5 pl-2">
                          <p className="text-[11px] font-semibold text-gray-600 uppercase tracking-wider">
                            Active Lead Forms on this Page ({page.forms.length})
                          </p>
                          {page.forms.map((form) => (
                            <div
                              key={form.id}
                              className="text-[12px] text-gray-700 flex items-center justify-between py-0.5"
                            >
                              <span className="flex items-center gap-1.5">
                                <FileText className="w-3.5 h-3.5 text-gray-400" />
                                {form.name}
                              </span>
                              <span className="text-[11px] text-gray-400 font-mono">
                                Form ID: {form.id}
                              </span>
                            </div>
                          ))}
                        </div>
                      )}
                    </div>
                  ))
                ) : (
                  <div className="p-6 text-center text-gray-500 border border-dashed border-gray-300 rounded-xl">
                    No Facebook Pages listed in connection metadata.
                  </div>
                )}
              </div>
            </div>
          )}

          {/* TAB 3: CONNECTION HEALTH & SETTINGS */}
          {activeTab === 'settings' && (
            <div className="space-y-4">
              <div className="bg-gray-50 border border-gray-200 rounded-xl p-4 space-y-3 text-[12px]">
                <h4 className="font-bold text-gray-900 text-[13px] flex items-center gap-2">
                  <ShieldCheck className="w-4 h-4 text-emerald-600" />
                  Connection Security Summary
                </h4>
                <div className="grid grid-cols-2 gap-3 text-gray-700">
                  <div>
                    <span className="text-gray-500 block">Integration Provider</span>
                    <span className="font-semibold text-gray-900">Meta Lead Ads</span>
                  </div>
                  <div>
                    <span className="text-gray-500 block">Status</span>
                    <span className="font-semibold capitalize text-gray-900">
                      {connection.status}
                    </span>
                  </div>
                  <div>
                    <span className="text-gray-500 block">Credential Storage</span>
                    <span className="font-semibold text-gray-700">
                      OAuth Handshake Pending (Stage 4B)
                    </span>
                  </div>
                  <div>
                    <span className="text-gray-500 block">Lead Data Privacy</span>
                    <span className="font-semibold text-emerald-700">
                      Strict Multi-Tenant Isolation
                    </span>
                  </div>
                </div>
              </div>

              {connection.last_error && (
                <div className="p-4 rounded-xl bg-red-50 border border-red-200 text-red-900 text-[13px] space-y-1">
                  <p className="font-semibold flex items-center gap-1.5 text-red-950">
                    <AlertTriangle className="w-4 h-4 text-red-600" />
                    Last Reported Sync Issue
                  </p>
                  <p className="text-red-800 text-[12px]">{connection.last_error}</p>
                </div>
              )}

              {/* Actions Area */}
              <div className="pt-3 border-t border-gray-200 flex items-center justify-between">
                <div>
                  <button
                    onClick={handleReconnect}
                    disabled={isUpdating}
                    className="px-4 py-2 text-[12px] font-medium text-blue-700 bg-blue-50 border border-blue-200 rounded-xl hover:bg-blue-100 transition-colors flex items-center gap-1.5"
                  >
                    <RefreshCw className="w-3.5 h-3.5" />
                    Refresh & Test Connection
                  </button>
                </div>

                <div>
                  {!showDisconnectConfirm ? (
                    <button
                      onClick={() => setShowDisconnectConfirm(true)}
                      className="px-4 py-2 text-[12px] font-medium text-red-600 bg-red-50 border border-red-200 rounded-xl hover:bg-red-100 transition-colors flex items-center gap-1.5"
                    >
                      <PowerOff className="w-3.5 h-3.5" />
                      Disconnect Integration
                    </button>
                  ) : (
                    <div className="flex items-center gap-2">
                      <span className="text-[11px] text-red-600 font-medium">
                        Confirm disconnect? Historical leads will be preserved.
                      </span>
                      <button
                        onClick={() => setShowDisconnectConfirm(false)}
                        className="px-2.5 py-1 text-[11px] text-gray-600 border border-gray-300 rounded-lg hover:bg-gray-100"
                      >
                        Cancel
                      </button>
                      <button
                        onClick={handleDisconnect}
                        disabled={isUpdating}
                        className="px-3 py-1 text-[11px] font-medium text-white bg-red-600 rounded-lg hover:bg-red-700 shadow-2xs"
                      >
                        Yes, Disconnect
                      </button>
                    </div>
                  )}
                </div>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
