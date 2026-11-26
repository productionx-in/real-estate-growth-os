'use client'
// components/login/CustomerSignIn.tsx — wires the RE sign-in page (ReLoginPage) to Supabase password sign-in. After
// sign-in the person goes to the requested page (only same-site paths, safeRedirectPath) or their workspace picker,
// with the building animation while it loads.
import { useState } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
import ReLoginPage from '@/components/login/ReLoginPage'
import { createClient } from '@/lib/supabase/client'
import { safeRedirectPath } from '@/lib/auth/safe-redirect'
import { FullscreenLoader } from '@/components/ui/fullscreen-loader'

export function CustomerSignIn({ notice }: { notice?: React.ReactNode }) {
  const router = useRouter()
  const params = useSearchParams()
  const [entering, setEntering] = useState(false)
  if (entering) return <FullscreenLoader label="Opening your workspace…" />
  return (
    <ReLoginPage
      notice={notice}
      forgotPasswordHref="/login?mode=forgot"
      demoHref="/demo"
      homeHref="/"
      onPasswordSignIn={async (email, password) => {
        const { error } = await createClient().auth.signInWithPassword({ email, password })
        if (error) throw new Error(error.message === 'Invalid login credentials' ? 'That email and password don’t match. Try again or reset your password.' : error.message)
        setEntering(true)
        router.push(safeRedirectPath(params.get('redirectTo'), '/select-org'))
        router.refresh()
      }}
    />
  )
}
