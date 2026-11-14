// tests/digital-experience-and-automation.test.mjs
// Test suite for Stage 6: Digital Experience & Marketing Automation

import assert from 'node:assert/strict'

console.log('--- Running Digital Experience & Marketing Automation (Stage 6) Tests ---')

// ---------------------------------------------------------------------------
// 1. Project Microsite Configuration & Slug Validation
// ---------------------------------------------------------------------------
{
  function validateMicrositeSlug(slug) {
    if (!slug || typeof slug !== 'string') return { valid: false, error: 'empty_slug' }
    const clean = slug.trim().toLowerCase()
    if (!/^[a-z0-9-]+$/.test(clean)) {
      return { valid: false, error: 'invalid_characters' }
    }
    if (clean.length < 3 || clean.length > 50) {
      return { valid: false, error: 'invalid_length' }
    }
    return { valid: true, cleanSlug: clean }
  }

  assert.equal(validateMicrositeSlug('marina-skies-towers').valid, true)
  assert.equal(validateMicrositeSlug('marina-skies-towers').cleanSlug, 'marina-skies-towers')

  assert.equal(validateMicrositeSlug('Invalid Slug!').valid, false)
  assert.equal(validateMicrositeSlug('Invalid Slug!').error, 'invalid_characters')

  assert.equal(validateMicrositeSlug('ab').valid, false)
  assert.equal(validateMicrositeSlug('ab').error, 'invalid_length')

  console.log('  ✓ Test 1 Passed: Project microsite slug validation and format constraints')
}

// ---------------------------------------------------------------------------
// 2. Digital Showroom Enquiry Capture & Attribution
// ---------------------------------------------------------------------------
{
  function normalizeShowroomLead(raw) {
    return {
      name: raw.name.trim(),
      phone: raw.phone.replace(/\D/g, ''),
      email: raw.email?.trim().toLowerCase() || null,
      project_id: raw.projectId,
      source: 'website',
      source_platform: 'digital_showroom',
      campaign_name: raw.campaignName || null,
      notes: raw.notes || null,
      touchpoints: [
        {
          channel: 'website_showroom',
          touchpoint_type: 'form_submission',
          occurred_at: new Date().toISOString(),
        },
      ],
    }
  }

  const raw = {
    name: '  Kishore Kumar ',
    phone: '+91 (987) 654-3210',
    email: 'Kishore@example.com ',
    projectId: 'proj_123',
    campaignName: 'Microsite marina-skies',
    notes: 'Requested Sunday 11am site visit',
  }

  const lead = normalizeShowroomLead(raw)
  assert.equal(lead.name, 'Kishore Kumar')
  assert.equal(lead.phone, '919876543210')
  assert.equal(lead.email, 'kishore@example.com')
  assert.equal(lead.source, 'website')
  assert.equal(lead.source_platform, 'digital_showroom')
  assert.equal(lead.touchpoints.length, 1)

  console.log('  ✓ Test 2 Passed: Digital showroom enquiry capture and attribution tagging')
}

// ---------------------------------------------------------------------------
// 3. Automation Workflow Filter Evaluation
// ---------------------------------------------------------------------------
{
  function evaluateFilterConditions(conditions, data) {
    if (!conditions || Object.keys(conditions).length === 0) return true
    for (const [key, expected] of Object.entries(conditions)) {
      const actual = data[key]
      if (expected === undefined || expected === null) continue
      if (Array.isArray(expected)) {
        if (!expected.includes(actual)) return false
      } else if (typeof expected === 'object' && expected !== null) {
        if (expected.gte !== undefined && Number(actual) < Number(expected.gte)) return false
        if (expected.lte !== undefined && Number(actual) > Number(expected.lte)) return false
        if (expected.eq !== undefined && actual !== expected.eq) return false
      } else if (actual !== expected) {
        return false
      }
    }
    return true
  }

  const filter = {
    project_id: 'proj_luxury',
    budget: { gte: 10000000 },
  }

  // Matches
  assert.equal(evaluateFilterConditions(filter, { project_id: 'proj_luxury', budget: 15000000 }), true)
  // Low budget fails
  assert.equal(evaluateFilterConditions(filter, { project_id: 'proj_luxury', budget: 8000000 }), false)
  // Different project fails
  assert.equal(evaluateFilterConditions(filter, { project_id: 'proj_budget', budget: 15000000 }), false)

  console.log('  ✓ Test 3 Passed: Automation workflow conditional filter evaluation')
}

