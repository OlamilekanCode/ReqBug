import { describe, expect, it } from 'vitest'

import { verifyStripeSignature } from '../src/providers/stripe.js'

const encoder = new TextEncoder()

const secret = 'whsec_test_secret'
const timestamp = 1_700_000_000
const payload = encoder.encode('{"id":"evt_test"}')

const validSignature =
  '13941114bb88ac44a76abcfddea5b92a' +
  'a6182a4b63d8be3aae908a616083bd7e'

const validHeader = `t=${timestamp},v1=${validSignature}`

describe('verifyStripeSignature', () => {
  it('accepts a valid and recent signature', async () => {
    const result = await verifyStripeSignature({
      secret,
      payload,
      signatureHeader: validHeader,
      currentTimeSeconds: timestamp + 60,
    })

    expect(result).toEqual({
      verified: true,
      timestamp,
      ageSeconds: 60,
    })
  })

  it('supports multiple v1 signatures', async () => {
    const result = await verifyStripeSignature({
      secret,
      payload,
      signatureHeader:
        `t=${timestamp},v1=${'0'.repeat(64)},` +
        `v1=${validSignature}`,
      currentTimeSeconds: timestamp,
    })

    expect(result).toEqual({
      verified: true,
      timestamp,
      ageSeconds: 0,
    })
  })

  it('rejects an altered payload', async () => {
    const result = await verifyStripeSignature({
      secret,
      payload: encoder.encode('{"id":"evt_changed"}'),
      signatureHeader: validHeader,
      currentTimeSeconds: timestamp,
    })

    expect(result).toEqual({
      verified: false,
      reason: 'signature-mismatch',
    })
  })

  it('rejects a missing signature', async () => {
    const result = await verifyStripeSignature({
      secret,
      payload,
      signatureHeader: null,
      currentTimeSeconds: timestamp,
    })

    expect(result).toEqual({
      verified: false,
      reason: 'missing-signature',
    })
  })

  it('rejects a malformed header', async () => {
    const result = await verifyStripeSignature({
      secret,
      payload,
      signatureHeader: 'v1=1234',
      currentTimeSeconds: timestamp,
    })

    expect(result).toEqual({
      verified: false,
      reason: 'invalid-signature-format',
    })
  })

  it('rejects an empty secret', async () => {
    const result = await verifyStripeSignature({
      secret: '',
      payload,
      signatureHeader: validHeader,
      currentTimeSeconds: timestamp,
    })

    expect(result).toEqual({
      verified: false,
      reason: 'missing-secret',
    })
  })

  it('rejects a valid signature outside the tolerance', async () => {
    const result = await verifyStripeSignature({
      secret,
      payload,
      signatureHeader: validHeader,
      currentTimeSeconds: timestamp + 301,
    })

    expect(result).toEqual({
      verified: false,
      reason: 'timestamp-outside-tolerance',
      timestamp,
      ageSeconds: 301,
    })
  })
})