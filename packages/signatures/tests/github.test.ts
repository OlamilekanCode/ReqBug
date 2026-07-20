import { describe, expect, it } from 'vitest'

import { verifyGitHubSignature } from '../src/providers/github.js'

const encoder = new TextEncoder()

const secret = "It's a Secret to Everybody"
const payload = encoder.encode('Hello, World!')

const validSignatureHeader =
  'sha256=757107ea0eb2509fc211221cce984b8a' +
  '37570b6d7586c22c46f4379c8b043e17'

describe('verifyGitHubSignature', () => {
  it('accepts GitHub’s documented test signature', async () => {
    const result = await verifyGitHubSignature({
      secret,
      payload,
      signatureHeader: validSignatureHeader,
    })

    expect(result).toEqual({
      verified: true,
    })
  })

  it('reports a missing secret', async () => {
    const result = await verifyGitHubSignature({
      secret: '',
      payload,
      signatureHeader: validSignatureHeader,
    })

    expect(result).toEqual({
      verified: false,
      reason: 'missing-secret',
    })
  })

  it('reports a missing signature header', async () => {
    const result = await verifyGitHubSignature({
      secret,
      payload,
      signatureHeader: null,
    })

    expect(result).toEqual({
      verified: false,
      reason: 'missing-signature',
    })
  })

  it('rejects the legacy SHA-1 prefix', async () => {
    const result = await verifyGitHubSignature({
      secret,
      payload,
      signatureHeader: 'sha1=1234',
    })

    expect(result).toEqual({
      verified: false,
      reason: 'invalid-signature-format',
    })
  })

  it('rejects non-hexadecimal signatures', async () => {
    const result = await verifyGitHubSignature({
      secret,
      payload,
      signatureHeader: `sha256=${'z'.repeat(64)}`,
    })

    expect(result).toEqual({
      verified: false,
      reason: 'invalid-signature-format',
    })
  })

  it('rejects signatures with an incorrect length', async () => {
    const result = await verifyGitHubSignature({
      secret,
      payload,
      signatureHeader: 'sha256=1234',
    })

    expect(result).toEqual({
      verified: false,
      reason: 'invalid-signature-format',
    })
  })

  it('reports a signature mismatch', async () => {
    const result = await verifyGitHubSignature({
      secret,
      payload,
      signatureHeader: `sha256=${'0'.repeat(64)}`,
    })

    expect(result).toEqual({
      verified: false,
      reason: 'signature-mismatch',
    })
  })
})