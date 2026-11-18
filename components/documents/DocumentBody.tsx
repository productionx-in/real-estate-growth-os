// components/documents/DocumentBody.tsx — shows a document's text (see lib/documents/blocks.ts). React elements only.
import { toBlocks, type Inline } from '@/lib/documents/blocks'

function Text({ parts }: { parts: Inline }) {
  return <>{parts.map((p, i) => (p.bold ? <strong key={i} className="font-semibold">{p.text}</strong> : <span key={i}>{p.text}</span>))}</>
}

export function DocumentBody({ body }: { body: string }) {
  return (
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
                  <thead><tr>{b.head.map((c, j) => <th key={j} className="border-b border-strong px-2 py-1.5 text-left font-semibold"><Text parts={c} /></th>)}</tr></thead>
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
  )
}
