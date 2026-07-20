import { concatBytes, hexToBytes } from './bytes.js'
import { verifyHmacSha256 } from './hmac.js'

const STRIPE_SIGNATURE_HEX_LENGTH = 64

export const DEFAULT_STRIPE_TOLERANCE_SECONDS = 300

type StripeBasicFailureReason =
  | 'missing-secret'
  | 'missing-signature'
  | 'invalid-signature-format'
  | 'signature-mismatch'

export type StripeSignatureFailureReason =
  | StripeBasicFailureReason
  | 'timestamp-outside-tolerance'

export type StripeSignatureVerificationResult =
  | {
      readonly verified: true
      readonly timestamp: number
      readonly ageSeconds: number
    }
  | {
      readonly verified: false
      readonly reason: StripeBasicFailureReason
    }
  | {
      readonly verified: false
      readonly reason: 'timestamp-outside-tolerance'
      readonly timestamp: number
      readonly ageSeconds: number
    }

export interface VerifyStripeSignatureInput {
  readonly secret: string
  readonly payload: Uint8Array
  readonly signatureHeader: string | null
  readonly currentTimeSeconds?: number
}

interface ParsedStripeSignatureHeader {
  readonly timestamp: number
  readonly signatures: readonly Uint8Array[]
}

function parseStripeSignatureHeader(
  header: string,
): ParsedStripeSignatureHeader | null {
  let timestamp: number | null = null
  const signatures: Uint8Array[] = []

  for (const part of header.split(',')) {
    const segment = part.trim()
    const separatorIndex = segment.indexOf('=')

    if (separatorIndex <= 0) {
      continue
    }

    const key = segment.slice(0, separatorIndex)
    const value = segment.slice(separatorIndex + 1)

    if (key === 't') {
      if (timestamp !== null || !/^\d+$/.test(value)) {
        return null
      }

      const parsedTimestamp = Number(value)

      if (!Number.isSafeInteger(parsedTimestamp)) {
        return null
      }

      timestamp = parsedTimestamp
    }

    if (key === 'v1' && value.length === STRIPE_SIGNATURE_HEX_LENGTH) {
      const signature = hexToBytes(value)

      if (signature !== null) {
        signatures.push(signature)
      }
    }
  }

  if (timestamp === null || signatures.length === 0) {
    return null
  }

  return {
    timestamp,
    signatures,
  }
}

export async function verifyStripeSignature({
  secret,
  payload,
  signatureHeader,
  currentTimeSeconds,
}: VerifyStripeSignatureInput): Promise<StripeSignatureVerificationResult> {
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

  const parsedHeader = parseStripeSignatureHeader(signatureHeader)

  if (parsedHeader === null) {
    return {
      verified: false,
      reason: 'invalid-signature-format',
    }
  }

  const encoder = new TextEncoder()

  const signedPayload = concatBytes(
    encoder.encode(`${parsedHeader.timestamp}.`),
    payload,
  )

  const secretBytes = encoder.encode(secret)
  let signatureMatches = false

  for (const signature of parsedHeader.signatures) {
    const matches = await verifyHmacSha256({
      secret: secretBytes,
      payload: signedPayload,
      signature,
    })

    if (matches) {
      signatureMatches = true
      break
    }
  }

  if (!signatureMatches) {
    return {
      verified: false,
      reason: 'signature-mismatch',
    }
  }

  const now =
    currentTimeSeconds ?? Math.floor(Date.now() / 1000)

  const ageSeconds = Math.abs(now - parsedHeader.timestamp)

  if (ageSeconds > DEFAULT_STRIPE_TOLERANCE_SECONDS) {
    return {
      verified: false,
      reason: 'timestamp-outside-tolerance',
      timestamp: parsedHeader.timestamp,
      ageSeconds,
    }
  }

  return {
    verified: true,
    timestamp: parsedHeader.timestamp,
    ageSeconds,
  }
}