// components/documents/DocumentBody.tsx — shows a document's text (see lib/documents/blocks.ts), under the company's
// letterhead when it has one (lib/documents/letterhead.ts). React elements only: nothing is rendered as HTML.
import { toBlocks, type Inline } from '@/lib/documents/blocks'
import type { Letterhead } from '@/lib/documents/letterhead'

function Text({ parts }: { parts: Inline }) {
  return <>{parts.map((p, i) => (p.bold ? <strong key={i} className="font-semibold">{p.text}</strong> : <span key={i}>{p.text}</span>))}</>
}

/** Company name, logo, address, contacts and registrations, as on printed stationery. */
export function LetterheadHeader({ letterhead }: { letterhead: Letterhead }) {
  return (
    <header className="mb-6 flex items-start gap-4 border-b-2 border-brand pb-4">
      {letterhead.logoUrl && (
        // eslint-disable-next-line @next/next/no-img-element -- the company's own logo, any https host; sized by CSS
        <img src={letterhead.logoUrl} alt="" className="size-14 shrink-0 rounded object-contain" referrerPolicy="no-referrer" />
      )}
      <div className="min-w-0 flex-1">
        <p className="text-[17px] font-semibold leading-tight text-foreground">{letterhead.name}</p>
        {letterhead.address && <p className="mt-1 text-[12px] text-muted">{letterhead.address}</p>}
        {letterhead.contact.length > 0 && <p className="text-[12px] text-muted">{letterhead.contact.join(' · ')}</p>}
        {letterhead.registrations.length > 0 && <p className="mt-0.5 text-[11px] font-medium text-subtle">{letterhead.registrations.join(' · ')}</p>}
      </div>
    </header>
  )
}

export function DocumentBody({ body, letterhead }: { body: string; letterhead?: Letterhead | null }) {
  return (
    <div>
      {letterhead && <LetterheadHeader letterhead={letterhead} />}
      <div className="space-y-3 text-[14px] leading-relaxed text-foreground">
        {toBlocks(body).map((b, i) => {
          switch (b.type) {
            case 'h1': return <h1 key={i} className="text-[20px] font-semibold"><Text parts={b.inline} /></h1>
            case 'h2': return <h2 key={i} className="pt-2 text-[16px] font-semibold"><Text parts={b.inline} /></h2>
            case 'p': return <p key={i} className="whitespace-pre-line"><Text parts={b.inline} /></p>
            case 'ul': return <ul key={i} className="list-disc space-y-1 pl-5">{b.items.map((it, j) => <li key={j}><Text parts={it} /></li>)}</ul>
            case 'table': return (
              <div key={i} className="overflow-x-auto">
                <table className="w-full border-collapse text-[13px]">
                  {b.head.length > 0 && (
                    <thead><tr>{b.head.map((c, j) => <th key={j} className="border-b border-strong bg-surface-muted px-2 py-1.5 text-left font-semibold"><Text parts={c} /></th>)}</tr></thead>
                  )}
                  <tbody>{b.rows.map((r, j) => (
                    <tr key={j}>{r.map((c, k) => <td key={k} className="border-b border-default px-2 py-1.5 align-top"><Text parts={c} /></td>)}</tr>
                  ))}</tbody>
                </table>
              </div>
            )
          }
        })}
      </div>
      {letterhead?.footerNote && <p className="mt-8 border-t border-default pt-3 text-[11px] text-subtle">{letterhead.footerNote}</p>}
    </div>
  )
}
