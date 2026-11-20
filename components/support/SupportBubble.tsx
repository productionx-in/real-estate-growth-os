'use client'
// components/support/SupportBubble.tsx — Rio, the guide that travels with customers from the website, through
// sign-in, into their workspace. It answers common questions from lib/support/guide.ts (true, short answers with a
// link to where it's done) and always offers a person: WhatsApp (when a number is configured), a support case
// inside a workspace, or a demo. Contact details are never invented (lib/support/contact.ts).
import * as React from 'react'
import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { CalendarCheck, LifeBuoy, Mail, MessageCircle, SendHorizontal, X } from 'lucide-react'
import { Parrot } from '@/components/support/Parrot'
import { supportEmail, whatsAppLink } from '@/lib/support/contact'
import { answer, answerChip, suggestions, type GuideContext, type GuideLink } from '@/lib/support/guide'
import { cn } from '@/lib/utils/cn'

type Props = { context: GuideContext; orgSlug?: string; orgName?: string }
type Msg = { from: 'rio' | 'me'; text: string; links?: GuideLink[]; handoff?: boolean }

const GREETING_KEY = 'regrow-rio-greeted'
const HELLO: Record<GuideContext, string> = {
  website: 'Hi, I’m Rio 👋 I can tell you what REGrow does, where leads come from, plans and demos. What would you like to know?',
  auth: 'Hi, I’m Rio 👋 Trouble signing in, or new to REGrow? Ask me.',
  workspace: 'Hi, I’m Rio 👋 Ask me how to do anything in REGrow — import leads, add your team, connect Facebook — or report a problem.',
}

