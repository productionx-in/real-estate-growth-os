// scripts/trigger-sweep-holds.mjs
// Production X — External Cron Trigger for Unit Hold Expiration Sweeper
// Invokes the deployed /api/cron/sweep-holds endpoint securely using Bearer authentication.

import http from 'node:http'
import https from 'node:https'

export async function triggerSweepHolds({
  endpointUrl = process.env.CRON_ENDPOINT_URL,
  cronSecret = process.env.CRON_SECRET,
  targetOrgId = process.env.TARGET_ORG_ID,
  timeoutMs = 20000,
  logger = console,
} = {}) {
  if (!endpointUrl) {
    logger.error('FATAL: Missing CRON_ENDPOINT_URL. Configure the GitHub Actions repository secret.')
    return { success: false, error: 'Missing CRON_ENDPOINT_URL', statusCode: 0 }
  }

  if (!cronSecret) {
    logger.error('FATAL: Missing CRON_SECRET. Configure the GitHub Actions repository secret.')
    return { success: false, error: 'Missing CRON_SECRET', statusCode: 0 }
  }

  // Parse and validate URL
  let parsedUrl
  try {
    parsedUrl = new URL(endpointUrl)
  } catch (err) {
    logger.error(`FATAL: Invalid CRON_ENDPOINT_URL format: ${endpointUrl}`)
    return { success: false, error: `Invalid URL: ${err.message}`, statusCode: 0 }
  }

  if (targetOrgId) {
    parsedUrl.searchParams.set('orgId', targetOrgId)
  }

  const maskedSecret = cronSecret.length > 8
    ? `${cronSecret.slice(0, 3)}...${cronSecret.slice(-3)}`
    : '***'

  logger.log(`Invoking Unit Hold Expiration Sweep:`)
  logger.log(`  Endpoint: ${parsedUrl.origin}${parsedUrl.pathname}${parsedUrl.search ? parsedUrl.search : ''}`)
  logger.log(`  Auth: Bearer ${maskedSecret}`)
  logger.log(`  Timeout: ${timeoutMs}ms`)

  const controller = new AbortController()
  const timeoutId = setTimeout(() => controller.abort(), timeoutMs)

  try {
    const response = await fetch(parsedUrl.toString(), {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${cronSecret}`,
        'Content-Type': 'application/json',
        'User-Agent': 'ProductionX-SweepHolds-Cron/1.0',
      },
      signal: controller.signal,
    })

    clearTimeout(timeoutId)

    const statusCode = response.status
    const rawText = await response.text()
    let data = null

    try {
      data = JSON.parse(rawText)
    } catch {
      // Non-JSON response
    }

    logger.log(`  HTTP Response Status: ${statusCode} ${response.statusText}`)
    if (data) {
      logger.log(`  Response Payload:`, JSON.stringify(data, null, 2))
    } else {
      logger.log(`  Raw Response: ${rawText.slice(0, 200)}`)
    }

    if (!response.ok) {
      const errMsg = (data && data.error) || `HTTP error ${statusCode}: ${response.statusText}`
      logger.error(`FAILED: Endpoint rejected request with status ${statusCode}: ${errMsg}`)
      return { success: false, statusCode, error: errMsg, data }
    }

    if (data && data.success === false) {
      const errMsg = data.error || 'Sweeper returned unsuccessful status'
      logger.error(`FAILED: Sweeper indicated failure: ${errMsg}`)
      return { success: false, statusCode, error: errMsg, data }
    }

    const released = data?.releasedCount ?? 0
    logger.log(`SUCCESS: Hold sweeper completed successfully. Released ${released} hold(s).`)
    return { success: true, statusCode, releasedCount: released, data }
  } catch (err) {
    clearTimeout(timeoutId)
    const isTimeout = err.name === 'AbortError'
    const errorMsg = isTimeout
      ? `Request timed out after ${timeoutMs}ms`
      : `Network connection failed: ${err.message}`
    logger.error(`FATAL: ${errorMsg}`)
    return { success: false, statusCode: 0, error: errorMsg }
  }
}

// CLI Execution entrypoint
if (process.argv[1] && import.meta.url.endsWith(process.argv[1].replace(/\\/g, '/'))) {
  const result = await triggerSweepHolds()
  if (!result.success) {
    process.exit(1)
  }
  process.exit(0)
}
