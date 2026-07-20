import { describe, expect, it } from 'vitest'

import { hexToBytes } from './bytes.js'
import { verifyHmacSha512, verifyHmacSha256 } from './hmac.js'

function requiredHex(value: string): Uint8Array {
  const bytes = hexToBytes(value)

  if (bytes === null) {
    throw new Error('Invalid hexadecimal test vector')
  }

  return bytes
}

const secret = new Uint8Array(20).fill(0x0b)
const payload = new TextEncoder().encode('Hi There')

const validSignature = requiredHex(
  'b0344c61d8db38535ca8afceaf0bf12b' +
  '881dc200c9833da726e9376c2e32cff7',
)

describe('verifyHmacSha256', () => {
  it('accepts a valid RFC 4231 signature', async () => {
    const result = await verifyHmacSha256({
      secret,
      payload,
      signature: validSignature,
    })

    expect(result).toBe(true)
  })

  it('rejects an altered payload', async () => {
    const result = await verifyHmacSha256({
      secret,
      payload: new TextEncoder().encode('Hi there'),
      signature: validSignature,
    })

    expect(result).toBe(false)
  })

  it('rejects an altered signature', async () => {
    const alteredSignature = Uint8Array.from(validSignature)
    alteredSignature[0] = 0

    const result = await verifyHmacSha256({
      secret,
      payload,
      signature: alteredSignature,
    })

    expect(result).toBe(false)
  })

  it('rejects an empty secret', async () => {
    const result = await verifyHmacSha256({
      secret: new Uint8Array(),
      payload,
      signature: validSignature,
    })

    expect(result).toBe(false)
  })

  it('rejects a signature with the wrong length', async () => {
    const result = await verifyHmacSha256({
      secret,
      payload,
      signature: new Uint8Array(31),
    })

    expect(result).toBe(false)
  })
})

describe('verifyHmacSha512', () => {
  const sha512Signature = requiredHex(
    '87aa7cdea5ef619d4ff0b4241a1d6cb0' +
    '2379f4e2ce4ec2787ad0b30545e17cde' +
    'daa833b7d6b8a702038b274eaea3f4e4' +
    'be9d914eeb61f1702e696c203a126854',
  )

  it('accepts the RFC 4231 SHA-512 test vector', async () => {
    const result = await verifyHmacSha512({
      secret,
      payload,
      signature: sha512Signature,
    })

    expect(result).toBe(true)
  })

  it('rejects a SHA-512 signature with the wrong length', async () => {
    const result = await verifyHmacSha512({
      secret,
      payload,
      signature: new Uint8Array(63),
    })

    expect(result).toBe(false)
  })
})