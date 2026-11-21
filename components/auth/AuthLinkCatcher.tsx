'use client'
// components/auth/AuthLinkCatcher.tsx — catches an e-mailed auth link that Supabase returned with the result in the
// URL hash (#access_token=…&type=recovery, or #error_code=otp_expired…). The server never sees a hash, so this runs
// in the browser on whatever page the person landed on (often the homepage, the Site URL fallback) and continues to
// the right screen. Renders nothing; does nothing on ordinary pages.
import { useEffect } from 'react'
import { createClient } from '@/lib/supabase/client'

export function AuthLinkCatcher() {
  useEffect(() => {
    const hash = typeof window !== 'undefined' ? window.location.hash.replace(/^#/, '') : ''
    if (!hash || !/(access_token|error_code|error_description)=/.test(hash)) return
    const p = new URLSearchParams(hash)
    const clear = () => window.history.replaceState(null, '', window.location.pathname + window.location.search)
    if (p.get('error_code') || p.get('error')) {
      const code = p.get('error_code') ?? ''
      const desc = (p.get('error_description') ?? '').toLowerCase()
      const problem = code === 'otp_expired' || desc.includes('expired') ? 'link_expired' : desc.includes('used') ? 'link_used' : 'link_invalid'
      clear()
      window.location.replace(`/login?error=${problem}&mode=forgot`)
      return
    }
    const access_token = p.get('access_token')
    const refresh_token = p.get('refresh_token')
    if (!access_token || !refresh_token) return
    const type = p.get('type')
    clear()
    createClient().auth.setSession({ access_token, refresh_token }).then(({ error }) => {
      if (error) window.location.replace('/login?error=link_invalid&mode=forgot')
      else window.location.replace(type === 'recovery' ? '/reset-password' : '/select-org')
    })
  }, [])
  return null
}
