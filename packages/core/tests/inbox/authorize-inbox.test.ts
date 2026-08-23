import {
  describe,
  expect,
  it,
} from 'vitest'
import {
  authorizeInbox,
  type InboxRepository,
  type StoredInbox,
  type TokenDigestService,
} from '../../src/index.js'

const ingestToken = 'i'.repeat(43)
const readToken = 'r'.repeat(43)
const nowMs = 1_750_000_000_000

const activeInbox: StoredInbox = {
  schemaVersion: 1,
  inboxId: 'ibx_test',
  ingestTokenHash:
    new Uint8Array(32).fill(1),
  readTokenHash:
    new Uint8Array(32).fill(2),
  createdAtMs: nowMs - 1_000,
  expiresAtMs: nowMs + 60_000,
  deletedAtMs: null,
  storedRequestCount: 0,
  lifetimeRequestCount: 0,
  nextSequence: 1,
}

class FakeRepository
  implements InboxRepository
{
  inbox: StoredInbox | null =
    activeInbox

  async create(): Promise<void> {}

  async findById(): Promise<StoredInbox | null> {
    return this.inbox
  }

  async deleteById(): Promise<void> {}
}

class FakeTokenDigests
  implements TokenDigestService
{
  async digest(): Promise<Uint8Array> {
    return new Uint8Array(32)
  }

  async verify(
    token: string,
    expected: Uint8Array,
  ): Promise<boolean> {
    if (token === ingestToken) {
      return expected[0] === 1
    }

    if (token === readToken) {
      return expected[0] === 2
    }

    return false
  }
}

function createFixture() {
  const inboxes = new FakeRepository()

  return {
    inboxes,
    dependencies: {
      clock: {
        nowMilliseconds: () => nowMs,
      },
      tokenDigests:
        new FakeTokenDigests(),
      inboxes,
    },
  }
}

describe('authorizeInbox', () => {
  it('authorizes an active read capability', async () => {
    const fixture = createFixture()

    const result = await authorizeInbox(
      fixture.dependencies,
      {
        inboxId: 'ibx_test',
        capabilityToken: readToken,
        capability: 'read',
      },
    )

    expect(result).toEqual({
      authorized: true,
      inbox: activeInbox,
    })
  })

  it('authorizes an active ingest capability', async () => {
    const fixture = createFixture()

    const result = await authorizeInbox(
      fixture.dependencies,
      {
        inboxId: 'ibx_test',
        capabilityToken: ingestToken,
        capability: 'ingest',
      },
    )

    expect(result.authorized).toBe(true)
  })

  it('rejects an unknown inbox', async () => {
    const fixture = createFixture()

    fixture.inboxes.inbox = null

    const result = await authorizeInbox(
      fixture.dependencies,
      {
        inboxId: 'unknown',
        capabilityToken: readToken,
        capability: 'read',
      },
    )

    expect(result).toEqual({
      authorized: false,
      reason: 'not-found',
    })
  })

  it('rejects an invalid capability before exposing lifecycle state', async () => {
    const fixture = createFixture()

    fixture.inboxes.inbox = {
      ...activeInbox,
      deletedAtMs: nowMs - 1,
    }

    const result = await authorizeInbox(
      fixture.dependencies,
      {
        inboxId: 'ibx_test',
        capabilityToken: 'x'.repeat(43),
        capability: 'read',
      },
    )

    expect(result).toEqual({
      authorized: false,
      reason: 'invalid-capability',
    })
  })

  it('reports expiry only for a valid capability', async () => {
    const fixture = createFixture()

    fixture.inboxes.inbox = {
      ...activeInbox,
      expiresAtMs: nowMs,
    }

    const result = await authorizeInbox(
      fixture.dependencies,
      {
        inboxId: 'ibx_test',
        capabilityToken: readToken,
        capability: 'read',
      },
    )

    expect(result).toEqual({
      authorized: false,
      reason: 'expired',
    })
  })

  it('reports deletion only for a valid capability', async () => {
    const fixture = createFixture()

    fixture.inboxes.inbox = {
      ...activeInbox,
      deletedAtMs: nowMs - 1,
    }

    const result = await authorizeInbox(
      fixture.dependencies,
      {
        inboxId: 'ibx_test',
        capabilityToken: readToken,
        capability: 'read',
      },
    )

    expect(result).toEqual({
      authorized: false,
      reason: 'deleted',
    })
  })
})