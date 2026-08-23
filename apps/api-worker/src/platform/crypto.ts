import type {
  SecureValueGenerator,
  TokenDigestService,
} from '@reqbug/core'

const INBOX_ID_BYTE_LENGTH = 16
const CAPABILITY_BYTE_LENGTH = 32

export function bytesToBase64Url(
  bytes: Uint8Array,
): string {
  let binary = ''

  for (const byte of bytes) {
    binary += String.fromCharCode(byte)
  }

  return btoa(binary)
    .replaceAll('+', '-')
    .replaceAll('/', '_')
    .replace(/=+$/u, '')
}

export async function sha256Bytes(
  bytes: Uint8Array,
): Promise<Uint8Array> {
  const digest =
    await crypto.subtle.digest(
      'SHA-256',
      bytes.slice().buffer,
    )

  return new Uint8Array(digest)
}

function generateSecureValue(
  byteLength: number,
): string {
  const bytes =
    new Uint8Array(byteLength)

  crypto.getRandomValues(bytes)

  return bytesToBase64Url(bytes)
}

export class WebCryptoSecureValueGenerator
  implements SecureValueGenerator {
  generateInboxId(): string {
    return generateSecureValue(
      INBOX_ID_BYTE_LENGTH,
    )
  }

  generateCapabilityToken(): string {
    return generateSecureValue(
      CAPABILITY_BYTE_LENGTH,
    )
  }
}

export class WebCryptoTokenDigestService
  implements TokenDigestService {
  private readonly encoder =
    new TextEncoder()

  async digest(
    token: string,
  ): Promise<Uint8Array> {
    return sha256Bytes(
      this.encoder.encode(token),
    )
  }

  async verify(
    token: string,
    expectedDigest: Uint8Array,
  ): Promise<boolean> {
    const actualDigest =
      await this.digest(token)

    if (
      actualDigest.length !==
      expectedDigest.length
    ) {
      return false
    }

    let difference = 0

    for (
      let index = 0;
      index < actualDigest.length;
      index += 1
    ) {
      difference |=
        actualDigest[index] ^
        expectedDigest[index]
    }

    return difference === 0
  }
}