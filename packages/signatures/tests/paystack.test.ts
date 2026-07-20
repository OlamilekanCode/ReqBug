import { describe, expect, it } from 'vitest'

import { verifyPaystackSignature } from '../src/providers/paystack.js'

const encoder = new TextEncoder()

const secret = 'paystack_test_secret'

const payload = encoder.encode(
  '{"event":"charge.success","data":{"reference":"reqbug-001"}}',
)

const validSignature =
  'd96251c1f6159a5b46826feefab432b8' +
  '517c7caf704b4f04acb6b938ee1a6614' +
  '3cf25913cc20f72736b87093dc705235' +
  '2e4e2379eb05535091d363cc81a8ec18'

describe('verifyPaystackSignature', () => {
  it('accepts a valid Paystack signature', async () => {
    const result = await verifyPaystackSignature({
      secret,
      payload,
      signatureHeader: validSignature,
    })

    expect(result).toEqual({
      verified: true,
    })
  })

  it('rejects an altered payload', async () => {
    const result = await verifyPaystackSignature({
      secret,
      payload: encoder.encode(
        '{"event":"charge.failed","data":{"reference":"reqbug-001"}}',
      ),
      signatureHeader: validSignature,
    })

    expect(result).toEqual({
      verified: false,
      reason: 'signature-mismatch',
    })
  })

  it('reports a missing secret', async () => {
    const result = await verifyPaystackSignature({
      secret: '',
      payload,
      signatureHeader: validSignature,
    })

    expect(result).toEqual({
      verified: false,
      reason: 'missing-secret',
    })
  })

  it('reports a missing signature', async () => {
    const result = await verifyPaystackSignature({
      secret,
      payload,
      signatureHeader: null,
    })

    expect(result).toEqual({
      verified: false,
      reason: 'missing-signature',
    })
  })

  it('rejects non-hexadecimal signatures', async () => {
    const result = await verifyPaystackSignature({
      secret,
      payload,
      signatureHeader: 'z'.repeat(128),
    })

    expect(result).toEqual({
      verified: false,
      reason: 'invalid-signature-format',
    })
  })

  it('rejects signatures with an incorrect length', async () => {
    const result = await verifyPaystackSignature({
      secret,
      payload,
      signatureHeader: '00',
    })

    expect(result).toEqual({
      verified: false,
      reason: 'invalid-signature-format',
    })
  })
})