'use client'
// components/staff/StaffSignIn.tsx — wires the RE team sign-in (ReStaffLoginPage) to Supabase password sign-in, then
// opens the console (or the requested same-site page). The console itself checks the platform role and asks for an
// authenticator code (lib/auth/platform.ts); this page grants nothing.
import { useState } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
import ReStaffLoginPage from '@/components/staff/ReStaffLoginPage'
import { createClient } from '@/lib/supabase/client'
import { safeRedirectPath } from '@/lib/auth/safe-redirect'
import { FullscreenLoader } from '@/components/ui/fullscreen-loader'

export function StaffSignIn() {
  const router = useRouter()
  const params = useSearchParams()
  const [entering, setEntering] = useState(false)
  if (entering) return <FullscreenLoader label="Opening the console…" />
  return (
    <ReStaffLoginPage
      customerLoginHref="/login"
      helpHref="/login?for=staff&mode=forgot"
      onStaffSignIn={async (email, password) => {
        const { error } = await createClient().auth.signInWithPassword({ email, password })
        if (error) throw new Error(error.message === 'Invalid login credentials' ? 'That email and password don’t match. Try again, or tap “Need help?”.' : error.message)
        setEntering(true)
        router.push(safeRedirectPath(params.get('redirectTo'), '/platform'))
        router.refresh()
      }}
    />
  )
}
