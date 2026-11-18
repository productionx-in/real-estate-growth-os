'use client'
// components/auth/SignOutButton.tsx — signs out and returns to the sign-in page.
import { useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'

export function SignOutButton({ label = 'Sign out', className }: { label?: string; className?: string }) {
  const router = useRouter()
  return (
    <button type="button" className={className} onClick={async () => { await createClient().auth.signOut(); router.push('/login'); router.refresh() }}>
      {label}
    </button>
  )
}