export function SupportBubble({ context, orgSlug, orgName }: Props) {
  const pathname = usePathname() ?? '/'
  const storeKey = `regrow-rio-chat:${context}:${orgSlug ?? ''}`
  const [open, setOpen] = React.useState(false)
  const [greet, setGreet] = React.useState(false)
  const [typing, setTyping] = React.useState(false)
  const [input, setInput] = React.useState('')
  // This session's conversation; only rendered once the panel is opened, so reading storage here is hydration-safe.
  const [msgs, setMsgs] = React.useState<Msg[]>(() => {
    if (typeof window === 'undefined') return []
    try { return JSON.parse(sessionStorage.getItem(storeKey) ?? '[]') as Msg[] } catch { return [] }
  })
  const listRef = React.useRef<HTMLDivElement>(null)
  const inputRef = React.useRef<HTMLInputElement>(null)
  const buttonRef = React.useRef<HTMLButtonElement>(null)
  const panelRef = React.useRef<HTMLDivElement>(null)

  React.useEffect(() => {
    try { if (msgs.length) sessionStorage.setItem(storeKey, JSON.stringify(msgs.slice(-30))) } catch { /* ignore */ }
    listRef.current?.scrollTo({ top: listRef.current.scrollHeight, behavior: 'smooth' })
  }, [msgs, typing, storeKey])

  // One gentle hello per session, outside a workspace.
  React.useEffect(() => {
    if (context === 'workspace') return
    let seen = false
    try { seen = sessionStorage.getItem(GREETING_KEY) === '1' } catch { /* ignore */ }
    if (seen) return
    const t = setTimeout(() => setGreet(true), 5000)
    return () => clearTimeout(t)
  }, [context])
  const dismissGreeting = () => { setGreet(false); try { sessionStorage.setItem(GREETING_KEY, '1') } catch { /* ignore */ } }

  React.useEffect(() => {
    if (!open) return
    inputRef.current?.focus()
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') { setOpen(false); buttonRef.current?.focus() } }
    const onDown = (e: MouseEvent) => { if (!panelRef.current?.contains(e.target as Node) && !buttonRef.current?.contains(e.target as Node)) setOpen(false) }
    window.addEventListener('keydown', onKey); window.addEventListener('mousedown', onDown)
    return () => { window.removeEventListener('keydown', onKey); window.removeEventListener('mousedown', onDown) }
  }, [open])

  function ask(text: string, viaChip = false) {
    const q = text.trim()
    if (!q || typing) return
    setInput('')
    setMsgs((m) => [...m, { from: 'me', text: q }])
    setTyping(true)
    const a = (viaChip ? answerChip(q, context, orgSlug) : null) ?? answer(q, context, orgSlug)
    setTimeout(() => {
      setTyping(false)
      setMsgs((m) => [...m, a
        ? { from: 'rio', text: a.text, links: a.links, handoff: a.id === 'human' }
        : { from: 'rio', text: 'I don’t know that one yet — and I’d rather not guess. A person from our team can help:', handoff: true }])
    }, 550)
  }

  const wa = whatsAppLink(context === 'workspace'
    ? `Hi REGrow support, I need help with our workspace "${orgName ?? ''}".`
    : 'Hi REGrow, I would like to know more about REGrow for my real estate business.')
  const email = supportEmail()
  const chips = suggestions(context, pathname)

  const handoff = (
    <div className="flex flex-wrap gap-2">
      {wa && <a href={wa} target="_blank" rel="noopener noreferrer" className="inline-flex min-h-9 items-center gap-1.5 rounded-full bg-chat-action px-3.5 text-[13px] font-medium text-chat-action-foreground hover:bg-chat-action-hover"><MessageCircle className="size-4" aria-hidden="true" />WhatsApp us</a>}
      {context === 'workspace' && orgSlug && <Link href={`/${orgSlug}/help`} onClick={() => setOpen(false)} className="inline-flex min-h-9 items-center gap-1.5 rounded-full bg-brand px-3.5 text-[13px] font-medium text-brand-foreground hover:bg-brand-hover"><LifeBuoy className="size-4" aria-hidden="true" />Open a support case</Link>}
      {context !== 'workspace' && <Link href="/demo" onClick={() => setOpen(false)} className="inline-flex min-h-9 items-center gap-1.5 rounded-full bg-brand px-3.5 text-[13px] font-medium text-brand-foreground hover:bg-brand-hover"><CalendarCheck className="size-4" aria-hidden="true" />Book a demo</Link>}
      {email && <a href={`mailto:${email}`} className="inline-flex min-h-9 items-center gap-1.5 rounded-full border border-default bg-surface px-3.5 text-[13px] font-medium hover:bg-surface-hover"><Mail className="size-4" aria-hidden="true" />E-mail</a>}
    </div>
  )

  return (
    <div className={cn('fixed right-4 z-40 flex flex-col items-end gap-3 md:right-6',
      context === 'workspace' ? 'bottom-[calc(var(--bottom-nav-height)+env(safe-area-inset-bottom)+12px)] md:bottom-6' : 'bottom-4 md:bottom-6')}>
      {open && (
        <div ref={panelRef} role="dialog" aria-label="Rio, REGrow guide"
          className="flex h-[min(560px,calc(100dvh-7rem))] w-[min(370px,calc(100vw-2rem))] flex-col overflow-hidden rounded-3xl border border-default bg-surface text-foreground shadow-lg">
          {/* header */}
          <div className="flex items-center gap-3 bg-chat-action px-4 py-3 text-chat-action-foreground">
            <span className="grid size-11 shrink-0 place-items-center rounded-full bg-surface"><Parrot className="size-9" animated /></span>
            <div className="min-w-0 flex-1">
              <p className="text-[15px] font-semibold leading-tight">Rio</p>
              <p className="flex items-center gap-1.5 text-[12px] opacity-90"><span className="size-2 rounded-full bg-[var(--parrot-body)]" aria-hidden="true" />REGrow guide · answers instantly</p>
            </div>
            <button type="button" aria-label="Close" onClick={() => { setOpen(false); buttonRef.current?.focus() }} className="grid size-10 place-items-center rounded-full hover:bg-chat-action-hover">
              <X className="size-5" aria-hidden="true" />
            </button>
          </div>

          {/* conversation */}
          <div ref={listRef} className="flex-1 space-y-3 overflow-y-auto bg-surface-muted px-3 py-4" aria-live="polite">
            <Bubble from="rio">{HELLO[context]}</Bubble>
            {msgs.map((m, i) => (
              <div key={i} className="space-y-2">
                <Bubble from={m.from}>{m.text}</Bubble>
                {m.links && m.links.length > 0 && (
                  <div className="flex flex-wrap gap-2 pl-1">
                    {m.links.map((l) => <Link key={l.href} href={l.href} onClick={() => setOpen(false)} className="inline-flex min-h-9 items-center rounded-full border border-default bg-surface px-3.5 text-[13px] font-medium text-brand hover:bg-surface-hover">{l.label} →</Link>)}
                  </div>
                )}
                {m.handoff && <div className="pl-1">{handoff}</div>}
              </div>
            ))}
            {typing && <Bubble from="rio"><span className="inline-flex gap-1 py-1" aria-label="Rio is typing"><Dot /><Dot d="150ms" /><Dot d="300ms" /></span></Bubble>}
            {!typing && (
              <div className="flex flex-wrap gap-2 pt-1">
                {chips.map((c) => (
                  <button key={c} type="button" onClick={() => ask(c, true)} className="min-h-9 rounded-full border border-[var(--parrot-body-2)] bg-surface px-3.5 text-[13px] font-medium text-foreground hover:bg-surface-hover">{c}</button>
                ))}
              </div>
            )}
          </div>

          {/* composer */}
          <form className="flex items-center gap-2 border-t border-default bg-surface p-2.5" onSubmit={(e) => { e.preventDefault(); ask(input) }}>
            <label htmlFor="rio-q" className="sr-only">Ask Rio a question</label>
            <input id="rio-q" ref={inputRef} value={input} onChange={(e) => setInput(e.target.value)} maxLength={300} autoComplete="off" placeholder="Ask Rio a question…"
              className="min-h-11 flex-1 rounded-full border border-default bg-surface-muted px-4 text-[14px] outline-none focus:border-[var(--chat-action)]" />
            <button type="submit" aria-label="Send" disabled={!input.trim() || typing}
              className="grid size-11 shrink-0 place-items-center rounded-full bg-chat-action text-chat-action-foreground hover:bg-chat-action-hover disabled:opacity-50">
              <SendHorizontal className="size-5" aria-hidden="true" />
            </button>
          </form>
          <p className="flex flex-wrap items-center gap-x-3 gap-y-1 border-t border-default bg-surface px-4 py-2 text-[12px] text-muted">
            <span>Rio is an automatic guide. Prefer a person?</span>
            {wa && <a href={wa} target="_blank" rel="noopener noreferrer" className="inline-flex min-h-8 items-center font-medium text-foreground underline-offset-2 hover:underline">WhatsApp</a>}
            {context === 'workspace' && orgSlug
              ? <Link href={`/${orgSlug}/help`} onClick={() => setOpen(false)} className="inline-flex min-h-8 items-center font-medium text-foreground underline-offset-2 hover:underline">Support case</Link>
              : <Link href="/demo" onClick={() => setOpen(false)} className="inline-flex min-h-8 items-center font-medium text-foreground underline-offset-2 hover:underline">Book a demo</Link>}
          </p>
        </div>
      )}

      {greet && !open && (
        <div className="relative max-w-[250px] rounded-3xl rounded-br-md border border-default bg-surface px-4 py-3 text-[13px] text-foreground shadow-md">
          <button type="button" aria-label="Dismiss" onClick={dismissGreeting} className="absolute -right-2 -top-2 grid size-6 place-items-center rounded-full border border-default bg-surface text-muted hover:text-foreground">
            <X className="size-3" aria-hidden="true" />
          </button>
          <button type="button" onClick={() => { dismissGreeting(); setOpen(true) }} className="text-left">
            Hi, I’m Rio! Got a question about REGrow? <span className="font-semibold text-brand">Ask me</span>
          </button>
        </div>
      )}

      <button ref={buttonRef} type="button" onClick={() => { dismissGreeting(); setOpen((o) => !o) }}
        aria-expanded={open} aria-haspopup="dialog" aria-label={open ? 'Close Rio' : 'Ask Rio, the REGrow guide'}
        className="group relative grid size-16 place-items-center rounded-full bg-surface shadow-lg ring-1 ring-[var(--border)] transition-transform duration-200 hover:-translate-y-0.5 hover:scale-105">
        <span className="rio-bob"><Parrot className="size-[52px]" animated /></span>
        {!open && <span className="absolute right-1 top-1 size-3.5 rounded-full border-2 border-[var(--surface)] bg-[var(--parrot-body)]" aria-hidden="true" />}
      </button>
    </div>
  )
}

function Bubble({ from, children }: { from: 'rio' | 'me'; children: React.ReactNode }) {
  return (
    <div className={cn('flex', from === 'me' ? 'justify-end' : 'justify-start')}>
      <div className={cn('max-w-[85%] rounded-2xl px-3.5 py-2.5 text-[14px] leading-relaxed shadow-sm',
        from === 'me' ? 'rounded-tr-md bg-[var(--chat-mine)] text-foreground' : 'rounded-tl-md bg-surface text-foreground')}>
        {children}
      </div>
    </div>
  )
}
function Dot({ d = '0ms' }: { d?: string }) {
  return <span className="size-2 animate-bounce rounded-full bg-[var(--foreground-subtle)]" style={{ animationDelay: d }} />
}
