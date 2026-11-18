// lib/documents/blocks.ts
// Splits document text into simple blocks (headings, paragraphs, bullet lists, tables) for display.
// Text only — components/documents/DocumentBody.tsx turns blocks into React elements, never HTML, so nothing
// in a template or a lead's details can inject markup or script into the buyer's page.

export type Inline = { text: string; bold: boolean }[]
export type Block =
  | { type: 'h1' | 'h2' | 'p'; inline: Inline }
  | { type: 'ul'; items: Inline[] }
  | { type: 'table'; head: Inline[]; rows: Inline[][] }

export function inline(text: string): Inline {
  const parts: Inline = []
  const re = /\*\*([^*]+)\*\*/g
  let last = 0
  for (let m = re.exec(text); m; m = re.exec(text)) {
    if (m.index > last) parts.push({ text: text.slice(last, m.index), bold: false })
    parts.push({ text: m[1], bold: true })
    last = m.index + m[0].length
  }
  if (last < text.length) parts.push({ text: text.slice(last), bold: false })
  return parts
}

const cells = (line: string) => line.trim().replace(/^\|/, '').replace(/\|$/, '').split('|').map((c) => inline(c.trim()))
const isSeparator = (line: string) => /^\|?\s*:?-{3,}:?\s*(\|\s*:?-{3,}:?\s*)*\|?$/.test(line.trim())

export function toBlocks(body: string): Block[] {
  const lines = body.replace(/\r\n?/g, '\n').split('\n')
  const blocks: Block[] = []
  let i = 0
  while (i < lines.length) {
    const line = lines[i]
    const t = line.trim()
    if (!t) { i++; continue }
    if (t.startsWith('## ')) { blocks.push({ type: 'h2', inline: inline(t.slice(3)) }); i++; continue }
    if (t.startsWith('# ')) { blocks.push({ type: 'h1', inline: inline(t.slice(2)) }); i++; continue }
    if (t.startsWith('|')) {
      const rows: string[] = []
      while (i < lines.length && lines[i].trim().startsWith('|')) { rows.push(lines[i]); i++ }
      const body = rows.filter((r) => !isSeparator(r))
      const hasHead = rows.length > 1 && isSeparator(rows[1])
      blocks.push({ type: 'table', head: hasHead ? cells(body[0]) : [], rows: (hasHead ? body.slice(1) : body).map(cells) })
      continue
    }
    if (/^[-*] /.test(t)) {
      const items: Inline[] = []
      while (i < lines.length && /^[-*] /.test(lines[i].trim())) { items.push(inline(lines[i].trim().slice(2))); i++ }
      blocks.push({ type: 'ul', items })
      continue
    }
    const para: string[] = []
    while (i < lines.length && lines[i].trim() && !/^(#{1,2} |\||[-*] )/.test(lines[i].trim())) { para.push(lines[i].trim()); i++ }
    blocks.push({ type: 'p', inline: inline(para.join('\n')) })
  }
  return blocks
}
