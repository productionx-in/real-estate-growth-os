// app/d/[token]/page.tsx — a document shared with a buyer (cost sheet, quotation, letter).
// Public: the 256-bit link is the key. Unknown, expired and revoked links all show the same page. Opening it
// counts as a view (link previews from WhatsApp and the like do not) and tells the salesperson.
import type { Metadata } from 'next'
import { headers } from 'next/headers'
import { Phone } from 'lucide-react'
import { DocumentBody } from '@/components/documents/DocumentBody'
import { PrintButton } from '@/components/documents/PrintButton'
import { openSharedDocument } from '@/lib/dal/documents'

export const dynamic = 'force-dynamic'
export const metadata: Metadata = {
  title: 'Document',
  robots: { index: false, follow: false },
  referrer: 'no-referrer',
}

export default async function SharedDocumentPage({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params
  const doc = await openSharedDocument(token, (await headers()).get('user-agent'))

  if (!doc) {
    return (
      <main className="mx-auto flex min-h-dvh max-w-xl flex-col items-center justify-center bg-background px-4 text-center">
        <h1 className="text-[18px] font-semibold text-foreground">This link is no longer available</h1>
        <p className="mt-2 text-[14px] text-muted">It may have expired or been turned off. Please ask the person who sent it for a new link.</p>
      </main>
    )
  }

  return (
    <main className="min-h-dvh bg-background px-4 py-8 print:bg-surface print:p-0">
      <article className="mx-auto max-w-3xl rounded-xl border border-default bg-surface p-6 shadow-sm sm:p-10 print:border-0 print:shadow-none">
        {/* With a letterhead the company's details head the page; otherwise just its name. */}
        <div className="mb-4 flex flex-wrap items-center justify-between gap-3 print:hidden">
          <p className="text-[12px] text-muted">
            {!doc.letterhead && <span className="font-semibold text-foreground">{doc.orgName} · </span>}
            {new Date(doc.createdAt).toLocaleDateString('en-IN', { timeZone: 'Asia/Kolkata', day: 'numeric', month: 'long', year: 'numeric' })}
          </p>
          <PrintButton />
        </div>
        <DocumentBody body={doc.body} letterhead={doc.letterhead} />
        {doc.sharedBy && (
          <footer className="mt-8 flex flex-wrap items-center gap-2 border-t border-default pt-4 text-[13px] text-muted print:hidden">
            <span>Sent by {doc.sharedBy.name}</span>
            {doc.sharedBy.phone && (
              <a href={`tel:${doc.sharedBy.phone.replace(/[^\d+]/g, '')}`} className="inline-flex items-center gap-1 font-medium text-brand hover:underline">
                <Phone aria-hidden className="size-3.5" /> {doc.sharedBy.phone}
              </a>
            )}
          </footer>
        )}
      </article>
    </main>
  )
}
