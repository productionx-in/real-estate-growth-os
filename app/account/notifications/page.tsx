// app/account/notifications/page.tsx — what RE by PX e-mails you. Daily reports can be turned off; e-mails about your
// account (invitations, sign-in links, billing for owners) always go out.
import type { Metadata } from 'next'
import Link from 'next/link'
import { redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import { Card, CardContent } from '@/components/ui'
import { DailyReportToggle } from '@/components/account/DailyReportToggle'

export const metadata: Metadata = { title: 'E-mail notifications', robots: { index: false } }
export const dynamic = 'force-dynamic'

export default async function NotificationSettingsPage() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login?redirectTo=/account/notifications')
  const { data: profile } = await supabase.from('profiles').select('email_daily_report' as never).eq('auth_user_id', user.id).maybeSingle()
  const on = (profile as { email_daily_report?: boolean } | null)?.email_daily_report !== false
  return (
    <main className="flex min-h-dvh items-center justify-center bg-background px-4 py-12">
      <Card className="w-full max-w-md">
        <CardContent className="space-y-4 p-6">
          <div>
            <h1 className="text-[16px] font-semibold">E-mail notifications</h1>
            <p className="mt-1 text-[13px] text-muted">Sent to {user.email}.</p>
          </div>
          <DailyReportToggle initial={on} />
          <p className="text-[12px] text-muted">
            E-mails about your account — invitations, sign-in and password links, and billing for owners and admins — are always sent.
          </p>
          <Link href="/select-org" className="text-[13px] font-medium text-brand hover:underline">Back to RE by PX</Link>
        </CardContent>
      </Card>
    </main>
  )
}
