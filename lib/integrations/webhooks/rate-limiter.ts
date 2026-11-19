// lib/integrations/webhooks/rate-limiter.ts
// Distributed, atomic rate limiter suitable for Vercel serverless and multi-instance environments.
// Coordinates rate limits across all serverless function instances using Redis (Upstash REST)
// or Database-backed atomic counters, with thread-safe test adapter support.

import { createServiceClient } from '@/lib/supabase/server'

export interface RateLimitResult {
  allowed: boolean
  remaining: number
  resetMs: number
  totalCount: number
}

export interface RateLimitAdapter {
  consume(key: string, limit: number, windowMs: number): Promise<RateLimitResult>
}

// ---------------------------------------------------------------------------
// 1. Upstash Redis REST Adapter (Sub-millisecond global distributed rate limiter)
// ---------------------------------------------------------------------------

export class UpstashRedisRateLimitAdapter implements RateLimitAdapter {
  private url: string
  private token: string

  constructor(url: string, token: string) {
    this.url = url.replace(/\/$/, '')
    this.token = token
  }

  async consume(key: string, limit: number, windowMs: number): Promise<RateLimitResult> {
    const redisKey = `ratelimit:${key}`
    const pipelineUrl = `${this.url}/pipeline`

    try {
      const response = await fetch(pipelineUrl, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${this.token}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify([
          ['INCR', redisKey],
          ['PEXPIRE', redisKey, windowMs, 'NX'],
          ['PTTL', redisKey],
        ]),
      })

      if (!response.ok) {
        throw new Error(`Upstash Redis error: ${response.status} ${response.statusText}`)
      }

      const results = (await response.json()) as Array<{ result: unknown }>
      const count = Number(results[0]?.result ?? 1)
      const pttl = Number(results[2]?.result ?? windowMs)
      const resetMs = pttl > 0 ? pttl : windowMs

      const allowed = count <= limit
      const remaining = Math.max(0, limit - count)

      return {
        allowed,
        remaining,
        resetMs,
        totalCount: count,
      }
    } catch (err) {
      console.warn('[RateLimiter] Upstash Redis check failed, falling back:', err)
      throw err
    }
  }
}

// ---------------------------------------------------------------------------
// 2. Database-Backed Atomic Rate Limiter Adapter (PostgreSQL / Supabase)
// ---------------------------------------------------------------------------

export class DatabaseRateLimitAdapter implements RateLimitAdapter {
  private client: ReturnType<typeof createServiceClient>

  constructor(customClient?: ReturnType<typeof createServiceClient>) {
    this.client = customClient ?? createServiceClient()
  }

  async consume(key: string, limit: number, windowMs: number): Promise<RateLimitResult> {
    const now = Date.now()
    const windowBucket = Math.floor(now / windowMs) * windowMs
    const resetMs = Math.max(1, windowBucket + windowMs - now)

    try {
      // Atomic increment in rate_limit_buckets (migration 20260019). An upsert writing count = 1 would reset the
      // counter on every request and never limit anything.
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const { data, error } = await (this.client as any).rpc('increment_rate_limit', {
        p_key: key,
        p_window_bucket: windowBucket,
        p_window_ms: windowMs,
      })

      if (!error && data != null) {
        const count = Number(data)
        return {
          allowed: count <= limit,
          remaining: Math.max(0, limit - count),
          resetMs,
          totalCount: count,
        }
      }

      // If rate_limit_buckets table is not yet deployed, fallback to event log counting
      const windowStartIso = new Date(now - windowMs).toISOString()
      const { count: recentCount, error: logErr } = await this.client
        .from('integration_event_logs')
        .select('*', { count: 'exact', head: true })
        .eq('connection_id', key.replace('webhook:conn:', ''))
        .gte('received_at', windowStartIso)

      if (!logErr && typeof recentCount === 'number') {
        const totalCount = recentCount + 1
        return {
          allowed: totalCount <= limit,
          remaining: Math.max(0, limit - totalCount),
          resetMs,
          totalCount,
        }
      }

      // If database queries fail entirely, fail open with safe limits to avoid breaking webhooks
      return {
        allowed: true,
        remaining: 1,
        resetMs,
        totalCount: 1,
      }
    } catch {
      return {
        allowed: true,
        remaining: 1,
        resetMs,
        totalCount: 1,
      }
    }
  }
}

// ---------------------------------------------------------------------------
// 3. Thread-Safe In-Memory Distributed Simulator Adapter (Testing / Local)
// ---------------------------------------------------------------------------

export class MemoryRateLimitAdapter implements RateLimitAdapter {
  private buckets = new Map<string, { count: number; windowStart: number }>()

  async consume(key: string, limit: number, windowMs: number): Promise<RateLimitResult> {
    const now = Date.now()
    const windowStart = Math.floor(now / windowMs) * windowMs
    const bucketKey = `${key}:${windowStart}`

    const entry = this.buckets.get(bucketKey) || { count: 0, windowStart }
    entry.count += 1
    this.buckets.set(bucketKey, entry)

    // Clean old entries older than 2 windows
    for (const [k, b] of this.buckets.entries()) {
      if (now - b.windowStart > windowMs * 2) {
        this.buckets.delete(k)
      }
    }

    const resetMs = Math.max(1, windowStart + windowMs - now)
    const allowed = entry.count <= limit
    const remaining = Math.max(0, limit - entry.count)

    return {
      allowed,
      remaining,
      resetMs,
      totalCount: entry.count,
    }
  }

  clear(): void {
    this.buckets.clear()
  }
}

// Singleton test / fallback adapter
const defaultMemoryAdapter = new MemoryRateLimitAdapter()

/**
 * Resolves the appropriate distributed rate limit adapter based on environment configuration.
 * Order of precedence:
 * 1. Explicitly passed custom adapter
 * 2. Upstash Redis (if UPSTASH_REDIS_REST_URL and UPSTASH_REDIS_REST_TOKEN exist)
 * 3. PostgreSQL Database-backed adapter (if Supabase service client is configured)
 * 4. Memory adapter (for automated unit testing / local development)
 */
export function getDistributedRateLimitAdapter(customAdapter?: RateLimitAdapter): RateLimitAdapter {
  if (customAdapter) return customAdapter

  const redisUrl = process.env.UPSTASH_REDIS_REST_URL || process.env.KV_REST_API_URL
  const redisToken = process.env.UPSTASH_REDIS_REST_TOKEN || process.env.KV_REST_API_TOKEN

  if (redisUrl && redisToken) {
    return new UpstashRedisRateLimitAdapter(redisUrl, redisToken)
  }

  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY

  if (supabaseUrl && serviceKey && !serviceKey.startsWith('YOUR_')) {
    return new DatabaseRateLimitAdapter()
  }

  return defaultMemoryAdapter
}

/**
 * Evaluates rate limit atomically across distributed Vercel serverless instances.
 */
export async function checkDistributedRateLimit(options: {
  key: string
  limit?: number
  windowMs?: number
  customAdapter?: RateLimitAdapter
}): Promise<RateLimitResult> {
  const limit = options.limit ?? 60
  const windowMs = options.windowMs ?? 60_000
  const adapter = getDistributedRateLimitAdapter(options.customAdapter)

  return adapter.consume(options.key, limit, windowMs)
}

/**
 * Resets local test adapter cache.
 */
export function resetLocalRateLimiter(): void {
  defaultMemoryAdapter.clear()
}
