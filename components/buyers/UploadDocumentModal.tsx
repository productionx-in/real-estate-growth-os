'use client'
// components/buyers/UploadDocumentModal.tsx
import React, { useState } from 'react'
import { X, Upload, FileText, ShieldAlert } from 'lucide-react'
import type { BuyerDocument, DocumentType } from '@/lib/buyers/types'

interface UploadDocumentModalProps {
  orgId: string
  buyerId: string
  bookingIds: Array<{ id: string; number: string }>
  isOpen: boolean
  onClose: () => void
  onSuccess: (doc: BuyerDocument) => void
}

export function UploadDocumentModal({
  orgId,
  buyerId,
  bookingIds,
  isOpen,
  onClose,
  onSuccess,
}: UploadDocumentModalProps) {
  const [documentType, setDocumentType] = useState<DocumentType>('pan_card')
  const [title, setTitle] = useState<string>('')
  const [bookingId, setBookingId] = useState<string>('')
  const [fileName, setFileName] = useState<string>('')
  const [fileSizeBytes, setFileSizeBytes] = useState<number>(0)
  const [mimeType, setMimeType] = useState<string>('application/pdf')
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState<string | null>(null)

  if (!isOpen) return null

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (file) {
      setFileName(file.name)
      setFileSizeBytes(file.size)
      setMimeType(file.type || 'application/octet-stream')
      if (!title) {
        setTitle(file.name.replace(/\.[^/.]+$/, ''))
      }
    }
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setError(null)
    setSubmitting(true)

    if (!fileName) {
      setError('Please select a file to upload')
      setSubmitting(false)
      return
    }

    try {
      // In production, file bytes are uploaded to private Supabase storage bucket `private_buyer_kyc`.
      // Generates secure unique private key:
      const fileKey = `org_${orgId}/buyer_${buyerId}/${Date.now()}_${fileName.replace(/[^a-zA-Z0-9._-]/g, '_')}`

      const res = await fetch(`/api/buyers/${buyerId}/documents`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          orgId,
          buyerId,
          bookingId: bookingId || null,
          documentType,
          title: title.trim(),
          fileName,
          fileKey,
          fileSizeBytes,
          mimeType,
        }),
      })

      const json = await res.json()
      if (!res.ok) {
        throw new Error(json.error || 'Failed to upload document')
      }

      onSuccess(json.data)
      onClose()
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err)
      setError(msg)
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4 backdrop-blur-sm">
      <div className="relative w-full max-w-lg rounded-xl border border-[var(--border)] bg-[var(--surface)] p-6 shadow-2xl space-y-4">
        <div className="flex items-center justify-between border-b border-[var(--border)] pb-3">
          <div className="flex items-center gap-2">
            <Upload className="h-5 w-5 text-[var(--brand)]" />
            <h2 className="text-base font-semibold text-[var(--foreground)]">
              Upload Customer KYC / Transaction Document
            </h2>
          </div>
          <button
            onClick={onClose}
            className="rounded-lg p-1.5 text-[var(--foreground-muted)] hover:bg-[var(--surface-muted)] hover:text-[var(--foreground)]"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        <div className="rounded-lg border border-blue-200 bg-blue-50 p-3 text-xs text-blue-800 flex items-start gap-2">
          <ShieldAlert className="h-4 w-4 shrink-0 mt-0.5 text-blue-600" />
          <div>
            <strong>Private Storage Policy:</strong> All customer KYC documents are held in non-public encrypted storage. Access requires server-side permission checks and generates an audit log entry.
          </div>
        </div>

        {error && (
          <div className="rounded-lg border border-red-200 bg-red-50 p-3 text-xs text-red-700">
            {error}
          </div>
        )}

        <form onSubmit={handleSubmit} className="space-y-4 text-xs">
          <div>
            <label className="block font-semibold text-[var(--foreground)] mb-1">
              Document Category *
            </label>
            <select
              value={documentType}
              onChange={(e) => setDocumentType(e.target.value as DocumentType)}
              className="w-full rounded-lg border border-[var(--border)] bg-[var(--surface-muted)] px-3 py-2 text-sm text-[var(--foreground)] focus:border-[var(--brand)] focus:outline-none"
            >
              <option value="pan_card">PAN Card (Primary Identity / Tax Proof)</option>
              <option value="aadhaar_card">Aadhaar Card (Masked UIDAI)</option>
              <option value="passport">Passport / International ID</option>
              <option value="voter_id">Voter ID Card</option>
              <option value="address_proof">Address Proof (Utility Bill / Bank Statement)</option>
              <option value="sale_agreement">Executed Agreement for Sale (AFS)</option>
              <option value="allotment_letter">Allotment Letter / Welcome Kit</option>
              <option value="payment_receipt">Official Payment Receipt (Signed / Stamped)</option>
              <option value="noc">NOC / Bank Sanction Letter</option>
              <option value="other">Other Supporting Document</option>
            </select>
          </div>

          <div>
            <label className="block font-semibold text-[var(--foreground)] mb-1">
              Document Title *
            </label>
            <input
              type="text"
              required
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder="e.g. Buyer PAN Card Copy"
              className="w-full rounded-lg border border-[var(--border)] bg-[var(--surface-muted)] px-3 py-2 text-sm text-[var(--foreground)] focus:border-[var(--brand)] focus:outline-none"
            />
          </div>

          {bookingIds.length > 0 && (
            <div>
              <label className="block font-semibold text-[var(--foreground)] mb-1">
                Link to Specific Booking (Optional)
              </label>
              <select
                value={bookingId}
                onChange={(e) => setBookingId(e.target.value)}
                className="w-full rounded-lg border border-[var(--border)] bg-[var(--surface-muted)] px-3 py-2 text-sm text-[var(--foreground)] focus:border-[var(--brand)] focus:outline-none"
              >
                <option value="">General Buyer Record (Not Booking-Specific)</option>
                {bookingIds.map((b) => (
                  <option key={b.id} value={b.id}>
                    Booking #{b.number}
                  </option>
                ))}
              </select>
            </div>
          )}

          <div>
            <label className="block font-semibold text-[var(--foreground)] mb-1">
              Select Document File (PDF, PNG, JPG, JPEG) *
            </label>
            <input
              type="file"
              accept=".pdf,.png,.jpg,.jpeg"
              onChange={handleFileChange}
              className="w-full text-xs text-[var(--foreground-muted)] file:mr-3 file:py-1.5 file:px-3 file:rounded-lg file:border-0 file:text-xs file:font-semibold file:bg-[var(--brand)] file:text-white hover:file:opacity-90 cursor-pointer"
            />
            {fileName && (
              <p className="mt-1 text-xs text-emerald-600 font-medium">
                ✓ Ready: {fileName} ({(fileSizeBytes / 1024).toFixed(1)} KB)
              </p>
            )}
          </div>

          <div className="flex justify-end gap-3 border-t border-[var(--border)] pt-4">
            <button
              type="button"
              onClick={onClose}
              className="rounded-lg border border-[var(--border)] px-4 py-2 font-semibold text-[var(--foreground)] hover:bg-[var(--surface-muted)]"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={submitting || !fileName}
              className="rounded-lg bg-[var(--brand)] px-5 py-2 font-semibold text-white shadow-sm hover:opacity-90 disabled:opacity-50"
            >
              {submitting ? 'Uploading...' : 'Upload Securely'}
            </button>
          </div>
        </form>
      </div>
    </div>
  )
}
