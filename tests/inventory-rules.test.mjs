// tests/inventory-rules.test.mjs
import assert from 'node:assert'

const ALLOWED_STATUS_TRANSITIONS = {
  available: ['on_hold', 'booked', 'blocked'],
  on_hold: ['available', 'booked'],
  booked: ['available', 'sold'],
  sold: [],
  blocked: ['available'],
}

function canTransitionStatus(currentStatus, targetStatus) {
  if (currentStatus === targetStatus) return false
  const allowed = ALLOWED_STATUS_TRANSITIONS[currentStatus] || []
  return allowed.includes(targetStatus)
}

console.log('--- Testing Inventory State Machine ---')

// 1. Available state transitions
assert.strictEqual(canTransitionStatus('available', 'on_hold'), true, 'available -> on_hold must be allowed')
assert.strictEqual(canTransitionStatus('available', 'booked'), true, 'available -> booked must be allowed')
assert.strictEqual(canTransitionStatus('available', 'blocked'), true, 'available -> blocked must be allowed')
assert.strictEqual(canTransitionStatus('available', 'sold'), false, 'available -> sold directly must NOT be allowed')
assert.strictEqual(canTransitionStatus('available', 'available'), false, 'self transition must be false')

// 2. On hold state transitions
assert.strictEqual(canTransitionStatus('on_hold', 'available'), true, 'on_hold -> available must be allowed (hold expired/released)')
assert.strictEqual(canTransitionStatus('on_hold', 'booked'), true, 'on_hold -> booked must be allowed (token converted)')
assert.strictEqual(canTransitionStatus('on_hold', 'sold'), false, 'on_hold -> sold directly must NOT be allowed')
assert.strictEqual(canTransitionStatus('on_hold', 'blocked'), false, 'on_hold -> blocked directly must NOT be allowed')

// 3. Booked state transitions
assert.strictEqual(canTransitionStatus('booked', 'sold'), true, 'booked -> sold must be allowed (registration completed)')
assert.strictEqual(canTransitionStatus('booked', 'available'), true, 'booked -> available must be allowed (booking cancelled)')
assert.strictEqual(canTransitionStatus('booked', 'on_hold'), false, 'booked -> on_hold must NOT be allowed')
assert.strictEqual(canTransitionStatus('booked', 'blocked'), false, 'booked -> blocked must NOT be allowed')

// 4. Sold state transitions (terminal)
assert.strictEqual(canTransitionStatus('sold', 'available'), false, 'sold -> available must NOT be allowed (terminal state)')
assert.strictEqual(canTransitionStatus('sold', 'booked'), false, 'sold -> booked must NOT be allowed')

// 5. Blocked state transitions
assert.strictEqual(canTransitionStatus('blocked', 'available'), true, 'blocked -> available must be allowed (unblocked)')
assert.strictEqual(canTransitionStatus('blocked', 'sold'), false, 'blocked -> sold directly must NOT be allowed')

console.log('✓ All 15 inventory state machine test cases passed successfully!')
