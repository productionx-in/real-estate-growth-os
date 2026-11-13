'use client'
// components/inventory/InventoryStatusDialog.tsx
import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { X, Loader2, AlertCircle, ArrowRight } from 'lucide-react'
import {
  ALLOWED_STATUS_TRANSITIONS,
  INVENTORY_STATUS_LABELS,
  type InventoryStatus,
  type InventoryItem,
} from '@/types/inventory'
import { InventoryStatusBadge } from './InventoryStatusBadge'

interface InventoryStatusDialogProps {
  item: InventoryItem
  onClose: () => void
  onSuccess?: () => void
}

export function InventoryStatusDialog({
  item,
  onClose,
  onSuccess,
}: InventoryStatusDialogProps) {
  const router = useRouter()
  const [isPending, startTransition] = useTransition()
  const [selectedStatus, setSelectedStatus] = useState<InventoryStatus | null>(null)
  const [reason, setReason] = useState('')
  const [note, setNote] = useState('')
  const [error, setError] = useState<string | null>(null)

  const allowedNext = ALLOWED_STATUS_TRANSITIONS[item.status] || []

  async function handleConfirm() {
    if (!selectedStatus) {
      setError('Please choose a new status.')
      return
    }
    if (!reason.trim()) {
      setError('Reason is mandatory for status change audit tracking.')
      return
    }

    setError(null)

    startTransition(async () => {
      try {
        const response = await fetch(`/api/inventory/${item.id}/status`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            new_status: selectedStatus,
            reason: reason.trim(),
            note: note.trim() || undefined,
          }),
        })

        const data = await response.json()
        if (!response.ok) {
          setError(data.error ?? 'Failed to update status')
          return
        }

        router.refresh()
        if (onSuccess) onSuccess()
        onClose()
      } catch {
        setError('Network error. Failed to update status.')
      }
    })
  }

  return (
    <>
      <div
        className="fixed inset-0 bg-black/40 backdrop-blur-[1px] z-50"
        onClick={onClose}
      />
      <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
        <div className="bg-[var(--surface)] border border-[var(--border)] rounded-xl shadow-xl w-full max-w-md overflow-hidden animate-in fade-in zoom-in-95 duration-150">
          {/* Header */}
          <div className="flex items-center justify-between px-5 py-4 border-b border-[var(--border)]">
            <div>
              <h2 className="text-[14px] font-semibold text-[var(--foreground)]">
                Update Inventory Status
              </h2>
              <p className="text-[12px] text-[var(--foreground-muted)] mt-0.5">
                Unit / Plot: <span className="font-semibold text-[var(--foreground)]">{item.unit_number}</span>
              </p>
            </div>
            <button
              onClick={onClose}
              className="w-7 h-7 rounded-md flex items-center justify-center text-[var(--foreground-muted)] hover:bg-[var(--surface-hover)] transition-colors"
            >
              <X className="w-4 h-4" />
            </button>
          </div>

          <div className="p-5 space-y-4">
            {error && (
              <div className="p-3 rounded-lg bg-[var(--danger-bg)] border border-red-200 text-[12px] text-[var(--danger)] flex items-start gap-2">
                <AlertCircle className="w-4 h-4 flex-shrink-0 mt-0.5" />
                <span>{error}</span>
              </div>
            )}

            {/* Current status display */}
            <div>
              <label className="block text-[12px] font-medium text-[var(--foreground-muted)] mb-1">
                Current Status
              </label>
              <InventoryStatusBadge status={item.status} />
            </div>

            {/* Allowed transitions */}
            <div>
              <label className="block text-[12px] font-medium text-[var(--foreground)] mb-1.5">
                Select New Status <span className="text-[var(--danger)]">*</span>
              </label>

              {allowedNext.length > 0 ? (
                <div className="grid grid-cols-2 gap-2">
                  {allowedNext.map((st) => {
                    const isSelected = selectedStatus === st
                    return (
                      <button
                        key={st}
                        type="button"
                        onClick={() => setSelectedStatus(st)}
                        className={`flex items-center justify-between p-2.5 rounded-lg border text-[13px] font-medium transition-all ${
                          isSelected
                            ? 'border-[var(--brand)] bg-[var(--brand-light)] text-[var(--brand)] ring-1 ring-blue-500'
                            : 'border-[var(--border)] bg-[var(--surface)] text-[var(--foreground)] hover:bg-[var(--surface-hover)]'
                        }`}
                      >
                        <span>{INVENTORY_STATUS_LABELS[st]}</span>
                        <ArrowRight className="w-3.5 h-3.5 opacity-50" />
                      </button>
                    )
                  })}
                </div>
              ) : (
                <p className="text-[12px] text-[var(--foreground-subtle)] bg-[var(--surface-hover)] p-3 rounded-lg">
                  This unit has reached the terminal status of &apos;{INVENTORY_STATUS_LABELS[item.status]}&apos;. No further standard transitions are allowed.
                </p>
              )}
            </div>

            {/* Mandatory Reason */}
            {allowedNext.length > 0 && (
              <>
                <div>
                  <label htmlFor="auditReason" className="block text-[12px] font-medium text-[var(--foreground)] mb-1">
                    Reason for Change <span className="text-[var(--danger)]">*</span>
                  </label>
                  <input
                    id="auditReason"
                    type="text"
                    required
                    value={reason}
                    onChange={(e) => setReason(e.target.value)}
                    placeholder="e.g. Token advance received from buyer"
                    className="w-full px-3 py-2 text-[13px] bg-[var(--surface)] border border-[var(--border)] rounded-md outline-none focus:border-[var(--brand)] focus:ring-2 focus:ring-blue-100"
                  />
                  <p className="text-[11px] text-[var(--foreground-subtle)] mt-1">
                    This reason is recorded in the permanent immutable audit history.
                  </p>
                </div>

                <div>
                  <label htmlFor="statusNotes" className="block text-[12px] font-medium text-[var(--foreground-muted)] mb-1">
                    Additional Notes (Optional)
                  </label>
                  <textarea
                    id="statusNotes"
                    rows={2}
                    value={note}
                    onChange={(e) => setNote(e.target.value)}
                    placeholder="Buyer details, banker info, cheque reference..."
                    className="w-full px-3 py-2 text-[13px] bg-[var(--surface)] border border-[var(--border)] rounded-md outline-none focus:border-[var(--brand)] focus:ring-2 focus:ring-blue-100 resize-none"
                  />
                </div>
              </>
            )}
          </div>

          {/* Footer */}
          <div className="flex items-center justify-end gap-2.5 px-5 py-3.5 border-t border-[var(--border)] bg-[var(--surface-hover)]">
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-2 text-[13px] font-medium text-[var(--foreground)] bg-[var(--surface)] border border-[var(--border)] rounded-md hover:bg-[var(--surface-hover)] transition-colors"
            >
              Cancel
            </button>
            {allowedNext.length > 0 && (
              <button
                type="button"
                onClick={handleConfirm}
                disabled={isPending || !selectedStatus || !reason.trim()}
                className="inline-flex items-center gap-1.5 px-4 py-2 text-[13px] font-medium text-white bg-[var(--brand)] rounded-md hover:bg-[var(--brand-hover)] disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
              >
                {isPending && <Loader2 className="w-3.5 h-3.5 animate-spin" />}
                {isPending ? 'Updating...' : 'Confirm Status Change'}
              </button>
            )}
          </div>
        </div>
      </div>
    </>
  )
}
