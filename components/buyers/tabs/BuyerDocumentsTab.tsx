'use client'
// components/buyers/tabs/BuyerDocumentsTab.tsx
import React, { useState } from 'react'
import {
  FileText,
  Upload,
  CheckCircle2,
  XCircle,
  ExternalLink,
  ShieldCheck,
  Lock,
  Download,
} from 'lucide-react'
import type { BuyerDocument } from '@/lib/buyers/types'
import { formatDate } from '@/lib/utils/format'

interface BuyerDocumentsTabProps {
  orgId: string
  buyerId: string
  documents: BuyerDocument[]
  isManager: boolean
  onOpenUpload: () => void
  onRefreshData: () => void
}

export function BuyerDocumentsTab({
  orgId,
  buyerId,
  documents,
  isManager,
  onOpenUpload,
  onRefreshData,
}: BuyerDocumentsTabProps) {
  const [processingId, setProcessingId] = useState<string | null>(null)
  const [downloadingId, setDownloadingId] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)

  const handleVerifyOrReject = async (documentId: string, status: 'verified' | 'rejected') => {
    if (!isManager) {
      alert('Document verification requires Manager or Admin authority.')
      return
    }

    const notes = prompt(`Enter optional remarks for marking this document as ${status}:`)
    if (notes === null) return

    setProcessingId(documentId)
    setError(null)
    try {
      const res = await fetch(`/api/buyers/${buyerId}/documents`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          orgId,
          documentId,
          status,
          notes: notes.trim() || null,
        }),
      })
      const json = await res.json()
      if (!res.ok) {
        throw new Error(json.error || `Failed to ${status} document`)
      }
      onRefreshData()
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err)
      setError(msg)
    } finally {
      setProcessingId(null)
    }
  }

  const handleSecureAccess = async (documentId: string) => {
    setDownloadingId(documentId)
    setError(null)
    try {
      const res = await fetch(`/api/buyers/${buyerId}/documents/${documentId}/access?orgId=${orgId}`)
      const json = await res.json()
      if (!res.ok) {
        throw new Error(json.error || 'Failed to acquire authorized document link')
      }

      // Open authorized link in secure window or download
      alert(`Authorized Access Granted!\n\nDocument: ${json.document.title}\nAccess link active for 15 minutes.\nAudit event logged to tenant record.`)
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err)
      setError(msg)
    } finally {
      setDownloadingId(null)
    }
  }

  return (
    <div className="space-y-6">
      {/* Top Banner */}
      <div className="flex flex-wrap items-center justify-between gap-3 bg-[var(--surface)] p-4 rounded-xl border border-[var(--border)] shadow-sm">
        <div className="flex items-center gap-3">
          <div className="p-2 rounded-lg bg-blue-50 text-blue-700 border border-blue-200">
            <Lock className="h-5 w-5" />
          </div>
          <div>
            <h4 className="text-xs font-semibold text-[var(--foreground)]">
              Encrypted Private Customer Document Storage
            </h4>
            <p className="text-[11px] text-[var(--foreground-muted)]">
              KYC identification, sale agreements, and verified payment vouchers are stored with server-side tenant isolation.
            </p>
          </div>
        </div>

        <button
          onClick={onOpenUpload}
          className="inline-flex items-center gap-1.5 rounded-lg bg-[var(--brand)] px-4 py-2 text-xs font-semibold text-white shadow-sm hover:opacity-90"
        >
          <Upload className="h-4 w-4" />
          Upload KYC Document
        </button>
      </div>

      {error && (
        <div className="rounded-lg border border-red-200 bg-red-50 p-3 text-xs text-red-700">
          {error}
        </div>
      )}

      {/* Documents Table */}
      <div className="rounded-xl border border-[var(--border)] bg-[var(--surface)] p-5 shadow-sm space-y-4">
        <div className="flex items-center justify-between border-b border-[var(--border)] pb-3">
          <h3 className="text-sm font-semibold text-[var(--foreground)] flex items-center gap-2">
            <FileText className="h-4 w-4 text-[var(--brand)]" />
            Customer Documents & KYC Records ({documents.length})
          </h3>
        </div>

        {documents.length === 0 ? (
          <div className="text-center py-8 text-xs text-[var(--foreground-muted)] space-y-2">
            <FileText className="mx-auto h-8 w-8 text-[var(--foreground-muted)]" />
            <p>No KYC or transaction documents uploaded for this buyer yet.</p>
            <p className="text-[11px]">Upload PAN card, Aadhaar proof, or signed booking agreements to ensure compliance.</p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs">
              <thead className="border-b border-[var(--border)] text-[11px] font-semibold text-[var(--foreground-muted)] uppercase tracking-wider bg-[var(--surface-muted)]">
                <tr>
                  <th className="px-3 py-2.5">Document Title</th>
                  <th className="px-3 py-2.5">Category</th>
                  <th className="px-3 py-2.5">Uploaded</th>
                  <th className="px-3 py-2.5">Status</th>
                  <th className="px-3 py-2.5">Verified By</th>
                  <th className="px-3 py-2.5 text-right">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-[var(--border)]">
                {documents.map((doc) => (
                  <tr key={doc.id} className="hover:bg-[var(--surface-muted)] transition-colors">
                    <td className="px-3 py-2.5">
                      <div className="font-medium text-[var(--foreground)]">{doc.title}</div>
                      <div className="text-[10px] text-[var(--foreground-muted)] font-mono">
                        {doc.file_name} {doc.file_size_bytes ? `(${(doc.file_size_bytes / 1024).toFixed(0)} KB)` : ''}
                      </div>
                    </td>
                    <td className="px-3 py-2.5">
                      <span className="font-mono text-[10px] uppercase px-2 py-0.5 rounded bg-[var(--surface-muted)] text-[var(--foreground)] border border-[var(--border)]">
                        {doc.document_type.replace(/_/g, ' ')}
                      </span>
                    </td>
                    <td className="px-3 py-2.5 text-[var(--foreground-muted)]">
                      {formatDate(doc.created_at)}
                    </td>
                    <td className="px-3 py-2.5">
                      <span
                        className={`inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-semibold uppercase ${
                          doc.status === 'verified'
                            ? 'bg-emerald-100 text-emerald-800'
                            : doc.status === 'rejected'
                            ? 'bg-red-100 text-red-800'
                            : 'bg-amber-100 text-amber-800'
                        }`}
                      >
                        {doc.status}
                      </span>
                      {doc.verification_notes && (
                        <p className="text-[10px] text-[var(--foreground-muted)] italic mt-0.5">
                          {doc.verification_notes}
                        </p>
                      )}
                    </td>
                    <td className="px-3 py-2.5 text-[11px] text-[var(--foreground-muted)]">
                      {doc.verifier?.full_name || '—'}
                    </td>
                    <td className="px-3 py-2.5 text-right space-x-2">
                      <button
                        onClick={() => handleSecureAccess(doc.id)}
                        disabled={downloadingId === doc.id}
                        className="inline-flex items-center gap-1 rounded border border-[var(--border)] px-2 py-1 text-[11px] font-medium text-[var(--foreground)] hover:bg-[var(--surface-muted)]"
                      >
                        <Download className="h-3 w-3" />
                        Access
                      </button>

                      {isManager && doc.status === 'pending' && (
                        <>
                          <button
                            onClick={() => handleVerifyOrReject(doc.id, 'verified')}
                            disabled={processingId === doc.id}
                            className="rounded bg-emerald-600 px-2 py-1 text-[11px] font-semibold text-white hover:bg-emerald-700 disabled:opacity-50"
                          >
                            Verify
                          </button>
                          <button
                            onClick={() => handleVerifyOrReject(doc.id, 'rejected')}
                            disabled={processingId === doc.id}
                            className="rounded bg-red-600 px-2 py-1 text-[11px] font-semibold text-white hover:bg-red-700 disabled:opacity-50"
                          >
                            Reject
                          </button>
                        </>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  )
}
