'use client'
// components/buyers/UpsertBuyerModal.tsx
import React, { useState } from 'react'
import { X, UserPlus, Plus, Trash2, ShieldCheck } from 'lucide-react'
import type { BuyerProfile, CoBuyer } from '@/lib/buyers/types'

interface UpsertBuyerModalProps {
  orgId: string
  buyer?: BuyerProfile | null
  isOpen: boolean
  onClose: () => void
  onSuccess: (buyer: BuyerProfile) => void
}

export function UpsertBuyerModal({
  orgId,
  buyer,
  isOpen,
  onClose,
  onSuccess,
}: UpsertBuyerModalProps) {
  const [fullName, setFullName] = useState(buyer?.full_name || '')
  const [phone, setPhone] = useState(buyer?.phone || '')
  const [email, setEmail] = useState(buyer?.email || '')
  const [alternatePhone, setAlternatePhone] = useState(buyer?.alternate_phone || '')
  const [panNumber, setPanNumber] = useState(buyer?.pan_number || '')
  const [aadhaarMasked, setAadhaarMasked] = useState(buyer?.aadhaar_number_masked || '')
  const [addressLine1, setAddressLine1] = useState(buyer?.address_line1 || '')
  const [addressLine2, setAddressLine2] = useState(buyer?.address_line2 || '')
  const [city, setCity] = useState(buyer?.city || '')
  const [state, setState] = useState(buyer?.state || '')
  const [pincode, setPincode] = useState(buyer?.pincode || '')
  const [notes, setNotes] = useState(buyer?.notes || '')
  const [coBuyers, setCoBuyers] = useState<CoBuyer[]>(buyer?.co_buyers || [])
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState<string | null>(null)

  if (!isOpen) return null

  const handleAddCoBuyer = () => {
    setCoBuyers((prev) => [
      ...prev,
      { name: '', relationship: 'Spouse', phone: '', email: '', pan: '', is_primary: false },
    ])
  }

  const handleRemoveCoBuyer = (index: number) => {
    setCoBuyers((prev) => prev.filter((_, i) => i !== index))
  }

  const handleUpdateCoBuyer = (index: number, field: keyof CoBuyer, value: any) => {
    setCoBuyers((prev) =>
      prev.map((cb, i) => (i === index ? { ...cb, [field]: value } : cb))
    )
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setError(null)
    setSubmitting(true)

    try {
      const res = await fetch(buyer ? `/api/buyers/${buyer.id}` : '/api/buyers', {
        method: buyer ? 'PATCH' : 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          orgId,
          fullName: fullName.trim(),
          phone: phone.trim(),
          email: email.trim() || null,
          alternatePhone: alternatePhone.trim() || null,
          panNumber: panNumber.trim().toUpperCase() || null,
          aadhaarNumberMasked: aadhaarMasked.trim() || null,
          addressLine1: addressLine1.trim() || null,
          addressLine2: addressLine2.trim() || null,
          city: city.trim() || null,
          state: state.trim() || null,
          pincode: pincode.trim() || null,
          notes: notes.trim() || null,
          coBuyers,
        }),
      })

      const json = await res.json()
      if (!res.ok) {
        throw new Error(json.error || 'Failed to save buyer profile')
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
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4 backdrop-blur-sm overflow-y-auto">
      <div className="relative w-full max-w-2xl rounded-xl border border-[var(--border)] bg-[var(--surface)] p-6 shadow-2xl space-y-5 my-8">
        <div className="flex items-center justify-between border-b border-[var(--border)] pb-3">
          <div className="flex items-center gap-2">
            <UserPlus className="h-5 w-5 text-[var(--brand)]" />
            <h2 className="text-lg font-semibold text-[var(--foreground)]">
              {buyer ? 'Edit Buyer Profile' : 'Register New Buyer Profile'}
            </h2>
          </div>
          <button
            onClick={onClose}
            className="rounded-lg p-1.5 text-[var(--foreground-muted)] hover:bg-[var(--surface-muted)] hover:text-[var(--foreground)] transition-colors"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        {error && (
          <div className="rounded-lg border border-red-200 bg-red-50 p-3 text-xs text-red-700">
            {error}
          </div>
        )}

        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <label className="block text-xs font-semibold text-[var(--foreground)] mb-1">
                Full Legal Name *
              </label>
              <input
                type="text"
                required
                value={fullName}
                onChange={(e) => setFullName(e.target.value)}
                placeholder="e.g. Rajesh Kumar"
                className="w-full rounded-lg border border-[var(--border)] bg-[var(--surface-muted)] px-3 py-2 text-sm text-[var(--foreground)] focus:border-[var(--brand)] focus:outline-none"
              />
            </div>

            <div>
              <label className="block text-xs font-semibold text-[var(--foreground)] mb-1">
                Primary Phone Number *
              </label>
              <input
                type="tel"
                required
                value={phone}
                onChange={(e) => setPhone(e.target.value)}
                placeholder="+91 98765 43210"
                className="w-full rounded-lg border border-[var(--border)] bg-[var(--surface-muted)] px-3 py-2 text-sm text-[var(--foreground)] focus:border-[var(--brand)] focus:outline-none"
              />
            </div>

            <div>
              <label className="block text-xs font-semibold text-[var(--foreground)] mb-1">
                Email Address
              </label>
              <input
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="rajesh.kumar@example.com"
                className="w-full rounded-lg border border-[var(--border)] bg-[var(--surface-muted)] px-3 py-2 text-sm text-[var(--foreground)] focus:border-[var(--brand)] focus:outline-none"
              />
            </div>

            <div>
              <label className="block text-xs font-semibold text-[var(--foreground)] mb-1">
                Alternate Phone
              </label>
              <input
                type="tel"
                value={alternatePhone}
                onChange={(e) => setAlternatePhone(e.target.value)}
                placeholder="+91 98765 00000"
                className="w-full rounded-lg border border-[var(--border)] bg-[var(--surface-muted)] px-3 py-2 text-sm text-[var(--foreground)] focus:border-[var(--brand)] focus:outline-none"
              />
            </div>

            <div>
              <label className="block text-xs font-semibold text-[var(--foreground)] mb-1">
                PAN Number (Tax ID)
              </label>
              <input
                type="text"
                value={panNumber}
                onChange={(e) => setPanNumber(e.target.value.toUpperCase())}
                placeholder="ABCDE1234F"
                maxLength={10}
                className="w-full font-mono uppercase rounded-lg border border-[var(--border)] bg-[var(--surface-muted)] px-3 py-2 text-sm text-[var(--foreground)] focus:border-[var(--brand)] focus:outline-none"
              />
            </div>

            <div>
              <label className="block text-xs font-semibold text-[var(--foreground)] mb-1">
                Masked Aadhaar Number
              </label>
              <input
                type="text"
                value={aadhaarMasked}
                onChange={(e) => setAadhaarMasked(e.target.value)}
                placeholder="XXXX-XXXX-1234"
                maxLength={14}
                className="w-full font-mono rounded-lg border border-[var(--border)] bg-[var(--surface-muted)] px-3 py-2 text-sm text-[var(--foreground)] focus:border-[var(--brand)] focus:outline-none"
              />
            </div>
          </div>

          <div className="border-t border-[var(--border)] pt-3">
            <h3 className="text-xs font-semibold text-[var(--foreground-muted)] uppercase tracking-wide mb-2">
              Residential Address
            </h3>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
              <div className="md:col-span-2">
                <input
                  type="text"
                  value={addressLine1}
                  onChange={(e) => setAddressLine1(e.target.value)}
                  placeholder="Address Line 1 (Flat, House No, Street)"
                  className="w-full rounded-lg border border-[var(--border)] bg-[var(--surface-muted)] px-3 py-2 text-sm text-[var(--foreground)] focus:border-[var(--brand)] focus:outline-none"
                />
              </div>
              <div>
                <input
                  type="text"
                  value={city}
                  onChange={(e) => setCity(e.target.value)}
                  placeholder="City (e.g. Bengaluru)"
                  className="w-full rounded-lg border border-[var(--border)] bg-[var(--surface-muted)] px-3 py-2 text-sm text-[var(--foreground)] focus:border-[var(--brand)] focus:outline-none"
                />
              </div>
              <div className="grid grid-cols-2 gap-2">
                <input
                  type="text"
                  value={state}
                  onChange={(e) => setState(e.target.value)}
                  placeholder="State (e.g. Karnataka)"
                  className="w-full rounded-lg border border-[var(--border)] bg-[var(--surface-muted)] px-3 py-2 text-sm text-[var(--foreground)] focus:border-[var(--brand)] focus:outline-none"
                />
                <input
                  type="text"
                  value={pincode}
                  onChange={(e) => setPincode(e.target.value)}
                  placeholder="Pincode (e.g. 560001)"
                  className="w-full rounded-lg border border-[var(--border)] bg-[var(--surface-muted)] px-3 py-2 text-sm text-[var(--foreground)] focus:border-[var(--brand)] focus:outline-none"
                />
              </div>
            </div>
          </div>

          {/* Co-Buyers Section */}
          <div className="border-t border-[var(--border)] pt-3 space-y-3">
            <div className="flex items-center justify-between">
              <h3 className="text-xs font-semibold text-[var(--foreground-muted)] uppercase tracking-wide">
                Co-Buyers & Authorised Representatives
              </h3>
              <button
                type="button"
                onClick={handleAddCoBuyer}
                className="inline-flex items-center gap-1 text-xs font-medium text-[var(--brand)] hover:underline"
              >
                <Plus className="h-3.5 w-3.5" />
                Add Co-Buyer
              </button>
            </div>

            {coBuyers.length === 0 ? (
              <p className="text-xs text-[var(--foreground-muted)] italic">
                No co-buyers registered. Single buyer ownership.
              </p>
            ) : (
              <div className="space-y-2">
                {coBuyers.map((cb, idx) => (
                  <div
                    key={idx}
                    className="flex flex-wrap items-center gap-2 rounded-lg border border-[var(--border)] bg-[var(--surface-muted)] p-2 text-xs"
                  >
                    <input
                      type="text"
                      placeholder="Co-Buyer Full Name"
                      value={cb.name}
                      onChange={(e) => handleUpdateCoBuyer(idx, 'name', e.target.value)}
                      className="flex-1 min-w-[140px] rounded border border-[var(--border)] bg-[var(--surface)] px-2 py-1"
                      required
                    />
                    <input
                      type="text"
                      placeholder="Relationship (e.g. Spouse, Son)"
                      value={cb.relationship}
                      onChange={(e) => handleUpdateCoBuyer(idx, 'relationship', e.target.value)}
                      className="w-28 rounded border border-[var(--border)] bg-[var(--surface)] px-2 py-1"
                      required
                    />
                    <input
                      type="tel"
                      placeholder="Phone"
                      value={cb.phone || ''}
                      onChange={(e) => handleUpdateCoBuyer(idx, 'phone', e.target.value)}
                      className="w-28 rounded border border-[var(--border)] bg-[var(--surface)] px-2 py-1"
                    />
                    <input
                      type="text"
                      placeholder="PAN"
                      value={cb.pan || ''}
                      onChange={(e) => handleUpdateCoBuyer(idx, 'pan', e.target.value.toUpperCase())}
                      className="w-24 font-mono uppercase rounded border border-[var(--border)] bg-[var(--surface)] px-2 py-1"
                    />
                    <button
                      type="button"
                      onClick={() => handleRemoveCoBuyer(idx)}
                      className="p-1 text-red-500 hover:text-red-700"
                    >
                      <Trash2 className="h-3.5 w-3.5" />
                    </button>
                  </div>
                ))}
              </div>
            )}
          </div>

          <div className="flex justify-end gap-3 border-t border-[var(--border)] pt-4">
            <button
              type="button"
              onClick={onClose}
              className="rounded-lg border border-[var(--border)] px-4 py-2 text-xs font-semibold text-[var(--foreground)] hover:bg-[var(--surface-muted)] transition-colors"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={submitting}
              className="rounded-lg bg-[var(--brand)] px-5 py-2 text-xs font-semibold text-white shadow-sm hover:opacity-90 disabled:opacity-50 transition-opacity"
            >
              {submitting ? 'Saving...' : buyer ? 'Save Changes' : 'Create Buyer Profile'}
            </button>
          </div>
        </form>
      </div>
    </div>
  )
}