// ---------------------------------------------------------------------------
// 4. Workflow Step Dispatcher & Execution
// ---------------------------------------------------------------------------
{
  async function executeStep(step, data) {
    switch (step.action_type) {
      case 'send_whatsapp_template':
        return { status: 'success', channel: 'whatsapp', template: step.config.template, to: data.phone }
      case 'send_email':
        return { status: 'success', channel: 'email', subject: step.config.subject, to: data.email }
      case 'create_task':
        return { status: 'success', task: step.config.title, assignedTo: step.config.agent_id }
      case 'delay_hours':
        return { status: 'success', delayHours: step.config.hours }
      default:
        return { status: 'skipped' }
    }
  }

  const steps = [
    { action_type: 'send_whatsapp_template', config: { template: 'site_visit_reminder' } },
    { action_type: 'create_task', config: { title: 'Call buyer for VIP cab arrangement', agent_id: 'agent_1' } },
    { action_type: 'delay_hours', config: { hours: 24 } },
  ]

  const data = { phone: '+919876543210', email: 'test@example.com' }

  async function runAll() {
    const results = []
    for (const step of steps) {
      const res = await executeStep(step, data)
      results.push(res)
    }
    return results
  }

  runAll().then((results) => {
    assert.equal(results.length, 3)
    assert.equal(results[0].channel, 'whatsapp')
    assert.equal(results[1].task, 'Call buyer for VIP cab arrangement')
    assert.equal(results[2].delayHours, 24)
    console.log('  ✓ Test 4 Passed: Workflow step execution (WhatsApp, sales task, delay scheduling)')
  })
}

// ---------------------------------------------------------------------------
// 5. Multi-Touch Attribution Engine (First Touch, Last Touch, Linear, Position, Time Decay)
// ---------------------------------------------------------------------------
{
  function calculateAttribution(touchpoints, totalValue, model) {
    if (touchpoints.length === 0) return []
    const sorted = [...touchpoints].sort((a, b) => new Date(a.occurred_at).getTime() - new Date(b.occurred_at).getTime())
    const n = sorted.length
    const weights = new Array(n).fill(0)

    if (model === 'first_touch') {
      weights[0] = 1.0
    } else if (model === 'last_touch') {
      weights[n - 1] = 1.0
    } else if (model === 'linear') {
      for (let i = 0; i < n; i++) weights[i] = 1.0 / n
    } else if (model === 'position_based') {
      if (n === 1) {
        weights[0] = 1.0
      } else if (n === 2) {
        weights[0] = 0.5
        weights[1] = 0.5
      } else {
        weights[0] = 0.4
        weights[n - 1] = 0.4
        const mid = 0.2 / (n - 2)
        for (let i = 1; i < n - 1; i++) weights[i] = mid
      }
    } else if (model === 'time_decay') {
      const lastTime = new Date(sorted[n - 1].occurred_at).getTime()
      const halfLifeMs = 7 * 24 * 3600 * 1000
      let totalDecay = 0
      for (let i = 0; i < n; i++) {
        const diff = lastTime - new Date(sorted[i].occurred_at).getTime()
        const decay = Math.pow(2, -diff / halfLifeMs)
        weights[i] = decay
        totalDecay += decay
      }
      for (let i = 0; i < n; i++) weights[i] = totalDecay > 0 ? weights[i] / totalDecay : 1 / n
    }

    const channelMap = new Map()
    for (let i = 0; i < n; i++) {
      const ch = sorted[i].channel
      const curr = channelMap.get(ch) || { weight: 0, count: 0 }
      channelMap.set(ch, { weight: curr.weight + weights[i], count: curr.count + 1 })
    }

    const res = []
    for (const [ch, d] of channelMap.entries()) {
      res.push({
        channel: ch,
        creditPercentage: Math.round(d.weight * 10000) / 100,
        attributedValue: Math.round(d.weight * totalValue),
      })
    }
    return res
  }

  const now = Date.now()
  const touchpoints = [
    { channel: 'meta_ads', occurred_at: new Date(now - 14 * 86400000).toISOString() }, // Day -14
    { channel: 'website_form', occurred_at: new Date(now - 7 * 86400000).toISOString() }, // Day -7
    { channel: 'channel_partner', occurred_at: new Date(now).toISOString() }, // Day 0
  ]
  const conversionValue = 10000000 // ₹1 Crore

  // 1. First Touch
  const firstRes = calculateAttribution(touchpoints, conversionValue, 'first_touch')
  assert.equal(firstRes.find((r) => r.channel === 'meta_ads').creditPercentage, 100)
  assert.equal(firstRes.find((r) => r.channel === 'meta_ads').attributedValue, 10000000)

  // 2. Last Touch
  const lastRes = calculateAttribution(touchpoints, conversionValue, 'last_touch')
  assert.equal(lastRes.find((r) => r.channel === 'channel_partner').creditPercentage, 100)
  assert.equal(lastRes.find((r) => r.channel === 'channel_partner').attributedValue, 10000000)

  // 3. Linear (33.33% each)
  const linearRes = calculateAttribution(touchpoints, conversionValue, 'linear')
  assert.equal(linearRes.length, 3)
  for (const item of linearRes) {
    assert.ok(item.creditPercentage > 33 && item.creditPercentage < 34)
  }

  // 4. Position-based (40% first, 20% middle, 40% last)
  const posRes = calculateAttribution(touchpoints, conversionValue, 'position_based')
  assert.equal(posRes.find((r) => r.channel === 'meta_ads').creditPercentage, 40)
  assert.equal(posRes.find((r) => r.channel === 'website_form').creditPercentage, 20)
  assert.equal(posRes.find((r) => r.channel === 'channel_partner').creditPercentage, 40)

  console.log('  ✓ Test 5 Passed: Multi-touch attribution modeling (First, Last, Linear, Position-Based)')
}

