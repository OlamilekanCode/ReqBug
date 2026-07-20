import { hexToBytes } from './bytes.js'
import { verifyHmacSha256 } from './hmac.js'

const GITHUB_SIGNATURE_PREFIX = 'sha256='
const SHA_256_HEX_LENGTH = 64

export type GitHubSignatureFailureReason =
  | 'missing-secret'
  | 'missing-signature'
  | 'invalid-signature-format'
  | 'signature-mismatch'

export type GitHubSignatureVerificationResult =
  | {
      readonly verified: true
    }
  | {
      readonly verified: false
      readonly reason: GitHubSignatureFailureReason
    }

export interface VerifyGitHubSignatureInput {
  readonly secret: string
  readonly payload: Uint8Array
  readonly signatureHeader: string | null
}

export async function verifyGitHubSignature({
  secret,
  payload,
  signatureHeader,
}: VerifyGitHubSignatureInput): Promise<GitHubSignatureVerificationResult> {
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

  if (!signatureHeader.startsWith(GITHUB_SIGNATURE_PREFIX)) {
    return {
      verified: false,
      reason: 'invalid-signature-format',
    }
  }

  const signatureHex = signatureHeader.slice(
    GITHUB_SIGNATURE_PREFIX.length,
  )

  if (signatureHex.length !== SHA_256_HEX_LENGTH) {
    return {
      verified: false,
      reason: 'invalid-signature-format',
    }
  }

  const signature = hexToBytes(signatureHex)

  if (signature === null) {
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