import {
  base64ToBytes,
  hexToBytes,
} from '../core/bytes.js'

import { verifyHmacSha256 } from '../core/hmac.js'

const HMAC_SHA_256_SIGNATURE_LENGTH = 32

export type GenericHmacSignatureEncoding =
  | 'hex'
  | 'base64'

export type GenericHmacSignatureFailureReason =
  | 'missing-secret'
  | 'missing-signature'
  | 'invalid-signature-format'
  | 'signature-mismatch'

export type GenericHmacSignatureVerificationResult =
  | {
      readonly verified: true
    }
  | {
      readonly verified: false
      readonly reason: GenericHmacSignatureFailureReason
    }

export interface VerifyGenericHmacSha256SignatureInput {
  readonly secret: string
  readonly payload: Uint8Array
  readonly signatureHeader: string | null
  readonly encoding: GenericHmacSignatureEncoding
  readonly signaturePrefix?: string
}

function decodeSignature(
  value: string,
  encoding: GenericHmacSignatureEncoding,
): Uint8Array | null {
  switch (encoding) {
    case 'hex':
      return hexToBytes(value)

    case 'base64':
      return base64ToBytes(value)

    default:
      return null
  }
}

export async function verifyGenericHmacSha256Signature({
  secret,
  payload,
  signatureHeader,
  encoding,
  signaturePrefix = '',
}: VerifyGenericHmacSha256SignatureInput): Promise<GenericHmacSignatureVerificationResult> {
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

  if (
    signaturePrefix.length > 0 &&
    !signatureHeader.startsWith(signaturePrefix)
  ) {
    return {
      verified: false,
      reason: 'invalid-signature-format',
    }
  }

  const encodedSignature = signatureHeader.slice(
    signaturePrefix.length,
  )

  const signature = decodeSignature(
    encodedSignature,
    encoding,
  )

  if (
    signature === null ||
    signature.length !== HMAC_SHA_256_SIGNATURE_LENGTH
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