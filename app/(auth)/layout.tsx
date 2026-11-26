// app/(auth)/layout.tsx — pages here bring their own frame: customer sign-in is a full page (components/login), staff
// sign-in, password reset and registration use AuthFrame (components/auth/AuthFrame.tsx).
import type { Metadata } from 'next'

export const metadata: Metadata = {
  title: 'Sign In',
}

export default function AuthLayout({ children }: { children: React.ReactNode }) {
  return <>{children}</>
}
