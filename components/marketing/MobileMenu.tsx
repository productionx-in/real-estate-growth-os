'use client'
// components/marketing/MobileMenu.tsx — the phone/tablet navigation. Closes on navigation and on Escape.
import { useEffect, useState } from 'react'
import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { Menu, X } from 'lucide-react'

export function MobileMenu({ groups }: { groups: { label: string; links: { href: string; label: string }[] }[] }) {
  const [open, setOpen] = useState(false)
  const pathname = usePathname()
  const [lastPath, setLastPath] = useState(pathname)
  if (pathname !== lastPath) { setLastPath(pathname); setOpen(false) }
  useEffect(() => {
    if (!open) return
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') setOpen(false) }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [open])

  return (
    <div className="lg:hidden">
      <button type="button" aria-expanded={open} aria-controls="mobile-menu" aria-label={open ? 'Close menu' : 'Open menu'}
        onClick={() => setOpen((v) => !v)} className="inline-flex items-center justify-center w-11 h-11 rounded-lg text-foreground hover:bg-surface-hover">
        {open ? <X className="w-5 h-5" aria-hidden="true" /> : <Menu className="w-5 h-5" aria-hidden="true" />}
      </button>
      {open && (
        <nav id="mobile-menu" aria-label="Main" className="absolute left-0 right-0 top-16 max-h-[calc(100dvh-4rem)] overflow-y-auto border-b border-[var(--border)] bg-surface shadow-xl">
          <div className="mx-auto max-w-6xl px-4 sm:px-6 py-4 grid gap-6 sm:grid-cols-3">
            {groups.map((g) => (
              <div key={g.label}>
                <p className="text-[12px] font-semibold uppercase tracking-wider text-subtle">{g.label}</p>
                <ul className="mt-2">
                  {g.links.map((l) => (
                    <li key={l.href}><Link href={l.href} className="block py-2.5 text-[15px] font-medium text-foreground">{l.label}</Link></li>
                  ))}
                </ul>
              </div>
            ))}
          </div>
        </nav>
      )}
    </div>
  )
}
