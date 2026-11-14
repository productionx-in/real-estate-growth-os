// lib/automation/attribution.ts
// Multi-Touch Attribution Engine for Stage 6C.
// Models: First Touch, Last Touch, Linear, Position-Based (U-Shaped 40-20-40), Time Decay.

import type { LeadTouchpoint, AttributionModel, ChannelAttributionResult } from './types'

export function calculateAttribution(
  touchpoints: LeadTouchpoint[],
  totalConversionValue: number,
  model: AttributionModel = 'linear'
): ChannelAttributionResult[] {
  if (touchpoints.length === 0) return []

  // Sort chronological
  const sorted = [...touchpoints].sort(
    (a, b) => new Date(a.occurred_at).getTime() - new Date(b.occurred_at).getTime()
  )

  const n = sorted.length
  const weights = new Array<number>(n).fill(0)

  switch (model) {
    case 'first_touch':
      weights[0] = 1.0
      break

    case 'last_touch':
      weights[n - 1] = 1.0
      break

    case 'linear':
      for (let i = 0; i < n; i++) {
        weights[i] = 1.0 / n
      }
      break

    case 'position_based':
      if (n === 1) {
        weights[0] = 1.0
      } else if (n === 2) {
        weights[0] = 0.5
        weights[1] = 0.5
      } else {
        weights[0] = 0.4
        weights[n - 1] = 0.4
        const middleWeight = 0.2 / (n - 2)
        for (let i = 1; i < n - 1; i++) {
          weights[i] = middleWeight
        }
      }
      break

    case 'time_decay': {
      // Exponential decay with 7-day half-life
      const lastTime = new Date(sorted[n - 1].occurred_at).getTime()
      const halfLifeMs = 7 * 24 * 3600 * 1000
      let totalDecay = 0

      for (let i = 0; i < n; i++) {
        const timeDiff = lastTime - new Date(sorted[i].occurred_at).getTime()
        const decay = Math.pow(2, -timeDiff / halfLifeMs)
        weights[i] = decay
        totalDecay += decay
      }

      // Normalize weights so sum is 1.0
      for (let i = 0; i < n; i++) {
        weights[i] = totalDecay > 0 ? weights[i] / totalDecay : 1 / n
      }
      break
    }
  }

  // Aggregate by channel
  const channelMap = new Map<string, { weight: number; count: number }>()
  for (let i = 0; i < n; i++) {
    const ch = sorted[i].channel
    const existing = channelMap.get(ch) || { weight: 0, count: 0 }
    channelMap.set(ch, {
      weight: existing.weight + weights[i],
      count: existing.count + 1,
    })
  }

  const results: ChannelAttributionResult[] = []
  for (const [channel, data] of channelMap.entries()) {
    results.push({
      channel,
      creditPercentage: Math.round(data.weight * 10000) / 100, // 2 decimal places %
      attributedValue: Math.round(data.weight * totalConversionValue),
      touchpointCount: data.count,
    })
  }

  return results.sort((a, b) => b.attributedValue - a.attributedValue)
}
