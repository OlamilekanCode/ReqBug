import {
  describe,
  expect,
  it,
} from 'vitest'
import {
  clearInboxRequests,
  deleteInbox,
  expireInbox,
  type ExpiryScheduler,
  type InboxLifecycleNotifier,
  type InboxLifecycleRepository,
  type StoredInbox,
  type TokenDigestService,
} from '../../src/index.js'

const nowMs = 1_750_000_000_000
const readToken = 'r'.repeat(43)

function createActiveInbox(): StoredInbox {
  return {
    schemaVersion: 1,
    inboxId: 'ibx_test',
    ingestTokenHash:
      new Uint8Array(32).fill(1),
    readTokenHash:
      new Uint8Array(32).fill(2),
    createdAtMs: nowMs - 1_000,
    expiresAtMs: nowMs + 60_000,
    deletedAtMs: null,
    storedRequestCount: 3,
    lifetimeRequestCount: 5,
    nextSequence: 6,
  }
}

class FakeRepository
  implements InboxLifecycleRepository
{
  inbox: StoredInbox | null =
    createActiveInbox()

  calls: string[] = []
  failPurge = false

  async create(
    inbox: StoredInbox,
  ): Promise<void> {
    this.inbox = inbox
  }

  async findById(): Promise<StoredInbox | null> {
    return this.inbox
  }

  async clearRequestsById(): Promise<{
    clearedRequestCount: number
  }> {
    const clearedRequestCount =
      this.inbox?.storedRequestCount ?? 0

    if (this.inbox !== null) {
      this.inbox = {
        ...this.inbox,
        storedRequestCount: 0,
      }
    }

    this.calls.push('clear')

    return {
      clearedRequestCount,
    }
  }

  async markDeleted({
    deletedAtMs,
  }: {
    inboxId: string
    deletedAtMs: number
  }): Promise<void> {
    if (this.inbox !== null) {
      this.inbox = {
        ...this.inbox,
        deletedAtMs,
      }
    }

    this.calls.push('mark')
  }

  async deleteById(): Promise<void> {
    this.calls.push('purge')

    if (this.failPurge) {
      throw new Error('purge failed')
    }

    this.inbox = null
  }
}

class FakeNotifier
  implements InboxLifecycleNotifier
{
  calls: string[]
  failClear = false
  failTermination = false

  constructor(calls: string[]) {
    this.calls = calls
  }

  async publishInboxCleared(): Promise<void> {
    this.calls.push('notify-clear')

    if (this.failClear) {
      throw new Error('notification failed')
    }
  }

  async terminateInbox(): Promise<void> {
    this.calls.push('terminate')

    if (this.failTermination) {
      throw new Error('termination failed')
    }
  }
}

class FakeExpiry
  implements ExpiryScheduler
{
  scheduled: number[] = []

  async scheduleInboxExpiry({
    expiresAtMs,
  }: {
    inboxId: string
    expiresAtMs: number
  }): Promise<void> {
    this.scheduled.push(expiresAtMs)
  }
}

class FakeDigests
  implements TokenDigestService
{
  async digest(): Promise<Uint8Array> {
    return new Uint8Array(32)
  }

  async verify(
    token: string,
    expected: Uint8Array,
  ): Promise<boolean> {
    return (
      token === readToken &&
      expected[0] === 2
    )
  }
}

function createFixture() {
  const inboxes = new FakeRepository()
  const notifier =
    new FakeNotifier(inboxes.calls)
  const expiry = new FakeExpiry()

  return {
    inboxes,
    notifier,
    expiry,
    dependencies: {
      clock: {
        nowMilliseconds: () => nowMs,
      },
      tokenDigests:
        new FakeDigests(),
      inboxes,
      notifier,
      expiry,
    },
  }
}

