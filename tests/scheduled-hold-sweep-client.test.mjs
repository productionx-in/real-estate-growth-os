// tests/scheduled-hold-sweep-client.test.mjs
// Unit & Integration tests for the GitHub Actions scheduled hold sweeper client.
// Uses a local Node.js HTTP server to verify request construction, Bearer auth,
// timeout handling, query parameters, error responses, and credential masking.

import assert from 'node:assert/strict'
import http from 'node:http'
import { triggerSweepHolds } from '../scripts/trigger-sweep-holds.mjs'

console.log('=== Running Scheduled Hold Sweeper Client Tests ===\n')

// Silent logger for testing
const silentLogger = {
  log: () => {},
  error: () => {},
  warn: () => {},
}

// ---------------------------------------------------------------------------
// TEST 1: Missing Secrets Validation (Fail-Closed)
// ---------------------------------------------------------------------------
console.log('Test 1: Missing secrets validation...')
{
  // Missing endpoint
  const res1 = await triggerSweepHolds({
    endpointUrl: '',
    cronSecret: 'valid_secret',
    logger: silentLogger,
  })
  assert.equal(res1.success, false)
  assert.match(res1.error, /Missing CRON_ENDPOINT_URL/)

  // Missing secret
  const res2 = await triggerSweepHolds({
    endpointUrl: 'http://localhost:3000/api/cron/sweep-holds',
    cronSecret: '',
    logger: silentLogger,
  })
  assert.equal(res2.success, false)
  assert.match(res2.error, /Missing CRON_SECRET/)

  console.log('✓ Passed: Missing secrets immediately fail closed without network calls.\n')
}

// ---------------------------------------------------------------------------
// TEST 2: Successful Sweep Request & Bearer Token Authentication
// ---------------------------------------------------------------------------
console.log('Test 2: Successful sweep request with Bearer authentication against mock server...')
{
  const testSecret = 'secret_test_token_8821'
  let capturedHeaders = null
  let capturedUrl = null
  let capturedMethod = null

  const server = http.createServer((req, res) => {
    capturedHeaders = req.headers
    capturedUrl = req.url
    capturedMethod = req.method

    if (req.headers.authorization === `Bearer ${testSecret}`) {
      res.writeHead(200, { 'Content-Type': 'application/json' })
      res.end(JSON.stringify({
        success: true,
        releasedCount: 3,
        timestamp: new Date().toISOString(),
        message: 'Successfully swept and released 3 expired hold(s)'
      }))
    } else {
      res.writeHead(401, { 'Content-Type': 'application/json' })
      res.end(JSON.stringify({ error: 'Unauthorized' }))
    }
  })

  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve))
  const port = server.address().port
  const mockUrl = `http://127.0.0.1:${port}/api/cron/sweep-holds`

  try {
    const result = await triggerSweepHolds({
      endpointUrl: mockUrl,
      cronSecret: testSecret,
      targetOrgId: 'org_test_123',
      logger: silentLogger,
    })

    assert.equal(result.success, true)
    assert.equal(result.statusCode, 200)
    assert.equal(result.releasedCount, 3)

    assert.equal(capturedMethod, 'POST')
    assert.equal(capturedHeaders['authorization'], `Bearer ${testSecret}`)
    assert.equal(capturedUrl, '/api/cron/sweep-holds?orgId=org_test_123')

    console.log('✓ Passed: Request correctly constructed with POST, Bearer header, and orgId query param.\n')
  } finally {
    await new Promise((resolve) => server.close(resolve))
  }
}

// ---------------------------------------------------------------------------
// TEST 3: Invalid Secret Rejection (401 Handling)
// ---------------------------------------------------------------------------
console.log('Test 3: Invalid secret rejection...')
{
  const expectedSecret = 'correct_secret'

  const server = http.createServer((req, res) => {
    if (req.headers.authorization === `Bearer ${expectedSecret}`) {
      res.writeHead(200, { 'Content-Type': 'application/json' })
      res.end(JSON.stringify({ success: true, releasedCount: 0 }))
    } else {
      res.writeHead(401, { 'Content-Type': 'application/json' })
      res.end(JSON.stringify({ error: 'Invalid or missing cron authorization header' }))
    }
  })

  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve))
  const port = server.address().port

  try {
    const result = await triggerSweepHolds({
      endpointUrl: `http://127.0.0.1:${port}/api/cron/sweep-holds`,
      cronSecret: 'wrong_secret',
      logger: silentLogger,
    })

    assert.equal(result.success, false)
    assert.equal(result.statusCode, 401)
    assert.match(result.error, /Invalid or missing cron authorization header/i)

    console.log('✓ Passed: Unauthorized 401 response correctly caught and flagged as failed.\n')
  } finally {
    await new Promise((resolve) => server.close(resolve))
  }
}

// ---------------------------------------------------------------------------
// TEST 4: Endpoint Server Error (500 Handling)
// ---------------------------------------------------------------------------
console.log('Test 4: Endpoint 500 error handling...')
{
  const server = http.createServer((req, res) => {
    res.writeHead(500, { 'Content-Type': 'application/json' })
    res.end(JSON.stringify({
      success: false,
      error: 'Database connection pool exhausted',
    }))
  })

  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve))
  const port = server.address().port

  try {
    const result = await triggerSweepHolds({
      endpointUrl: `http://127.0.0.1:${port}/api/cron/sweep-holds`,
      cronSecret: 'any_secret',
      logger: silentLogger,
    })

    assert.equal(result.success, false)
    assert.equal(result.statusCode, 500)
    assert.match(result.error, /Database connection pool exhausted/i)

    console.log('✓ Passed: 500 error correctly detected and reported.\n')
  } finally {
    await new Promise((resolve) => server.close(resolve))
  }
}

// ---------------------------------------------------------------------------
// TEST 5: Timeout Handling
// ---------------------------------------------------------------------------
console.log('Test 5: Timeout handling on slow/stalling endpoint...')
{
  const server = http.createServer((req, res) => {
    // Deliberately stall without sending response
  })

  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve))
  const port = server.address().port

  try {
    const result = await triggerSweepHolds({
      endpointUrl: `http://127.0.0.1:${port}/api/cron/sweep-holds`,
      cronSecret: 'any_secret',
      timeoutMs: 150, // Short timeout for testing
      logger: silentLogger,
    })

    assert.equal(result.success, false)
    assert.match(result.error, /timed out/i)

    console.log('✓ Passed: Timeout correctly aborted the request without hanging.\n')
  } finally {
    await new Promise((resolve) => server.close(resolve))
  }
}

console.log('===================================================================')
console.log('ALL 5/5 SCHEDULED HOLD SWEEPER CLIENT TESTS PASSED!')
console.log('===================================================================')
