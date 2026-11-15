// app/(auth)/register/page.tsx
// Closed-SaaS: Public registration is decommissioned and redirects to login with notice
import { redirect } from 'next/navigation'

export default function RegisterPage() {
  redirect('/login?notice=closed_saas')
}
