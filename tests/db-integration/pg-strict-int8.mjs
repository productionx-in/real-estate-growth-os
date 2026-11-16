// tests/db-integration/pg-strict-int8.mjs
// node-postgres returns BIGINT (int8, OID 20) columns as JavaScript strings by default,
// so `assert.equal(row.amount_cents, 850000)` fails even when the database holds 850000.
// This parser converts int8 to Number ONLY when the value is a safe integer and throws
// otherwise, so a precision loss can never make an assertion pass silently.
// NUMERIC (decimal money) is intentionally left as a string.

const INT8_OID = 20

export function installStrictInt8Parser(pg) {
  const types = (pg.default || pg).types
  types.setTypeParser(INT8_OID, (value) => {
    const n = Number(value)
    if (!Number.isSafeInteger(n)) {
      throw new Error(`int8 value ${value} exceeds Number.MAX_SAFE_INTEGER; compare as BigInt instead`)
    }
    return n
  })
}
