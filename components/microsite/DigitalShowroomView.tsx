// components/microsite/DigitalShowroomView.tsx
'use client'

import React, { useState } from 'react'
import type { ProjectMicrosite } from '@/lib/automation/types'

interface DigitalShowroomViewProps {
  microsite: ProjectMicrosite
  projectName: string
  developerName: string
  reraId?: string | null
}

export function DigitalShowroomView({
  microsite,
  projectName,
  developerName,
  reraId,
}: DigitalShowroomViewProps) {
  const [name, setName] = useState('')
  const [phone, setPhone] = useState('')
  const [email, setEmail] = useState('')
  const [status, setStatus] = useState<'idle' | 'loading' | 'success' | 'error'>('idle')
  const [errorMessage, setErrorMessage] = useState('')

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setStatus('loading')
    setErrorMessage('')

    try {
      const res = await fetch('/api/forms/submit', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name,
          phone,
          email,
          projectId: microsite.project_id,
          source: 'website',
          sourcePlatform: 'digital_showroom',
          campaignName: `Microsite ${microsite.slug}`,
          notes: `Enquiry via public digital showroom: ${microsite.title}`,
        }),
      })

      if (!res.ok) {
        const data = await res.json().catch(() => ({}))
        throw new Error(data.error || 'Failed to submit enquiry')
      }

      setStatus('success')
    } catch (err: unknown) {
      setStatus('error')
      setErrorMessage(err instanceof Error ? err.message : 'Submission failed')
    }
  }

  return (
    <div className="min-h-screen bg-white text-gray-900 font-sans">
      {/* Top Navbar */}
      <header className="border-b border-gray-100 sticky top-0 bg-white/95 backdrop-blur-xs z-50">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 h-16 flex items-center justify-between">
          <div>
            <div className="text-lg font-bold tracking-tight">{projectName}</div>
            <div className="text-xs text-gray-400">by {developerName}</div>
          </div>
          <div className="flex items-center gap-4">
            {reraId && (
              <span className="hidden sm:inline-block text-xs bg-gray-100 text-gray-700 px-2 py-1 rounded font-medium">
                RERA: {reraId}
              </span>
            )}
            <a
              href="#enquire"
              className="text-xs font-semibold text-white px-4 py-2 rounded-md transition-colors"
              style={{ backgroundColor: microsite.accent_color || '#4f46e5' }}
            >
              Book Site Visit
            </a>
          </div>
        </div>
      </header>

      {/* Hero Section */}
      <section className="relative bg-gray-900 text-white py-20 px-4 sm:px-6 lg:px-8">
        <div className="max-w-4xl mx-auto text-center space-y-4">
          <span className="inline-block uppercase tracking-widest text-xs font-semibold text-indigo-300">
            Official Digital Showroom
          </span>
          <h1 className="text-4xl sm:text-5xl font-extrabold tracking-tight">
            {microsite.title}
          </h1>
          {microsite.tagline && (
            <p className="text-lg sm:text-xl text-gray-300 max-w-2xl mx-auto">
              {microsite.tagline}
            </p>
          )}
        </div>
      </section>

      {/* Main Content */}
      <main className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-12 space-y-16">
        {/* Virtual Tour & Master Plan Grid */}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
          <div className="bg-gray-50 rounded-xl p-6 border border-gray-200 space-y-4">
            <h2 className="text-lg font-bold text-gray-900">3D Virtual Tour & Walkthrough</h2>
            {microsite.virtual_tour_url ? (
              <div className="aspect-video w-full rounded-lg overflow-hidden border border-gray-200 bg-gray-900">
                <iframe
                  src={microsite.virtual_tour_url}
                  className="w-full h-full"
                  title="Virtual Tour"
                  allowFullScreen
                />
              </div>
            ) : (
              <div className="aspect-video w-full rounded-lg bg-gray-100 flex items-center justify-center text-sm text-gray-500 border border-dashed border-gray-300">
                Virtual tour experience available at project sales lounge
              </div>
            )}
          </div>

          <div className="bg-gray-50 rounded-xl p-6 border border-gray-200 space-y-4">
            <h2 className="text-lg font-bold text-gray-900">Master Layout & Master Plan</h2>
            {microsite.master_plan_url ? (
              <div className="aspect-video w-full rounded-lg overflow-hidden border border-gray-200 bg-gray-900">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img
                  src={microsite.master_plan_url}
                  alt="Master Plan"
                  className="w-full h-full object-cover"
                />
              </div>
            ) : (
              <div className="aspect-video w-full rounded-lg bg-gray-100 flex items-center justify-center text-sm text-gray-500 border border-dashed border-gray-300">
                Master layout plan approved by municipal authorities
              </div>
            )}
          </div>
        </div>

        {/* Features & Amenities */}
        {microsite.features && microsite.features.length > 0 && (
          <section className="space-y-6">
            <h2 className="text-2xl font-bold tracking-tight text-gray-900 text-center">
              Curated Amenities & Highlights
            </h2>
            <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-4">
              {microsite.features.map((feature, idx) => (
                <div
                  key={idx}
                  className="p-4 bg-gray-50 rounded-lg border border-gray-100 text-center font-medium text-sm text-gray-800"
                >
                  ✓ {feature}
                </div>
              ))}
            </div>
          </section>
        )}

        {/* Enquiry / Lead Capture Section */}
        <section id="enquire" className="max-w-xl mx-auto bg-gray-50 rounded-2xl p-8 border border-gray-200">
          <div className="text-center space-y-2 mb-6">
            <h2 className="text-2xl font-bold text-gray-900">Schedule a VIP Site Visit</h2>
            <p className="text-sm text-gray-500">
              Direct developer enquiry. Complimentary pick-up available across Hyderabad.
            </p>
          </div>

          {status === 'success' ? (
            <div className="bg-emerald-50 border border-emerald-200 rounded-lg p-6 text-center space-y-2">
              <div className="text-emerald-700 font-bold text-lg">Thank You!</div>
              <p className="text-sm text-emerald-600">
                Your enquiry has been received. Our sales relationship manager will connect shortly.
              </p>
            </div>
          ) : (
            <form onSubmit={handleSubmit} className="space-y-4">
              <div>
                <label className="block text-xs font-semibold text-gray-700 uppercase mb-1">
                  Full Name
                </label>
                <input
                  type="text"
                  required
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  placeholder="e.g. Ramesh Varma"
                  className="w-full px-3 py-2 border border-gray-300 rounded-md text-sm focus:outline-hidden focus:ring-2 focus:ring-indigo-500"
                />
              </div>

              <div>
                <label className="block text-xs font-semibold text-gray-700 uppercase mb-1">
                  Phone Number
                </label>
                <input
                  type="tel"
                  required
                  value={phone}
                  onChange={(e) => setPhone(e.target.value)}
                  placeholder="+91 98765 43210"
                  className="w-full px-3 py-2 border border-gray-300 rounded-md text-sm focus:outline-hidden focus:ring-2 focus:ring-indigo-500"
                />
              </div>

              <div>
                <label className="block text-xs font-semibold text-gray-700 uppercase mb-1">
                  Email Address (Optional)
                </label>
                <input
                  type="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  placeholder="ramesh@example.com"
                  className="w-full px-3 py-2 border border-gray-300 rounded-md text-sm focus:outline-hidden focus:ring-2 focus:ring-indigo-500"
                />
              </div>

              {errorMessage && (
                <div className="text-xs text-red-600 bg-red-50 p-2 rounded border border-red-200">
                  {errorMessage}
                </div>
              )}

              <button
                type="submit"
                disabled={status === 'loading'}
                className="w-full py-3 px-4 rounded-md text-white font-medium text-sm transition-opacity hover:opacity-90 disabled:opacity-50"
                style={{ backgroundColor: microsite.accent_color || '#4f46e5' }}
              >
                {status === 'loading' ? 'Submitting...' : 'Register for VIP Site Visit'}
              </button>
            </form>
          )}
        </section>
      </main>

      {/* Footer */}
      <footer className="border-t border-gray-200 py-8 text-center text-xs text-gray-400">
        <div>
          © {new Date().getFullYear()} {developerName}. All rights reserved.
        </div>
        {reraId && <div className="mt-1">RERA Registration: {reraId}</div>}
      </footer>
    </div>
  )
}
