'use client'
// components/inbox/Composer.tsx — reply box. Free text inside WhatsApp's 24-hour window; an approved template
// (with its blanks filled in) outside it; nothing for buyers who opted out. The server enforces the same rules.
import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { Send } from 'lucide-react'
import { Alert, Button, Field, Input, Select, Textarea } from '@/components/ui'
import { fillTemplate, MAX_TEXT, type ReplyMode } from '@/lib/integrations/whatsapp/inbox-rules'

export interface TemplateChoice { name: string; language: string; body: string; params: number }

export function Composer({ orgId, conversationId, reply, templates }: {
  orgId: string
  conversationId: string
  reply: ReplyMode
  templates: TemplateChoice[]
}) {
  const router = useRouter()
  const [text, setText] = useState('')
  const [useTemplate, setUseTemplate] = useState(reply.mode === 'template')
  const [tplKey, setTplKey] = useState(templates[0] ? `${templates[0].name}|${templates[0].language}` : '')
  const [params, setParams] = useState<string[]>([])
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  if (reply.mode === 'blocked') return <Alert tone="warning">{reply.reason}</Alert>

  const tpl = templates.find((t) => `${t.name}|${t.language}` === tplKey) ?? null
  const templateOnly = reply.mode === 'template'
  const showTemplate = templateOnly || useTemplate

  async function send() {
    setBusy(true)
    setError(null)
    const body = showTemplate
      ? { orgId, kind: 'template', name: tpl?.name, language: tpl?.language, params: params.slice(0, tpl?.params ?? 0) }
      : { orgId, kind: 'text', text }
    try {
      const res = await fetch(`/api/whatsapp/conversations/${conversationId}/messages`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body),
      })
      const out = await res.json().catch(() => ({}))
      if (!res.ok) { setError(out.error ?? 'The message was not sent.'); return }
      setText('')
      setParams([])
      router.refresh()
    } catch {
      setError('Network error — the message was not sent.')
    } finally {
      setBusy(false)
    }
  }

  return (
    <form onSubmit={(e) => { e.preventDefault(); send() }} className="space-y-2 border-t border-default bg-surface p-3">
      {templateOnly && <p className="text-[12px] text-muted">{reply.reason}</p>}
      {showTemplate ? (
        templates.length === 0 ? (
          <Alert tone="info">No approved templates yet. Sync templates from Integrations → WhatsApp after Meta approves them.</Alert>
        ) : (
          <div className="space-y-2">
            <Select aria-label="Template" value={tplKey} onChange={(e) => { setTplKey(e.target.value); setParams([]) }}>
              {templates.map((t) => <option key={`${t.name}|${t.language}`} value={`${t.name}|${t.language}`}>{t.name} ({t.language})</option>)}
            </Select>
            {tpl && Array.from({ length: tpl.params }, (_, i) => (
              <Field key={i} label={`Blank ${i + 1}`}>
                <Input value={params[i] ?? ''} maxLength={1024}
                  onChange={(e) => setParams((p) => { const n = [...p]; n[i] = e.target.value; return n })} />
              </Field>
            ))}
            {tpl && <p className="whitespace-pre-wrap rounded-md bg-surface-sunken p-2 text-[12px] text-muted">{fillTemplate(tpl.body, params) || tpl.name}</p>}
          </div>
        )
      ) : (
        <Textarea
          aria-label="Reply"
          rows={2}
          maxLength={MAX_TEXT}
          value={text}
          placeholder="Write a reply…"
          onChange={(e) => setText(e.target.value)}
          onKeyDown={(e) => { if (e.key === 'Enter' && (e.metaKey || e.ctrlKey) && text.trim()) send() }}
        />
      )}
      {error && <Alert tone="danger">{error}</Alert>}
      <div className="flex items-center justify-between gap-2">
        {!templateOnly && templates.length > 0 ? (
          <Button type="button" size="sm" variant="ghost" onClick={() => setUseTemplate((u) => !u)}>
            {useTemplate ? 'Write a message instead' : 'Use a template'}
          </Button>
        ) : <span />}
        <Button type="submit" size="sm" loading={busy}
          disabled={showTemplate ? !tpl || params.slice(0, tpl.params).filter((p) => p?.trim()).length < tpl.params : !text.trim()}>
          <Send aria-hidden /> Send
        </Button>
      </div>
    </form>
  )
}
