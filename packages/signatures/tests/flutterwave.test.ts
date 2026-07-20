import { describe, expect, it } from 'vitest'

import { verifyFlutterwaveSignature } from '../src/providers/flutterwave.js'

const encoder = new TextEncoder()

const secret = 'flutterwave_test_secret'

const payload = encoder.encode(
  '{"type":"charge.completed","data":{"reference":"reqbug-001"}}',
)

const validSignature =
  'KU8YIxp/dj+ZL9Um32m1Glk2pIamdbSL58tpph+aw/w='

describe('verifyFlutterwaveSignature', () => {
  it('accepts a valid Flutterwave HMAC signature', async () => {
    const result = await verifyFlutterwaveSignature({
      secret,
      payload,
      signatureHeader: validSignature,
    })

    expect(result).toEqual({
      verified: true,
    })
  })

  it('rejects an altered payload', async () => {
    const result = await verifyFlutterwaveSignature({
      secret,
      payload: encoder.encode(
        '{"type":"charge.failed","data":{"reference":"reqbug-001"}}',
      ),
      signatureHeader: validSignature,
    })

    expect(result).toEqual({
      verified: false,
      reason: 'signature-mismatch',
    })
  })

  it('reports a missing secret', async () => {
    const result = await verifyFlutterwaveSignature({
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
    const result = await verifyFlutterwaveSignature({
      secret,
      payload,
      signatureHeader: null,
    })

    expect(result).toEqual({
      verified: false,
      reason: 'missing-signature',
    })
  })

  it('rejects malformed Base64', async () => {
    const result = await verifyFlutterwaveSignature({
      secret,
      payload,
      signatureHeader: 'not!base64',
    })

    expect(result).toEqual({
      verified: false,
      reason: 'invalid-signature-format',
    })
  })

  it('rejects a decoded signature with the wrong length', async () => {
    const result = await verifyFlutterwaveSignature({
      secret,
      payload,
      signatureHeader: 'AA==',
    })

    expect(result).toEqual({
      verified: false,
      reason: 'invalid-signature-format',
    })
  })
})