'use client'
// components/settings/SettingsNav.tsx — the settings sidebar: search, then the groups this role can see
// (lib/settings/catalog.ts). On phones it sits above the page as a compact list.
import { useState } from 'react'
import { Input } from '@/components/ui'
import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { ChevronRight, Search } from 'lucide-react'
import type { SettingsGroup } from '@/lib/settings/catalog'
import { searchSettings } from '@/lib/settings/catalog'
import { cn } from '@/lib/utils/cn'

export function SettingsNav({ orgSlug, groups }: { orgSlug: string; groups: SettingsGroup[] }) {
  const pathname = usePathname()
  const [query, setQuery] = useState('')
  const href = (path: string) => `/${orgSlug}${path}`
  const active = (path: string) => pathname === href(path) || pathname.startsWith(`${href(path)}/`)
  const results = searchSettings(groups, query)
  const [open, setOpen] = useState<Record<string, boolean>>(() =>
    Object.fromEntries(groups.map((g) => [g.key, g.key === 'you' || g.pages.some((p) => active(p.path))])))

  return (
    <nav aria-label="Settings" className="space-y-3">
      <Link href={href('/settings')} className={cn('block rounded-md px-3 py-2 text-[13px] font-semibold', pathname === href('/settings') ? 'bg-brand-light text-brand' : 'text-foreground hover:bg-surface-hover')}>
        All settings
      </Link>
      <label className="relative block">
        <span className="sr-only">Search settings</span>
        <Search aria-hidden className="pointer-events-none absolute left-2.5 top-1/2 size-4 -translate-y-1/2 text-subtle" />
        <Input type="search" value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Search settings…"
          className="pl-8 pr-2 focus-visible:ring-[var(--brand)]" />
      </label>
      {query ? (
        <ul aria-live="polite" className="space-y-0.5">
          {results.length === 0 && <li className="px-3 py-2 text-[12px] text-muted">Nothing matches “{query}”.</li>}
          {results.map((p) => (
            <li key={p.key}>
              <Link href={href(p.path)} onClick={() => setQuery('')} className="block rounded-md px-3 py-2 hover:bg-surface-hover">
                <span className="block text-[13px] font-medium text-foreground">{p.label}</span>
                <span className="block text-[11px] text-muted">{p.group}</span>
              </Link>
            </li>
          ))}
        </ul>
      ) : (
        <ul className="space-y-1">
          {groups.map((g) => (
            <li key={g.key}>
              <button type="button" aria-expanded={!!open[g.key]} onClick={() => setOpen((o) => ({ ...o, [g.key]: !o[g.key] }))}
                className="flex min-h-9 w-full items-center gap-1.5 rounded-md px-2 text-left text-[12px] font-semibold text-foreground hover:bg-surface-hover">
                <ChevronRight aria-hidden className={cn('size-3.5 text-subtle transition-transform', open[g.key] && 'rotate-90')} />
                <span className="flex-1">{g.title}</span>
                <span className="text-[11px] font-normal text-subtle">{g.pages.length}</span>
              </button>
              {open[g.key] && (
                <ul className="mt-0.5 space-y-0.5 pl-3">
                  {g.pages.map((p) => (
                    <li key={p.key}>
                      <Link href={href(p.path)} aria-current={active(p.path) ? 'page' : undefined}
                        className={cn('block rounded-md px-3 py-1.5 text-[13px]', active(p.path) ? 'bg-brand-light font-medium text-brand' : 'text-muted hover:bg-surface-hover hover:text-foreground')}>
                        {p.label}
                      </Link>
                    </li>
                  ))}
                </ul>
              )}
            </li>
          ))}
        </ul>
      )}
    </nav>
  )
}
