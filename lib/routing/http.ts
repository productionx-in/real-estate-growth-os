// lib/routing/http.ts
// Shared request handling for the /api/routing endpoints: JSON parsing, validation and DAL error mapping.
import { NextResponse } from 'next/server'
import type { ZodType } from 'zod'
import type { DalResult } from '@/lib/dal/routing'

export async function parseJson<T>(request: Request, schema: ZodType<T>):
  Promise<{ ok: true; data: T } | { ok: false; response: NextResponse }> {
  let body: unknown
  try {
    body = await request.json()
  } catch {
    return { ok: false, response: NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 }) }
  }
  const parsed = schema.safeParse(body)
  if (!parsed.success) {
    return { ok: false, response: NextResponse.json({ error: 'Invalid input', details: parsed.error.flatten() }, { status: 400 }) }
  }
  return { ok: true, data: parsed.data }
}

export function respond<T>(result: DalResult<T>, successStatus = 200): NextResponse {
  if (!result.success) return NextResponse.json({ error: result.error }, { status: result.status })
  return NextResponse.json({ data: result.data }, { status: successStatus })
}

export function serverError(context: string, err: unknown): NextResponse {
  console.error(`[routing] ${context}:`, err)
  return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
}
