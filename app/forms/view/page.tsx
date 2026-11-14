// app/forms/view/page.tsx
// Standalone responsive enquiry form view intended for iframe embedding or direct links.

'use client'

export const dynamic = 'force-dynamic'

import React, { useState, useRef, useEffect, Suspense } from 'react'
import { useSearchParams } from 'next/navigation'

function EnquiryFormContent() {
  const searchParams = useSearchParams()

  const connectionId = searchParams.get('connectionId') || ''
  const projectId = searchParams.get('projectId') || ''
  const formTitle = searchParams.get('title') || 'Enquire Now'
  const buttonText = searchParams.get('button') || 'Schedule Site Visit'

  const formLoadTimeRef = useRef<number | null>(null)

  useEffect(() => {
    formLoadTimeRef.current = Date.now()
  }, [])

  const [name, setName] = useState('')
  const [phone, setPhone] = useState('')
  const [email, setEmail] = useState('')
  const [unitPreference, setUnitPreference] = useState('')
  const [scheduleSiteVisit, setScheduleSiteVisit] = useState(true)
  const [notes] = useState('')

  // Honeypot fields
  const [hpConfirm, setHpConfirm] = useState('')
  const [websiteUrlHp, setWebsiteUrlHp] = useState('')

  const [loading, setLoading] = useState(false)
  const [status, setStatus] = useState<{ type: 'idle' | 'success' | 'error'; message?: string }>({
    type: 'idle',
  })

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()

    if (!connectionId) {
      setStatus({ type: 'error', message: 'Missing integration connection ID configuration.' })
      return
    }

    setLoading(true)
    setStatus({ type: 'idle' })

    try {
      const utmSource = searchParams.get('utm_source') || undefined
      const utmMedium = searchParams.get('utm_medium') || undefined
      const utmCampaign = searchParams.get('utm_campaign') || undefined
      const utmTerm = searchParams.get('utm_term') || undefined
      const utmContent = searchParams.get('utm_content') || undefined

      const response = await fetch('/api/forms/submit', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          connectionId,
          projectId: projectId || undefined,
          name,
          phone,
          email: email || undefined,
          unitPreference: unitPreference || undefined,
          scheduleSiteVisit,
          notes: notes || undefined,
          hpConfirm: hpConfirm || undefined,
          website_url_hp: websiteUrlHp || undefined,
          formLoadTime: formLoadTimeRef.current || undefined,
          submissionTime: Date.now(),
          utmSource,
          utmMedium,
          utmCampaign,
          utmTerm,
          utmContent,
          pageUrl: typeof window !== 'undefined' ? window.location.href : undefined,
          referrer: typeof document !== 'undefined' ? document.referrer : undefined,
        }),
      })

      const data = await response.json()

      if (response.ok && data.success) {
        setStatus({
          type: 'success',
          message: data.message || 'Thank you for your enquiry. We will contact you soon.',
        })
      } else {
        setStatus({
          type: 'error',
          message: data.error || 'Failed to submit enquiry. Please try again.',
        })
      }
    } catch {
      setStatus({
        type: 'error',
        message: 'Network error occurred. Please check your connection and try again.',
      })
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="min-h-screen bg-slate-50 flex items-center justify-center p-4">
      <div className="w-full max-w-md bg-white rounded-xl shadow-sm border border-slate-200 p-6">
        <h2 className="text-xl font-bold text-slate-900 text-center mb-1">{formTitle}</h2>
        <p className="text-sm text-slate-500 text-center mb-6">
          Submit your details to receive full project brochure, pricing, and floor plans.
        </p>

        {status.type === 'success' ? (
          <div className="p-4 bg-emerald-50 border border-emerald-200 rounded-lg text-emerald-800 text-center">
            <div className="w-10 h-10 bg-emerald-100 rounded-full flex items-center justify-center mx-auto mb-2 text-emerald-600 font-bold">
              ✓
            </div>
            <p className="font-semibold">{status.message}</p>
          </div>
        ) : (
          <form onSubmit={handleSubmit} className="space-y-4">
            {/* Honeypot hidden fields */}
            <div
              style={{
                display: 'none',
                visibility: 'hidden',
                opacity: 0,
                position: 'absolute',
                left: '-9999px',
              }}
              aria-hidden="true"
            >
              <input
                type="text"
                tabIndex={-1}
                autoComplete="off"
                value={hpConfirm}
                onChange={(e) => setHpConfirm(e.target.value)}
              />
              <input
                type="text"
                tabIndex={-1}
                autoComplete="off"
                value={websiteUrlHp}
                onChange={(e) => setWebsiteUrlHp(e.target.value)}
              />
            </div>

            <div>
              <label className="block text-xs font-semibold uppercase tracking-wider text-slate-700 mb-1">
                Full Name *
              </label>
              <input
                type="text"
                required
                placeholder="e.g. Rahul Sharma"
                value={name}
                onChange={(e) => setName(e.target.value)}
                className="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm text-slate-900 focus:outline-none focus:ring-2 focus:ring-blue-500"
              />
            </div>

            <div>
              <label className="block text-xs font-semibold uppercase tracking-wider text-slate-700 mb-1">
                Phone Number *
              </label>
              <input
                type="tel"
                required
                placeholder="+91 98765 43210"
                value={phone}
                onChange={(e) => setPhone(e.target.value)}
                className="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm text-slate-900 focus:outline-none focus:ring-2 focus:ring-blue-500"
              />
            </div>

            <div>
              <label className="block text-xs font-semibold uppercase tracking-wider text-slate-700 mb-1">
                Email Address (Optional)
              </label>
              <input
                type="email"
                placeholder="rahul@example.com"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                className="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm text-slate-900 focus:outline-none focus:ring-2 focus:ring-blue-500"
              />
            </div>

            <div>
              <label className="block text-xs font-semibold uppercase tracking-wider text-slate-700 mb-1">
                Unit Configuration
              </label>
              <select
                value={unitPreference}
                onChange={(e) => setUnitPreference(e.target.value)}
                className="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm text-slate-900 bg-white focus:outline-none focus:ring-2 focus:ring-blue-500"
              >
                <option value="">Select unit configuration</option>
                <option value="2 BHK Apartment">2 BHK Luxury Apartment</option>
                <option value="3 BHK Apartment">3 BHK Premium Apartment</option>
                <option value="4 BHK Villa">4 BHK Gated Villa</option>
                <option value="Residential Plot">Residential Plot</option>
                <option value="Commercial Office">Commercial / Retail Space</option>
              </select>
            </div>

            <div className="flex items-center gap-2 pt-1">
              <input
                type="checkbox"
                id="siteVisitCheck"
                checked={scheduleSiteVisit}
                onChange={(e) => setScheduleSiteVisit(e.target.checked)}
                className="w-4 h-4 text-blue-600 rounded focus:ring-blue-500 cursor-pointer"
              />
              <label htmlFor="siteVisitCheck" className="text-xs text-slate-700 cursor-pointer">
                Request priority site visit & model flat walkthrough
              </label>
            </div>

            {status.type === 'error' && (
              <div className="p-3 bg-red-50 border border-red-200 rounded-lg text-red-700 text-xs">
                {status.message}
              </div>
            )}

            <button
              type="submit"
              disabled={loading}
              className="w-full py-2.5 px-4 bg-blue-600 hover:bg-blue-700 text-white font-medium rounded-lg text-sm shadow-sm transition disabled:opacity-50 cursor-pointer"
            >
              {loading ? 'Submitting...' : buttonText}
            </button>
          </form>
        )}
      </div>
    </div>
  )
}

export default function StandaloneEnquiryFormPage() {
  return (
    <Suspense
      fallback={
        <div className="min-h-screen bg-slate-50 flex items-center justify-center p-4">
          <div className="w-full max-w-md bg-white rounded-xl shadow-sm border border-slate-200 p-6 text-center text-slate-500 text-sm">
            Loading enquiry form...
          </div>
        </div>
      }
    >
      <EnquiryFormContent />
    </Suspense>
  )
}
