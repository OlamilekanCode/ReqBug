import {
  describe,
  expect,
  it,
} from 'vitest'

import {
  WebCryptoSecureValueGenerator,
  WebCryptoTokenDigestService,
} from '../src/platform/crypto.js'

describe('WebCryptoSecureValueGenerator', () => {
  it('generates URL-safe values with the required entropy', () => {
    const generator =
      new WebCryptoSecureValueGenerator()

    const inboxId =
      generator.generateInboxId()

    const capability =
      generator.generateCapabilityToken()

    expect(inboxId).toHaveLength(22)
    expect(capability).toHaveLength(43)

    expect(inboxId).toMatch(
      /^[A-Za-z0-9_-]+$/u,
    )

    expect(capability).toMatch(
      /^[A-Za-z0-9_-]+$/u,
    )
  })

  it('generates distinct capabilities', () => {
    const generator =
      new WebCryptoSecureValueGenerator()

    const values =
      new Set(
        Array.from(
          { length: 20 },
          () =>
            generator
              .generateCapabilityToken(),
        ),
      )

    expect(values.size).toBe(20)
  })
})

describe('WebCryptoTokenDigestService', () => {
  it('hashes and verifies capabilities', async () => {
    const service =
      new WebCryptoTokenDigestService()

    const digest =
      await service.digest(
        'test-capability',
      )

    expect(digest).toHaveLength(32)

    expect(
      await service.verify(
        'test-capability',
        digest,
      ),
    ).toBe(true)

    expect(
      await service.verify(
        'wrong-capability',
        digest,
      ),
    ).toBe(false)

    expect(
      await service.verify(
        'test-capability',
        new Uint8Array(31),
      ),
    ).toBe(false)
  })
})