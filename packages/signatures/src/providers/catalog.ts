export type SignatureAlgorithm =
  | 'HMAC-SHA256'
  | 'HMAC-SHA512'

export type SignatureEncoding =
  | 'hex'
  | 'base64'
  | 'timestamped-hex'
  | 'configurable'

export type SecretSensitivity =
  | 'webhook-secret'
  | 'application-secret'
  | 'api-secret'
  | 'custom-secret'

export type FreshnessProtection =
  | 'signed-timestamp'
  | 'none'

export interface SignatureProviderMetadata {
  readonly id: string
  readonly displayName: string
  readonly signatureHeader: string | null
  readonly algorithm: SignatureAlgorithm
  readonly encoding: SignatureEncoding
  readonly secretLabel: string
  readonly secretSensitivity: SecretSensitivity
  readonly freshnessProtection: FreshnessProtection
  readonly deduplicationHeader: string | null
  readonly documentationUrl: string | null
  readonly warning: string | null
}

export const SIGNATURE_PROVIDERS = [
  {
    id: 'github',
    displayName: 'GitHub',
    signatureHeader: 'x-hub-signature-256',
    algorithm: 'HMAC-SHA256',
    encoding: 'hex',
    secretLabel: 'Webhook secret',
    secretSensitivity: 'webhook-secret',
    freshnessProtection: 'none',
    deduplicationHeader: 'x-github-delivery',
    documentationUrl:
      'https://docs.github.com/en/webhooks/using-webhooks/validating-webhook-deliveries',
    warning: null,
  },
  {
    id: 'stripe',
    displayName: 'Stripe',
    signatureHeader: 'stripe-signature',
    algorithm: 'HMAC-SHA256',
    encoding: 'timestamped-hex',
    secretLabel: 'Endpoint signing secret',
    secretSensitivity: 'webhook-secret',
    freshnessProtection: 'signed-timestamp',
    deduplicationHeader: null,
    documentationUrl:
      'https://docs.stripe.com/webhooks',
    warning: null,
  },
  {
    id: 'shopify',
    displayName: 'Shopify',
    signatureHeader: 'x-shopify-hmac-sha256',
    algorithm: 'HMAC-SHA256',
    encoding: 'base64',
    secretLabel: 'App client secret',
    secretSensitivity: 'application-secret',
    freshnessProtection: 'none',
    deduplicationHeader: 'x-shopify-webhook-id',
    documentationUrl:
      'https://shopify.dev/docs/apps/build/webhooks/verify-deliveries',
    warning:
      'Use a development app secret only. Never enter a production app secret into a hosted debugging tool.',
  },
  {
    id: 'paystack',
    displayName: 'Paystack',
    signatureHeader: 'x-paystack-signature',
    algorithm: 'HMAC-SHA512',
    encoding: 'hex',
    secretLabel: 'Test API secret key',
    secretSensitivity: 'api-secret',
    freshnessProtection: 'none',
    deduplicationHeader: null,
    documentationUrl:
      'https://paystack.com/docs/payments/webhooks/',
    warning:
      'Hosted verification is for test keys only. Never enter a live Paystack API secret key.',
  },
  {
    id: 'flutterwave',
    displayName: 'Flutterwave',
    signatureHeader: 'flutterwave-signature',
    algorithm: 'HMAC-SHA256',
    encoding: 'base64',
    secretLabel: 'Webhook secret hash',
    secretSensitivity: 'webhook-secret',
    freshnessProtection: 'none',
    deduplicationHeader: null,
    documentationUrl:
      'https://developer.flutterwave.com/docs/webhooks',
    warning:
      'This preset uses the current HMAC signature format. Legacy v3 verif-hash webhooks use a different security model.',
  },
  {
    id: 'generic-hmac-sha256',
    displayName: 'Generic HMAC-SHA256',
    signatureHeader: null,
    algorithm: 'HMAC-SHA256',
    encoding: 'configurable',
    secretLabel: 'Signing secret',
    secretSensitivity: 'custom-secret',
    freshnessProtection: 'none',
    deduplicationHeader: null,
    documentationUrl: null,
    warning:
      'This preset verifies HMAC-SHA256 over the exact raw request body only.',
  },
] as const satisfies readonly SignatureProviderMetadata[]

export type SignatureProviderId =
  (typeof SIGNATURE_PROVIDERS)[number]['id']

export function isSignatureProviderId(
  value: string,
): value is SignatureProviderId {
  return SIGNATURE_PROVIDERS.some(
    (provider) => provider.id === value,
  )
}

export function getSignatureProviderMetadata(
  id: SignatureProviderId,
) {
  const provider = SIGNATURE_PROVIDERS.find(
    (candidate) => candidate.id === id,
  )

  if (provider === undefined) {
    throw new Error(`Unknown signature provider: ${id}`)
  }

  return provider
}