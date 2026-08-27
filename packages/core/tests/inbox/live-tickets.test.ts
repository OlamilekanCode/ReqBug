import {
  describe,
  expect,
  it,
} from 'vitest'
import {
  consumeLiveTicket,
  DEFAULT_INBOX_POLICY,
  issueLiveTicket,
  type InboxRepository,
  type LiveTicketRepository,
  type StoredInbox,
  type TokenDigestService,
} from '../../src/index.js'

const nowMs = 1_750_000_000_000
const inboxId = 'ibx_live'
const readToken = 'r'.repeat(43)
const ingestToken = 'i'.repeat(43)
const liveTicket = 't'.repeat(43)

function digestFor(
  token: string,
): Uint8Array {
  return new Uint8Array(32).fill(
    token.charCodeAt(0),
  )
}

function digestKey(
  digest: Uint8Array,
): string {
  return Array.from(digest).join(',')
}

class FakeTokenDigests
  implements TokenDigestService {
  async digest(
    token: string,
  ): Promise<Uint8Array> {
    return digestFor(token)
  }

  async verify(
    token: string,
    expectedDigest: Uint8Array,
  ): Promise<boolean> {
    const actualDigest =
      await this.digest(token)

    return digestKey(actualDigest) ===
      digestKey(expectedDigest)
  }
}

class FakeInboxRepository
  implements InboxRepository {
  inbox: StoredInbox | null = {
    schemaVersion: 1,
    inboxId,
    ingestTokenHash:
      digestFor(ingestToken),
    readTokenHash:
      digestFor(readToken),
    createdAtMs: nowMs,
    expiresAtMs:
      nowMs + 60_000,
    deletedAtMs: null,
    storedRequestCount: 0,
    lifetimeRequestCount: 0,
    nextSequence: 1,
  }

  async create(): Promise<void> {}

  async findById(
    requestedInboxId: string,
  ): Promise<StoredInbox | null> {
    return requestedInboxId === inboxId
      ? this.inbox
      : null
  }

  async deleteById(): Promise<void> {
    this.inbox = null
  }
}

class FakeLiveTicketRepository
  implements LiveTicketRepository {
  issueInputs: Array<{
    ticketHash: Uint8Array
    expiresAtMs: number
    nowMs: number
    unexpiredLimit: number
  }> = []

  stored = new Map<
    string,
    number
  >()

  limitReached = false

  async issueLiveTicket(
    input: {
      readonly ticketHash: Uint8Array
      readonly expiresAtMs: number
      readonly nowMs: number
      readonly unexpiredLimit: number
    },
  ) {
    this.issueInputs.push({
      ticketHash:
        input.ticketHash.slice(),
      expiresAtMs:
        input.expiresAtMs,
      nowMs:
        input.nowMs,
      unexpiredLimit:
        input.unexpiredLimit,
    })

    if (this.limitReached) {
      return {
        issued: false as const,
        reason:
          'live-ticket-limit-reached' as const,
      }
    }

    this.stored.set(
      digestKey(input.ticketHash),
      input.expiresAtMs,
    )

    return {
      issued: true as const,
    }
  }

  async consumeLiveTicket(
    input: {
      readonly ticketHash: Uint8Array
      readonly nowMs: number
    },
  ) {
    const key =
      digestKey(input.ticketHash)

    const expiresAtMs =
      this.stored.get(key)

    if (expiresAtMs === undefined) {
      return {
        consumed: false as const,
        reason: 'not-found' as const,
      }
    }

    this.stored.delete(key)

    if (expiresAtMs <= input.nowMs) {
      return {
        consumed: false as const,
        reason: 'expired' as const,
      }
    }

    return {
      consumed: true as const,
    }
  }
}

function createFixture() {
  const inboxes =
    new FakeInboxRepository()

  const liveTickets =
    new FakeLiveTicketRepository()

  const tokenDigests =
    new FakeTokenDigests()

  let generatedTicketCount = 0

  return {
    inboxes,
    liveTickets,
    dependencies: {
      clock: {
        nowMilliseconds: () => nowMs,
      },
      values: {
        generateInboxId: () => inboxId,
        generateCapabilityToken: () => {
          generatedTicketCount += 1
          return liveTicket
        },
      },
      tokenDigests,
      inboxes,
      liveTickets,
      policy: DEFAULT_INBOX_POLICY,
    },
    getGeneratedTicketCount: () =>
      generatedTicketCount,
  }
}

describe('live tickets', () => {
  it('issues a deterministic opaque ticket after read authorization', async () => {
    const fixture = createFixture()

    const result =
      await issueLiveTicket(
        fixture.dependencies,
        {
          inboxId,
          readToken,
        },
      )

    expect(result).toEqual({
      issued: true,
      ticket: liveTicket,
      expiresAtMs:
        nowMs +
        DEFAULT_INBOX_POLICY
          .liveTicketLifetimeMilliseconds,
    })

    expect(
      fixture.liveTickets.issueInputs,
    ).toEqual([
      {
        ticketHash:
          digestFor(liveTicket),
        expiresAtMs:
          nowMs +
          DEFAULT_INBOX_POLICY
            .liveTicketLifetimeMilliseconds,
        nowMs,
        unexpiredLimit:
          DEFAULT_INBOX_POLICY
            .liveConnectionLimit,
      },
    ])
  })

  it('does not generate or store a ticket without read authorization', async () => {
    const fixture = createFixture()

    const result =
      await issueLiveTicket(
        fixture.dependencies,
        {
          inboxId,
          readToken:
            ingestToken,
        },
      )

    expect(result).toEqual({
      issued: false,
      reason: 'invalid-capability',
    })

    expect(
      fixture.getGeneratedTicketCount(),
    ).toBe(0)

    expect(
      fixture.liveTickets.issueInputs,
    ).toEqual([])
  })

  it('returns the live-ticket limit failure without exposing a generated ticket', async () => {
    const fixture = createFixture()
    fixture.liveTickets.limitReached = true

    const result =
      await issueLiveTicket(
        fixture.dependencies,
        {
          inboxId,
          readToken,
        },
      )

    expect(result).toEqual({
      issued: false,
      reason:
        'live-ticket-limit-reached',
    })
  })

  it('consumes a ticket exactly once', async () => {
    const fixture = createFixture()

    await issueLiveTicket(
      fixture.dependencies,
      {
        inboxId,
        readToken,
      },
    )

    await expect(
      consumeLiveTicket(
        fixture.dependencies,
        {
          inboxId,
          ticket: liveTicket,
        },
      ),
    ).resolves.toEqual({
      consumed: true,
    })

    await expect(
      consumeLiveTicket(
        fixture.dependencies,
        {
          inboxId,
          ticket: liveTicket,
        },
      ),
    ).resolves.toEqual({
      consumed: false,
      reason: 'not-found',
    })
  })

  it('rejects malformed and expired tickets safely', async () => {
    const fixture = createFixture()

    await expect(
      consumeLiveTicket(
        fixture.dependencies,
        {
          inboxId,
          ticket: 'short',
        },
      ),
    ).resolves.toEqual({
      consumed: false,
      reason: 'invalid-ticket',
    })

    fixture.liveTickets.stored.set(
      digestKey(
        digestFor(liveTicket),
      ),
      nowMs,
    )

    await expect(
      consumeLiveTicket(
        fixture.dependencies,
        {
          inboxId,
          ticket: liveTicket,
        },
      ),
    ).resolves.toEqual({
      consumed: false,
      reason: 'expired',
    })
  })
})
