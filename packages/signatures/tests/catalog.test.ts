import { describe, expect, it } from 'vitest'

import {
  getSignatureProviderMetadata,
  isSignatureProviderId,
  SIGNATURE_PROVIDERS,
} from '../src/providers/catalog.js'

describe('SIGNATURE_PROVIDERS', () => {
  it('contains every approved MVP provider', () => {
    expect(
      SIGNATURE_PROVIDERS.map((provider) => provider.id),
    ).toEqual([
      'github',
      'stripe',
      'shopify',
      'paystack',
      'flutterwave',
      'generic-hmac-sha256',
    ])
  })

  it('contains unique provider IDs', () => {
    const ids = SIGNATURE_PROVIDERS.map(
      (provider) => provider.id,
    )

    expect(new Set(ids).size).toBe(ids.length)
  })

  it('keeps predefined HTTP headers lowercase', () => {
    for (const provider of SIGNATURE_PROVIDERS) {
      if (provider.signatureHeader !== null) {
        expect(provider.signatureHeader).toBe(
          provider.signatureHeader.toLowerCase(),
        )
      }
    }
  })

  it('marks Stripe as having signed timestamp protection', () => {
    const stripe = getSignatureProviderMetadata('stripe')

    expect(stripe.freshnessProtection).toBe(
      'signed-timestamp',
    )
  })

  it('marks Paystack as requiring an API secret', () => {
    const paystack = getSignatureProviderMetadata('paystack')

    expect(paystack.secretSensitivity).toBe('api-secret')
    expect(paystack.warning).not.toBeNull()
  })

  it('records provider duplicate-delivery headers', () => {
    expect(
      getSignatureProviderMetadata('github')
        .deduplicationHeader,
    ).toBe('x-github-delivery')

    expect(
      getSignatureProviderMetadata('shopify')
        .deduplicationHeader,
    ).toBe('x-shopify-webhook-id')
  })
})

describe('isSignatureProviderId', () => {
  it('accepts known provider IDs', () => {
    expect(isSignatureProviderId('github')).toBe(true)
    expect(isSignatureProviderId('paystack')).toBe(true)
  })

  it('rejects unknown provider IDs', () => {
    expect(isSignatureProviderId('unknown')).toBe(false)
    expect(isSignatureProviderId('')).toBe(false)
  })
})