describe('clearInboxRequests', () => {
  it('clears stored requests without resetting lifetime usage', async () => {
    const fixture = createFixture()

    const result =
      await clearInboxRequests(
        fixture.dependencies,
        {
          inboxId: 'ibx_test',
          readToken,
        },
      )

    expect(result).toMatchObject({
      cleared: true,
      clearedRequestCount: 3,
    })

    expect(
      fixture.inboxes.inbox,
    ).toMatchObject({
      storedRequestCount: 0,
      lifetimeRequestCount: 5,
      nextSequence: 6,
    })
  })

  it('does not clear without authorization', async () => {
    const fixture = createFixture()

    const result =
      await clearInboxRequests(
        fixture.dependencies,
        {
          inboxId: 'ibx_test',
          readToken: 'x'.repeat(43),
        },
      )

    expect(result).toEqual({
      cleared: false,
      reason: 'invalid-capability',
    })

    expect(
      fixture.inboxes.calls,
    ).toEqual([])
  })

  it('keeps clearing successful when live notification fails', async () => {
    const fixture = createFixture()

    fixture.notifier.failClear = true

    const result =
      await clearInboxRequests(
        fixture.dependencies,
        {
          inboxId: 'ibx_test',
          readToken,
        },
      )

    expect(result).toMatchObject({
      cleared: true,
      liveNotificationDelivered: false,
    })
  })
})

describe('deleteInbox', () => {
  it('tombstones, terminates and purges in order', async () => {
    const fixture = createFixture()

    const result = await deleteInbox(
      fixture.dependencies,
      {
        inboxId: 'ibx_test',
        readToken,
      },
    )

    expect(result).toMatchObject({
      deleted: true,
      liveTerminationDelivered: true,
      storagePurged: true,
    })

    expect(
      fixture.inboxes.calls,
    ).toEqual([
      'mark',
      'terminate',
      'purge',
    ])
  })

  it('does not delete without authorization', async () => {
    const fixture = createFixture()

    const result = await deleteInbox(
      fixture.dependencies,
      {
        inboxId: 'ibx_test',
        readToken: 'x'.repeat(43),
      },
    )

    expect(result).toEqual({
      deleted: false,
      reason: 'invalid-capability',
    })
  })

  it('keeps logical deletion successful when cleanup fails', async () => {
    const fixture = createFixture()

    fixture.notifier.failTermination =
      true

    fixture.inboxes.failPurge = true

    const result = await deleteInbox(
      fixture.dependencies,
      {
        inboxId: 'ibx_test',
        readToken,
      },
    )

    expect(result).toMatchObject({
      deleted: true,
      liveTerminationDelivered: false,
      storagePurged: false,
    })

    expect(
      fixture.inboxes.inbox?.deletedAtMs,
    ).toBe(nowMs)
  })
})

describe('expireInbox', () => {
  it('reschedules an early expiry alarm', async () => {
    const fixture = createFixture()

    const result = await expireInbox(
      fixture.dependencies,
      'ibx_test',
    )

    expect(result).toEqual({
      expired: false,
      reason: 'not-due',
      rescheduled: true,
    })

    expect(
      fixture.expiry.scheduled,
    ).toEqual([nowMs + 60_000])
  })

  it('expires and purges a due inbox', async () => {
    const fixture = createFixture()

    fixture.inboxes.inbox = {
      ...createActiveInbox(),
      expiresAtMs: nowMs,
    }

    const result = await expireInbox(
      fixture.dependencies,
      'ibx_test',
    )

    expect(result).toMatchObject({
      expired: true,
      expiredAtMs: nowMs,
      storagePurged: true,
    })

    expect(
      fixture.inboxes.calls,
    ).toEqual([
      'mark',
      'terminate',
      'purge',
    ])
  })

  it('ignores an unknown inbox', async () => {
    const fixture = createFixture()

    fixture.inboxes.inbox = null

    expect(
      await expireInbox(
        fixture.dependencies,
        'unknown',
      ),
    ).toEqual({
      expired: false,
      reason: 'not-found',
      rescheduled: false,
    })
  })

  it('does not expire an explicitly deleted inbox', async () => {
    const fixture = createFixture()

    fixture.inboxes.inbox = {
      ...createActiveInbox(),
      deletedAtMs: nowMs - 1,
    }

    expect(
      await expireInbox(
        fixture.dependencies,
        'ibx_test',
      ),
    ).toEqual({
      expired: false,
      reason: 'deleted',
      rescheduled: false,
    })
  })
})