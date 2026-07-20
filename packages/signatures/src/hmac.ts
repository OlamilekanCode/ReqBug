const HMAC_SIGNATURE_LENGTHS = {
  'SHA-256': 32,
  'SHA-512': 64,
} as const

type HmacHashAlgorithm = keyof typeof HMAC_SIGNATURE_LENGTHS

export interface VerifyHmacInput {
  readonly secret: Uint8Array
  readonly payload: Uint8Array
  readonly signature: Uint8Array
}

export type VerifyHmacSha256Input = VerifyHmacInput
export type VerifyHmacSha512Input = VerifyHmacInput

async function verifyHmac(
  hash: HmacHashAlgorithm,
  {
    secret,
    payload,
    signature,
  }: VerifyHmacInput,
): Promise<boolean> {
  const requiredSignatureLength =
    HMAC_SIGNATURE_LENGTHS[hash]

  if (
    secret.length === 0 ||
    signature.length !== requiredSignatureLength
  ) {
    return false
  }

  const algorithm = {
    name: 'HMAC',
    hash,
  } as const

  const key = await globalThis.crypto.subtle.importKey(
    'raw',
    Uint8Array.from(secret),
    algorithm,
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

export function verifyHmacSha256(
  input: VerifyHmacSha256Input,
): Promise<boolean> {
  return verifyHmac('SHA-256', input)
}

export function verifyHmacSha512(
  input: VerifyHmacSha512Input,
): Promise<boolean> {
  return verifyHmac('SHA-512', input)
}