import crypto from 'node:crypto'

function base32Decode(base32) {
  const alphabet = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ234567'
  let bits = 0
  let value = 0
  const output = []
  for (let i = 0; i < base32.length; i++) {
    const val = alphabet.indexOf(base32.charAt(i).toUpperCase())
    if (val === -1) continue
    value = (value << 5) | val
    bits += 5
    if (bits >= 8) {
      output.push((value >>> (bits - 8)) & 255)
      bits -= 8
    }
  }
  return Buffer.from(output)
}

export function generateTotpCode(secret, timeStepOffset = 0) {
  const key = base32Decode(secret)
  const epoch = Math.floor(Date.now() / 1000)
  const timeStep = Math.floor(epoch / 30) + timeStepOffset

  const buf = Buffer.alloc(8)
  buf.writeBigInt64BE(BigInt(timeStep))

  const hmac = crypto.createHmac('sha1', key).update(buf).digest()
  const offset = hmac[hmac.length - 1] & 0x0f
  const codeInt =
    ((hmac[offset] & 0x7f) << 24) |
    ((hmac[offset + 1] & 0xff) << 16) |
    ((hmac[offset + 2] & 0xff) << 8) |
    (hmac[offset + 3] & 0xff)

  const code = (codeInt % 1000000).toString().padStart(6, '0')
  return code
}

const testCode = generateTotpCode('JBSWY3DPEHPK3PXP')
console.log('Test TOTP Code generated:', testCode, 'Length:', testCode.length)
