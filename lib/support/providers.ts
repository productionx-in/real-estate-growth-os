// lib/support/providers.ts — one interface over Claude, OpenAI and Gemini for Rio. Which one answers is
// configuration, not code (docs/operations/ENVIRONMENT.md):
//   REGROW_ASSISTANT_PROVIDER  anthropic | openai | gemini — tried first (optional)
//   ANTHROPIC_API_KEY  + REGROW_MODEL_ANTHROPIC (default claude-opus-5-5; REGROW_ASSISTANT_MODEL also accepted)
//   OPENAI_API_KEY     + REGROW_MODEL_OPENAI   (required — no model is assumed)
//   GEMINI_API_KEY     + REGROW_MODEL_GEMINI   (required — no model is assumed)
// Every configured provider is a fallback for the one before it. Each returns the same JSON reply, validated by
// the caller with one schema, so behaviour does not depend on the vendor.
import Anthropic from '@anthropic-ai/sdk'

export type ProviderName = 'anthropic' | 'openai' | 'gemini'
export interface ChatTurn { role: 'user' | 'assistant'; text: string }
export interface ProviderInput { system: string; systemTail: string; messages: ChatTurn[] }
export interface ProviderOutput { json: unknown; inputTokens: number | null; outputTokens: number | null; refused: boolean }
export interface Provider { name: ProviderName; model: string; complete(input: ProviderInput): Promise<ProviderOutput> }

/** Strict JSON Schema of Rio's reply (OpenAI strict mode: every key required, nulls explicit). */
export const REPLY_JSON_SCHEMA = {
  type: 'object', additionalProperties: false, required: ['answer', 'links', 'handoff', 'callback'],
  properties: {
    answer: { type: 'string' },
    links: { type: 'array', items: { type: 'object', additionalProperties: false, required: ['label', 'href'], properties: { label: { type: 'string' }, href: { type: 'string' } } } },
    handoff: { type: 'boolean' },
    callback: {
      anyOf: [{ type: 'null' }, {
        type: 'object', additionalProperties: false, required: ['name', 'phone', 'company', 'companyType', 'teamSize', 'summary'],
        properties: {
          name: { type: 'string' }, phone: { type: 'string' }, company: { type: ['string', 'null'] },
          companyType: { type: 'string', enum: ['developer', 'channel_partner', 'unknown'] }, teamSize: { type: ['number', 'null'] }, summary: { type: 'string' },
        },
      }],
    },
  },
} as const

/** The same shape in Gemini's schema dialect (OpenAPI subset). */
const GEMINI_SCHEMA = {
  type: 'OBJECT', required: ['answer', 'links', 'handoff'],
  properties: {
    answer: { type: 'STRING' },
    links: { type: 'ARRAY', items: { type: 'OBJECT', required: ['label', 'href'], properties: { label: { type: 'STRING' }, href: { type: 'STRING' } } } },
    handoff: { type: 'BOOLEAN' },
    callback: {
      type: 'OBJECT', nullable: true, required: ['name', 'phone', 'companyType', 'summary'],
      properties: {
        name: { type: 'STRING' }, phone: { type: 'STRING' }, company: { type: 'STRING', nullable: true },
        companyType: { type: 'STRING', enum: ['developer', 'channel_partner', 'unknown'] }, teamSize: { type: 'NUMBER', nullable: true }, summary: { type: 'STRING' },
      },
    },
  },
}

const JSON_INSTRUCTION = 'Reply with a single JSON object with the keys answer, links, handoff and callback, as described.'

function anthropicProvider(model: string): Provider {
  return {
    name: 'anthropic', model,
    async complete({ system, systemTail, messages }) {
      const client = new Anthropic()
      const response = await client.beta.messages.create({
        model, max_tokens: 4000,
        betas: ['server-side-fallback-2026-07-01'], fallbacks: 'default',
        output_config: { effort: 'low', format: { type: 'json_schema', schema: REPLY_JSON_SCHEMA as unknown as Record<string, unknown> } },
        system: [{ type: 'text', text: system, cache_control: { type: 'ephemeral' } }, { type: 'text', text: systemTail }],
        messages: messages.map((m) => ({ role: m.role, content: m.text })),
      })
      if (response.stop_reason === 'refusal') return { json: null, inputTokens: response.usage.input_tokens, outputTokens: response.usage.output_tokens, refused: true }
      const text = response.content.flatMap((b) => (b.type === 'text' ? [b.text] : [])).join('')
      return { json: JSON.parse(text), inputTokens: response.usage.input_tokens + (response.usage.cache_read_input_tokens ?? 0), outputTokens: response.usage.output_tokens, refused: false }
    },
  }
}

