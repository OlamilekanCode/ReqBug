import {
  describe,
  expect,
  it,
} from 'vitest'
import {
  createInbox,
  DEFAULT_INBOX_POLICY,
  type ExpiryScheduler,
  type InboxRepository,
  type StoredInbox,
  type TokenDigestService,
} from '../../src/index.js'

const inboxId = 'ibx_test'
const ingestToken = 'i'.repeat(43)
const readToken = 'r'.repeat(43)
const createdAtMs = 1_750_000_000_000

class FakeInboxRepository
  implements InboxRepository
{
  created: StoredInbox | null = null
  deletedIds: string[] = []
  failCreation = false

  async create(
    inbox: StoredInbox,
  ): Promise<void> {
    if (this.failCreation) {
      throw new Error('storage unavailable')
    }

    this.created = inbox
  }

  async findById(): Promise<StoredInbox | null> {
    return this.created
  }

  async deleteById(
    id: string,
  ): Promise<void> {
    this.deletedIds.push(id)
    this.created = null
  }
}

class FakeExpiryScheduler
  implements ExpiryScheduler
{
  scheduled: Array<{
    inboxId: string
    expiresAtMs: number
  }> = []

  fail = false

  async scheduleInboxExpiry(
    input: {
      inboxId: string
      expiresAtMs: number
    },
  ): Promise<void> {
    if (this.fail) {
      throw new Error('alarm unavailable')
    }

    this.scheduled.push(input)
  }
}

class FakeTokenDigests
  implements TokenDigestService
{
  invalidDigest = false

  async digest(
    token: string,
  ): Promise<Uint8Array> {
    if (this.invalidDigest) {
      return new Uint8Array(1)
    }

    return new Uint8Array(32).fill(
      token === ingestToken ? 1 : 2,
    )
  }

  async verify(): Promise<boolean> {
    return false
  }
}

function createFixture() {
  const inboxes =
    new FakeInboxRepository()

  const expiry =
    new FakeExpiryScheduler()

  const tokenDigests =
    new FakeTokenDigests()

  const tokens = [
    ingestToken,
    readToken,
  ]

  let tokenIndex = 0

  return {
    inboxes,
    expiry,
    tokenDigests,
    dependencies: {
      policy: DEFAULT_INBOX_POLICY,
      clock: {
        nowMilliseconds: () =>
          createdAtMs,
      },
      values: {
        generateInboxId: () =>
          inboxId,
        generateCapabilityToken: () =>
          tokens[tokenIndex++]!,
      },
      tokenDigests,
      inboxes,
      expiry,
    },
  }
}

describe('createInbox', () => {
  it('creates a hash-only inbox and returns its capabilities', async () => {
    const fixture = createFixture()

    const result = await createInbox(
      fixture.dependencies,
    )

    expect(result).toEqual({
      inboxId,
      ingestToken,
      readToken,
      createdAtMs,
      expiresAtMs:
        createdAtMs +
        DEFAULT_INBOX_POLICY.ttlMilliseconds,
    })

    expect(fixture.inboxes.created).toMatchObject({
      schemaVersion: 1,
      inboxId,
      createdAtMs,
      storedRequestCount: 0,
      lifetimeRequestCount: 0,
      nextSequence: 1,
    })

    expect(fixture.inboxes.created).not.toHaveProperty(
      'ingestToken',
    )

    expect(fixture.inboxes.created).not.toHaveProperty(
      'readToken',
    )

    expect(
      fixture.inboxes.created?.ingestTokenHash,
    ).toEqual(
      new Uint8Array(32).fill(1),
    )

    expect(
      fixture.inboxes.created?.readTokenHash,
    ).toEqual(
      new Uint8Array(32).fill(2),
    )

    expect(fixture.expiry.scheduled).toEqual([
      {
        inboxId,
        expiresAtMs:
          result.expiresAtMs,
      },
    ])
  })

  it('rejects identical ingest and read capabilities', async () => {
    const fixture = createFixture()

    fixture.dependencies.values
      .generateCapabilityToken =
      () => ingestToken

    await expect(
      createInbox(fixture.dependencies),
    ).rejects.toMatchObject({
      code:
        'DUPLICATE_GENERATED_CAPABILITY',
    })
  })

  it('rejects malformed generated capabilities', async () => {
    const fixture = createFixture()

    fixture.dependencies.values
      .generateCapabilityToken =
      () => 'short'

    await expect(
      createInbox(fixture.dependencies),
    ).rejects.toMatchObject({
      code:
        'INVALID_GENERATED_CAPABILITY',
    })
  })

  it('rejects malformed token digests', async () => {
    const fixture = createFixture()

    fixture.tokenDigests.invalidDigest =
      true

    await expect(
      createInbox(fixture.dependencies),
    ).rejects.toMatchObject({
      code: 'INVALID_TOKEN_DIGEST',
    })

    expect(
      fixture.inboxes.created,
    ).toBeNull()
  })

  it('removes the inbox when expiry scheduling fails', async () => {
    const fixture = createFixture()

    fixture.expiry.fail = true

    await expect(
      createInbox(fixture.dependencies),
    ).rejects.toMatchObject({
      code: 'EXPIRY_SCHEDULE_FAILED',
    })

    expect(
      fixture.inboxes.deletedIds,
    ).toEqual([inboxId])

    expect(
      fixture.inboxes.created,
    ).toBeNull()
  })

  it('does not schedule expiry when storage creation fails', async () => {
    const fixture = createFixture()

    fixture.inboxes.failCreation = true

    await expect(
      createInbox(fixture.dependencies),
    ).rejects.toThrow(
      'storage unavailable',
    )

    expect(
      fixture.expiry.scheduled,
    ).toEqual([])
  })
})