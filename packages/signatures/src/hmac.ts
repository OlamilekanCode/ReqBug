const HMAC_SHA_256_ALGORITHM = {
  name: 'HMAC',
  hash: 'SHA-256',
} as const

const HMAC_SHA_256_SIGNATURE_LENGTH = 32

export interface VerifyHmacSha256Input {
  readonly secret: Uint8Array
  readonly payload: Uint8Array
  readonly signature: Uint8Array
}

export async function verifyHmacSha256({
  secret,
  payload,
  signature,
}: VerifyHmacSha256Input): Promise<boolean> {
  if (
    secret.length === 0 ||
    signature.length !== HMAC_SHA_256_SIGNATURE_LENGTH
  ) {
    return false
  }

  const key = await globalThis.crypto.subtle.importKey(
    'raw',
    Uint8Array.from(secret),
    HMAC_SHA_256_ALGORITHM,
    false,
    ['verify'],
  )

  return globalThis.crypto.subtle.verify(
    'HMAC',
    key,
    Uint8Array.from(signature),
    Uint8Array.from(payload),
  )
}