function openaiProvider(model: string, key: string): Provider {
  return {
    name: 'openai', model,
    async complete({ system, systemTail, messages }) {
      const res = await fetch('https://api.openai.com/v1/chat/completions', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${key}` },
        body: JSON.stringify({
          model,
          messages: [{ role: 'system', content: `${system}\n\n${systemTail}\n\n${JSON_INSTRUCTION}` }, ...messages.map((m) => ({ role: m.role, content: m.text }))],
          response_format: { type: 'json_schema', json_schema: { name: 'rio_reply', strict: true, schema: REPLY_JSON_SCHEMA } },
        }),
        signal: AbortSignal.timeout(45_000),
      })
      if (!res.ok) throw new Error(`openai ${res.status}: ${(await res.text()).slice(0, 300)}`)
      const data = await res.json() as { choices?: { message?: { content?: string | null; refusal?: string | null } }[]; usage?: { prompt_tokens?: number; completion_tokens?: number } }
      const msg = data.choices?.[0]?.message
      const usage = { inputTokens: data.usage?.prompt_tokens ?? null, outputTokens: data.usage?.completion_tokens ?? null }
      if (msg?.refusal || !msg?.content) return { json: null, ...usage, refused: true }
      return { json: JSON.parse(msg.content), ...usage, refused: false }
    },
  }
}

function geminiProvider(model: string, key: string): Provider {
  return {
    name: 'gemini', model,
    async complete({ system, systemTail, messages }) {
      const res = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(model)}:generateContent`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'x-goog-api-key': key },
        body: JSON.stringify({
          systemInstruction: { parts: [{ text: `${system}\n\n${systemTail}\n\n${JSON_INSTRUCTION}` }] },
          contents: messages.map((m) => ({ role: m.role === 'assistant' ? 'model' : 'user', parts: [{ text: m.text }] })),
          generationConfig: { responseMimeType: 'application/json', responseSchema: GEMINI_SCHEMA },
        }),
        signal: AbortSignal.timeout(45_000),
      })
      if (!res.ok) throw new Error(`gemini ${res.status}: ${(await res.text()).slice(0, 300)}`)
      const data = await res.json() as { candidates?: { content?: { parts?: { text?: string }[] }; finishReason?: string }[]; usageMetadata?: { promptTokenCount?: number; candidatesTokenCount?: number } }
      const c = data.candidates?.[0]
      const text = c?.content?.parts?.map((p) => p.text ?? '').join('') ?? ''
      const usage = { inputTokens: data.usageMetadata?.promptTokenCount ?? null, outputTokens: data.usageMetadata?.candidatesTokenCount ?? null }
      if (!text || c?.finishReason === 'SAFETY') return { json: null, ...usage, refused: true }
      const json = JSON.parse(text) as Record<string, unknown>
      return { json: { callback: null, ...json }, ...usage, refused: false }
    },
  }
}

/** Configured providers in the order they are tried. Empty when none is configured. */
export function configuredProviders(env: Record<string, string | undefined> = process.env): Provider[] {
  const all: Partial<Record<ProviderName, Provider>> = {}
  if (env.ANTHROPIC_API_KEY) all.anthropic = anthropicProvider(env.REGROW_MODEL_ANTHROPIC || env.REGROW_ASSISTANT_MODEL || 'claude-opus-5-5')
  if (env.OPENAI_API_KEY && env.REGROW_MODEL_OPENAI) all.openai = openaiProvider(env.REGROW_MODEL_OPENAI, env.OPENAI_API_KEY)
  if (env.GEMINI_API_KEY && env.REGROW_MODEL_GEMINI) all.gemini = geminiProvider(env.REGROW_MODEL_GEMINI, env.GEMINI_API_KEY)
  const first = env.REGROW_ASSISTANT_PROVIDER as ProviderName | undefined
  const order: ProviderName[] = [...(first && all[first] ? [first] : []), ...(['anthropic', 'openai', 'gemini'] as const).filter((n) => n !== first)]
  return order.flatMap((n) => (all[n] ? [all[n]!] : []))
}
