'use client'
// components/support/SupportBubble.tsx — the floating parrot. On the website it offers WhatsApp, a demo and
// e-mail; inside a workspace it offers a support case (Help & support), WhatsApp and e-mail. Options without a
// configured contact (lib/support/contact.ts) are hidden rather than invented.
import * as React from 'react'
import Link from 'next/link'
import { CalendarCheck, LifeBuoy, Mail, MessageCircle, X } from 'lucide-react'
import { Parrot } from '@/components/support/Parrot'
import { supportEmail, whatsAppLink } from '@/lib/support/contact'
import { cn } from '@/lib/utils/cn'

type Props =
  | { variant: 'website' }
  | { variant: 'app'; helpHref: string; orgName: string }

const GREETING_KEY = 'regrow-parrot-greeted'

export function SupportBubble(props: Props) {
  const [open, setOpen] = React.useState(false)
  const [greet, setGreet] = React.useState(false)
  const panelRef = React.useRef<HTMLDivElement>(null)
  const buttonRef = React.useRef<HTMLButtonElement>(null)
  const website = props.variant === 'website'

  // A one-time hello on the website, a few seconds in (once per browser session).
  React.useEffect(() => {
    if (!website) return
    let seen = false
    try { seen = sessionStorage.getItem(GREETING_KEY) === '1' } catch { /* storage blocked */ }
    if (seen) return
    const t = setTimeout(() => setGreet(true), 5000)
    return () => clearTimeout(t)
  }, [website])
  const dismissGreeting = () => { setGreet(false); try { sessionStorage.setItem(GREETING_KEY, '1') } catch { /* ignore */ } }

  // Close on Escape or a click outside; return focus to the parrot.
  React.useEffect(() => {
    if (!open) return
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') { setOpen(false); buttonRef.current?.focus() } }
    const onDown = (e: MouseEvent) => { if (!panelRef.current?.contains(e.target as Node) && !buttonRef.current?.contains(e.target as Node)) setOpen(false) }
    window.addEventListener('keydown', onKey); window.addEventListener('mousedown', onDown)
    panelRef.current?.querySelector<HTMLElement>('a,button')?.focus()
    return () => { window.removeEventListener('keydown', onKey); window.removeEventListener('mousedown', onDown) }
  }, [open])

  const wa = whatsAppLink(website
    ? 'Hi REGrow, I would like to know more about REGrow for my real estate business.'
    : `Hi REGrow support, I need help with our workspace "${props.orgName}".`)
  const email = supportEmail()

  const action = 'flex min-h-12 w-full items-center gap-3 rounded-xl px-3.5 text-left text-[14px] font-medium transition-colors duration-150'
  return (
    <div className={cn('fixed right-4 z-40 flex flex-col items-end gap-3 md:right-6',
      website ? 'bottom-4 md:bottom-6' : 'bottom-[calc(var(--bottom-nav-height)+env(safe-area-inset-bottom)+12px)] md:bottom-6')}>
      {open && (
        <div ref={panelRef} role="dialog" aria-label={website ? 'Talk to REGrow' : 'Get help'}
          className="w-[min(340px,calc(100vw-2rem))] overflow-hidden rounded-2xl border border-default bg-surface text-foreground shadow-lg">
          <div className="flex items-start gap-3 bg-surface-muted px-4 py-4">
            <Parrot className="size-11 shrink-0" />
            <div className="min-w-0 flex-1">
              <p className="text-[15px] font-semibold">{website ? 'Hi! I’m Rio from REGrow.' : 'Need a hand?'}</p>
              <p className="mt-0.5 text-[13px] text-muted">{website ? 'Ask us anything about REGrow, or see it on your own leads in a short demo.' : 'Our team replies inside REGrow. Choose how you’d like to reach us.'}</p>
            </div>
            <button type="button" aria-label="Close" onClick={() => { setOpen(false); buttonRef.current?.focus() }}
              className="-mr-1 -mt-1 grid size-9 shrink-0 place-items-center rounded-lg text-muted hover:bg-surface-hover hover:text-foreground">
              <X className="size-4" aria-hidden="true" />
            </button>
          </div>
          <div className="space-y-2 p-3">
            {!website && (
              <Link href={props.helpHref} onClick={() => setOpen(false)} className={cn(action, 'bg-brand text-brand-foreground hover:bg-brand-hover')}>
                <LifeBuoy className="size-5" aria-hidden="true" />
                <span className="flex-1">Open a support case<span className="block text-[12px] font-normal opacity-90">Track replies in Help &amp; support</span></span>
              </Link>
            )}
            {wa && (
              <a href={wa} target="_blank" rel="noopener noreferrer" className={cn(action, 'bg-chat-action text-chat-action-foreground hover:bg-chat-action-hover')}>
                <MessageCircle className="size-5" aria-hidden="true" />
                <span className="flex-1">Chat on WhatsApp<span className="block text-[12px] font-normal opacity-90">Opens WhatsApp in a new tab</span></span>
              </a>
            )}
            {website && (
              <Link href="/demo" onClick={() => setOpen(false)} className={cn(action, wa ? 'border border-default hover:bg-surface-hover' : 'bg-brand text-brand-foreground hover:bg-brand-hover')}>
                <CalendarCheck className="size-5" aria-hidden="true" />
                <span className="flex-1">Book a demo<span className={cn('block text-[12px] font-normal', wa ? 'text-muted' : 'opacity-90')}>A short call on your own lead flow</span></span>
              </Link>
            )}
            {email && (
              <a href={`mailto:${email}`} className={cn(action, 'border border-default hover:bg-surface-hover')}>
                <Mail className="size-5" aria-hidden="true" />
                <span className="flex-1">E-mail us<span className="block text-[12px] font-normal text-muted">{email}</span></span>
              </a>
            )}
          </div>
        </div>
      )}

      {greet && !open && (
        <div className="relative max-w-[240px] rounded-2xl rounded-br-md border border-default bg-surface px-4 py-3 text-[13px] text-foreground shadow-md">
          <button type="button" aria-label="Dismiss" onClick={dismissGreeting} className="absolute -right-2 -top-2 grid size-6 place-items-center rounded-full border border-default bg-surface text-muted hover:text-foreground">
            <X className="size-3" aria-hidden="true" />
          </button>
          <button type="button" onClick={() => { dismissGreeting(); setOpen(true) }} className="text-left">
            Hi! Questions about REGrow? <span className="font-semibold text-brand">Chat with us</span>
          </button>
        </div>
      )}

      <button ref={buttonRef} type="button" onClick={() => { dismissGreeting(); setOpen((o) => !o) }}
        aria-expanded={open} aria-haspopup="dialog" aria-label={open ? 'Close help' : website ? 'Chat with REGrow' : 'Get help from REGrow'}
        className="group grid size-16 place-items-center rounded-full bg-surface shadow-lg ring-1 ring-[var(--border)] transition-transform duration-200 hover:-translate-y-0.5 hover:scale-105 focus-visible:scale-105">
        <Parrot className="size-12 transition-transform duration-300 group-hover:-rotate-6" />
      </button>
    </div>
  )
}
