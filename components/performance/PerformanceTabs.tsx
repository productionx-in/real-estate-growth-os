// components/performance/PerformanceTabs.tsx — the four views of Performance, one tab bar for all of them.
import Link from 'next/link'
import { cn } from '@/lib/utils/cn'

export function PerformanceTabs({ orgSlug, current, canManage }: { orgSlug: string; current: 'me' | 'leaderboard' | 'achievements' | 'manage'; canManage: boolean }) {
  const tabs = [
    { key: 'me', label: 'My performance', href: `/${orgSlug}/performance` },
    { key: 'leaderboard', label: 'Leaderboard', href: `/${orgSlug}/performance/leaderboard` },
    { key: 'achievements', label: 'Achievements', href: `/${orgSlug}/performance/achievements` },
    ...(canManage ? [{ key: 'manage', label: 'Targets & settings', href: `/${orgSlug}/performance/manage` }] : []),
  ]
  return (
    <nav aria-label="Performance" className="-mx-1 mb-5 flex gap-1 overflow-x-auto px-1">
      {tabs.map((t) => (
        <Link key={t.key} href={t.href} aria-current={t.key === current ? 'page' : undefined}
          className={cn('whitespace-nowrap rounded-lg px-3 py-2 text-[13px] font-medium', t.key === current ? 'bg-[var(--sidebar-active-bg)] text-[var(--sidebar-active-text)] [box-shadow:var(--edge-highlight),var(--shadow-xs)]' : 'text-muted hover:bg-surface-hover hover:text-foreground')}>
          {t.label}
        </Link>
      ))}
    </nav>
  )
}
