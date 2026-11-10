'use client'
// components/layout/Header.tsx
import { useRouter } from 'next/navigation'
import { LogOut, Bell } from 'lucide-react'
import { createClient } from '@/lib/supabase/client'

export function Header() {
  const router = useRouter()
  const supabase = createClient()

  async function handleSignOut() {
    await supabase.auth.signOut()
    router.push('/login')
    router.refresh()
  }

  return (
    <header
      style={{ height: 'var(--header-height)' }}
      className="flex-shrink-0 flex items-center justify-between px-6 bg-[var(--surface)] border-b border-[var(--border)]"
    >
      {/* Left — breadcrumb placeholder (populated by child pages via context in future) */}
      <div />

      {/* Right — actions */}
      <div className="flex items-center gap-1">
        <button
          className="w-8 h-8 rounded-md flex items-center justify-center text-[var(--foreground-muted)] hover:bg-[var(--surface-hover)] hover:text-[var(--foreground)] transition-colors"
          aria-label="Notifications"
        >
          <Bell className="w-4 h-4" />
        </button>
        <button
          onClick={handleSignOut}
          className="w-8 h-8 rounded-md flex items-center justify-center text-[var(--foreground-muted)] hover:bg-[var(--surface-hover)] hover:text-[var(--foreground)] transition-colors"
          aria-label="Sign out"
        >
          <LogOut className="w-4 h-4" />
        </button>
      </div>
    </header>
  )
}
