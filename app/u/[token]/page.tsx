// app/u/[token]/page.tsx — unsubscribe from a workspace's marketing e-mails. Public: the link in the e-mail is the key.
// Opening the page changes nothing (mail scanners open links); the person presses the button to unsubscribe. Only the
// sending company's name and a masked address are shown.
import type { Metadata } from 'next'
import { unsubscribeTarget } from '@/lib/dal/campaigns'

export const dynamic = 'force-dynamic'
export const metadata: Metadata = { title: 'Unsubscribe', robots: { index: false, follow: false }, referrer: 'no-referrer' }

export default async function UnsubscribePage({ params, searchParams }: { params: Promise<{ token: string }>; searchParams: Promise<{ error?: string }> }) {
  const { token } = await params
  const failed = (await searchParams).error === '1'
  const target = await unsubscribeTarget(token)
  return (
    <main className="mx-auto flex min-h-dvh max-w-md flex-col items-center justify-center gap-3 bg-background px-4 text-center">
      {!target ? (
        <>
          <h1 className="text-[18px] font-semibold text-foreground">This link is not valid</h1>
          <p className="text-[14px] text-muted">It may be incomplete. Copy the whole link from the e-mail, or reply to the e-mail and ask to be removed.</p>
        </>
      ) : target.done ? (
        <>
          <h1 className="text-[18px] font-semibold text-foreground">You are unsubscribed</h1>
          <p className="text-[14px] text-muted">{target.orgName} will not send marketing e-mails to {target.address} any more.</p>
        </>
      ) : (
        <>
          <h1 className="text-[18px] font-semibold text-foreground">Unsubscribe from {target.orgName}?</h1>
          <p className="text-[14px] text-muted">Stop marketing e-mails to {target.address}. You can still hear from them about an enquiry or booking you make.</p>
          {failed && <p role="alert" className="text-[13px] text-danger">That did not work. Please try again.</p>}
          <form method="post" action="/api/unsubscribe">
            <input type="hidden" name="token" value={token} />
            <button type="submit" className="mt-2 inline-flex min-h-11 items-center rounded-lg bg-brand px-5 text-[14px] font-medium text-brand-foreground hover:bg-brand-hover">
              Unsubscribe
            </button>
          </form>
        </>
      )}
    </main>
  )
}
