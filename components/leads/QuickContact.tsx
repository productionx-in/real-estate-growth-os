'use client'
// components/leads/QuickContact.tsx
// One-tap Call / WhatsApp. Every tap is logged as a contact attempt (it starts the response clock and the
// activity timeline), whether it comes from the work panel or the phone's sticky bar.
import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { Phone, MessageCircle } from 'lucide-react'

/** Indian mobile numbers are stored without the country code; WhatsApp links need it. */
export function waNumberOf(phone: string): string {
  const digits = phone.replace(/\D/g, '')
  return digits.length === 10 ? `91${digits}` : digits
}

export function useLeadContact(leadId: string, phone: string) {
  const router = useRouter()
  return function contact(channel: 'call' | 'whatsapp') {
    // Fire-and-forget: the dialer / WhatsApp opens immediately; keepalive lets the log finish in the background.
    fetch(`/api/leads/${leadId}/contact`, {
      method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ channel }), keepalive: true,
    }).then(() => router.refresh()).catch(() => undefined)
    if (channel === 'call') window.location.assign(`tel:${phone}`)
    else window.open(`https://wa.me/${waNumberOf(phone)}`, '_blank', 'noopener')
  }
}

/** The work panel's own Call / WhatsApp buttons carry this id; the sticky bar appears once they scroll away. */
export const CONTACT_BUTTONS_ID = 'lead-contact-buttons'

/** Phones: Call and WhatsApp stay under the thumb while scrolling the lead, just above the tab bar. */
export function StickyContactBar({ leadId, phone, name }: { leadId: string; phone: string; name: string }) {
  const contact = useLeadContact(leadId, phone)
  // Hidden while the panel's buttons are on screen, so the same two buttons never show twice.
  const [panelVisible, setPanelVisible] = useState(true)
  useEffect(() => {
    const el = document.getElementById(CONTACT_BUTTONS_ID)
    if (!el || typeof IntersectionObserver === 'undefined') {
      const t = setTimeout(() => setPanelVisible(false), 0)
      return () => clearTimeout(t)
    }
    const io = new IntersectionObserver(([e]) => setPanelVisible(e.isIntersecting))
    io.observe(el)
    return () => io.disconnect()
  }, [])
  return (
    <div
      inert={panelVisible}
      className={`fixed inset-x-0 z-20 border-t border-default bg-surface/95 px-3 py-2 backdrop-blur transition-[opacity,translate] duration-200 md:hidden ${
        panelVisible ? 'pointer-events-none translate-y-2 opacity-0' : 'opacity-100'
      }`}
      style={{ bottom: 'calc(var(--bottom-nav-height) + env(safe-area-inset-bottom))' }}
    >
      <div className="grid grid-cols-2 gap-2">
        <button type="button" onClick={() => contact('call')} aria-label={`Call ${name}`}
          className="inline-flex h-11 items-center justify-center gap-2 rounded-lg bg-brand text-[15px] font-semibold text-brand-foreground active:scale-[0.98]">
          <Phone aria-hidden className="size-4" /> Call
        </button>
        <button type="button" onClick={() => contact('whatsapp')} aria-label={`WhatsApp ${name}`}
          className="inline-flex h-11 items-center justify-center gap-2 rounded-lg bg-success text-[15px] font-semibold text-success-foreground active:scale-[0.98]">
          <MessageCircle aria-hidden className="size-4" /> WhatsApp
        </button>
      </div>
    </div>
  )
}
