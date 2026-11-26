// lib/support/contact.ts — how customers and visitors reach RE. Nothing here is invented: the WhatsApp
// number comes from NEXT_PUBLIC_SUPPORT_WHATSAPP (set in Vercel) and the e-mail from lib/legal.ts. When a
// value is missing, the option is simply not shown.
import { LEGAL } from '@/lib/legal'

/** Digits only, with country code (e.g. 919876543210). Returns null unless it looks like a real number. */
export function normaliseWhatsApp(raw: string | null | undefined): string | null {
  const digits = (raw ?? '').replace(/[^\d]/g, '')
  return digits.length >= 10 && digits.length <= 15 ? digits : null
}

/** wa.me click-to-chat link with a pre-filled message, or null when no number is configured. */
export function whatsAppLink(text: string, raw: string | null | undefined = process.env.NEXT_PUBLIC_SUPPORT_WHATSAPP): string | null {
  const n = normaliseWhatsApp(raw)
  return n ? `https://wa.me/${n}?text=${encodeURIComponent(text)}` : null
}

export const supportEmail = () => LEGAL.supportEmail ?? LEGAL.salesEmail ?? null
