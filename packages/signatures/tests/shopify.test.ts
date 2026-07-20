import { describe, expect, it } from 'vitest'

import { verifyShopifySignature } from '../src/providers/shopify.js'

const encoder = new TextEncoder()

const secret = 'shopify_test_secret'
const payload = encoder.encode(
  '{"id":123,"topic":"orders/create"}',
)

const validSignature =
  'kmtYt66TOwN2LQRAvFudJbpYjg5c3dFvE8P13LjmNWs='

describe('verifyShopifySignature', () => {
  it('accepts a valid Shopify signature', async () => {
    const result = await verifyShopifySignature({
      secret,
      payload,
      signatureHeader: validSignature,
    })

    expect(result).toEqual({
      verified: true,
    })
  })

  it('rejects an altered payload', async () => {
    const result = await verifyShopifySignature({
      secret,
      payload: encoder.encode(
        '{"id":124,"topic":"orders/create"}',
      ),
      signatureHeader: validSignature,
    })

    expect(result).toEqual({
      verified: false,
      reason: 'signature-mismatch',
    })
  })

  it('reports a missing secret', async () => {
    const result = await verifyShopifySignature({
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
    const result = await verifyShopifySignature({
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
    const result = await verifyShopifySignature({
      secret,
      payload,
      signatureHeader: '%%%%',
    })

    expect(result).toEqual({
      verified: false,
      reason: 'invalid-signature-format',
    })
  })

  it('rejects a decoded signature with the wrong length', async () => {
    const result = await verifyShopifySignature({
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