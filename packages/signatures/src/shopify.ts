import { base64ToBytes } from './bytes.js'
import { verifyHmacSha256 } from './hmac.js'

const SHOPIFY_SIGNATURE_LENGTH = 32

export type ShopifySignatureFailureReason =
  | 'missing-secret'
  | 'missing-signature'
  | 'invalid-signature-format'
  | 'signature-mismatch'

export type ShopifySignatureVerificationResult =
  | {
      readonly verified: true
    }
  | {
      readonly verified: false
      readonly reason: ShopifySignatureFailureReason
    }

export interface VerifyShopifySignatureInput {
  readonly secret: string
  readonly payload: Uint8Array
  readonly signatureHeader: string | null
}

export async function verifyShopifySignature({
  secret,
  payload,
  signatureHeader,
}: VerifyShopifySignatureInput): Promise<ShopifySignatureVerificationResult> {
  if (secret.length === 0) {
    return {
      verified: false,
      reason: 'missing-secret',
    }
  }

  if (signatureHeader === null || signatureHeader.length === 0) {
    return {
      verified: false,
      reason: 'missing-signature',
    }
  }

  const signature = base64ToBytes(signatureHeader)

  if (
    signature === null ||
    signature.length !== SHOPIFY_SIGNATURE_LENGTH
  ) {
    return {
      verified: false,
      reason: 'invalid-signature-format',
    }
  }

  const verified = await verifyHmacSha256({
    secret: new TextEncoder().encode(secret),
    payload,
    signature,
  })

  if (!verified) {
    return {
      verified: false,
      reason: 'signature-mismatch',
    }
  }

  return {
    verified: true,
  }
}