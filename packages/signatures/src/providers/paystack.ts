import { hexToBytes } from '../core/bytes.js'
import { verifyHmacSha512 } from '../core/hmac.js'

const PAYSTACK_SIGNATURE_HEX_LENGTH = 128
const PAYSTACK_SIGNATURE_BYTE_LENGTH = 64

export type PaystackSignatureFailureReason =
  | 'missing-secret'
  | 'missing-signature'
  | 'invalid-signature-format'
  | 'signature-mismatch'

export type PaystackSignatureVerificationResult =
  | {
      readonly verified: true
    }
  | {
      readonly verified: false
      readonly reason: PaystackSignatureFailureReason
    }

export interface VerifyPaystackSignatureInput {
  readonly secret: string
  readonly payload: Uint8Array
  readonly signatureHeader: string | null
}

export async function verifyPaystackSignature({
  secret,
  payload,
  signatureHeader,
}: VerifyPaystackSignatureInput): Promise<PaystackSignatureVerificationResult> {
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

  if (signatureHeader.length !== PAYSTACK_SIGNATURE_HEX_LENGTH) {
    return {
      verified: false,
      reason: 'invalid-signature-format',
    }
  }

  const signature = hexToBytes(signatureHeader)

  if (
    signature === null ||
    signature.length !== PAYSTACK_SIGNATURE_BYTE_LENGTH
  ) {
    return {
      verified: false,
      reason: 'invalid-signature-format',
    }
  }

  const verified = await verifyHmacSha512({
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