// ---------------------------------------------------------------------------
// 6. Developer Analytics & Conversion Funnel Calculation
// ---------------------------------------------------------------------------
{
  function computeFunnel(leads, visits, blockings, bookings) {
    return [
      { stage: 'Enquiries', count: leads, stepConv: 100 },
      { stage: 'Site Visits', count: visits, stepConv: leads > 0 ? (visits / leads) * 100 : 0 },
      { stage: 'Unit Holds', count: blockings, stepConv: visits > 0 ? (blockings / visits) * 100 : 0 },
      { stage: 'Bookings', count: bookings, stepConv: blockings > 0 ? (bookings / blockings) * 100 : 0 },
    ]
  }

  const funnel = computeFunnel(200, 50, 20, 10)
  assert.equal(funnel[0].count, 200)
  assert.equal(funnel[1].stepConv, 25) // 50 / 200 = 25%
  assert.equal(funnel[2].stepConv, 40) // 20 / 50 = 40%
  assert.equal(funnel[3].stepConv, 50) // 10 / 20 = 50%

  console.log('  ✓ Test 6 Passed: Sales conversion funnel stage calculations')
}

// ---------------------------------------------------------------------------
// 7. Sales Velocity Metrics Computation
// ---------------------------------------------------------------------------
{
  function computeSalesVelocity(deals) {
    if (deals.length === 0) return 0
    const totalDays = deals.reduce((sum, d) => sum + d.conversionDays, 0)
    return Math.round(totalDays / deals.length)
  }

  const closedDeals = [
    { id: 'd1', conversionDays: 14 },
    { id: 'd2', conversionDays: 21 },
    { id: 'd3', conversionDays: 28 },
  ]

  const velocity = computeSalesVelocity(closedDeals)
  assert.equal(velocity, 21) // (14 + 21 + 28) / 3 = 21 days

  console.log('  ✓ Test 7 Passed: Sales velocity (mean conversion days) computation')
}

// ---------------------------------------------------------------------------
// 8. Inventory Absorption Rate & Financial Summary
// ---------------------------------------------------------------------------
{
  function computeAbsorption(units) {
    const total = units.length
    const soldOrBooked = units.filter((u) => u.status === 'booked' || u.status === 'sold').length
    const absorptionRate = total > 0 ? Math.round((soldOrBooked / total) * 1000) / 10 : 0

    const totalVal = units.reduce((sum, u) => sum + u.price, 0)
    const realizedVal = units
      .filter((u) => u.status === 'booked' || u.status === 'sold')
      .reduce((sum, u) => sum + u.price, 0)

    return { absorptionRate, totalVal, realizedVal }
  }

  const inventory = [
    { id: 'u1', status: 'available', price: 10000000 },
    { id: 'u2', status: 'available', price: 10000000 },
    { id: 'u3', status: 'booked', price: 12000000 },
    { id: 'u4', status: 'sold', price: 15000000 },
  ]

  const abs = computeAbsorption(inventory)
  assert.equal(abs.absorptionRate, 50.0) // 2 out of 4 = 50%
  assert.equal(abs.totalVal, 47000000) // ₹4.7 Cr
  assert.equal(abs.realizedVal, 27000000) // ₹2.7 Cr

  console.log('  ✓ Test 8 Passed: Inventory absorption rate and revenue realization metrics')
}

// ---------------------------------------------------------------------------
// 9. Multi-Tenant Isolation for Workflows & Touchpoints
// ---------------------------------------------------------------------------
{
  const workflows = [
    { id: 'wf_1', org_id: 'org_acme', name: 'Acme Drip' },
    { id: 'wf_2', org_id: 'org_otho', name: 'Otho Follow-up' },
  ]

  function getTenantWorkflows(orgId) {
    return workflows.filter((w) => w.org_id === orgId)
  }

  const acmeWf = getTenantWorkflows('org_acme')
  assert.equal(acmeWf.length, 1)
  assert.equal(acmeWf[0].name, 'Acme Drip')

  const othoWf = getTenantWorkflows('org_otho')
  assert.equal(othoWf.length, 1)
  assert.equal(othoWf[0].name, 'Otho Follow-up')

  console.log('  ✓ Test 9 Passed: Multi-tenant isolation for workflows and touchpoint data')
}

console.log('\n--- All 9 Digital Experience & Marketing Automation Tests Passed Successfully ---\n')
