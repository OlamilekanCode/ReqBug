import { base64ToBytes } from '../core/bytes.js'
import { verifyHmacSha256 } from '../core/hmac.js'

const FLUTTERWAVE_SIGNATURE_LENGTH = 32

export type FlutterwaveSignatureFailureReason =
  | 'missing-secret'
  | 'missing-signature'
  | 'invalid-signature-format'
  | 'signature-mismatch'

export type FlutterwaveSignatureVerificationResult =
  | {
      readonly verified: true
    }
  | {
      readonly verified: false
      readonly reason: FlutterwaveSignatureFailureReason
    }

export interface VerifyFlutterwaveSignatureInput {
  readonly secret: string
  readonly payload: Uint8Array
  readonly signatureHeader: string | null
}

export async function verifyFlutterwaveSignature({
  secret,
  payload,
  signatureHeader,
}: VerifyFlutterwaveSignatureInput): Promise<FlutterwaveSignatureVerificationResult> {
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
    signature.length !== FLUTTERWAVE_SIGNATURE_LENGTH
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