import {
  describe,
  expect,
  it,
} from 'vitest'
import {
  assessCaptureAdmission,
  DEFAULT_INBOX_POLICY,
  type StoredInbox,
} from '../../src/index.js'

const nowMs = 1_750_000_000_000

function createInbox(
  overrides:
    Partial<StoredInbox> = {},
): StoredInbox {
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
    storedRequestCount: 2,
    lifetimeRequestCount: 2,
    nextSequence: 3,
    ...overrides,
  }
}

describe('assessCaptureAdmission', () => {
  it('admits the body limit and advances all counters', () => {
    const result =
      assessCaptureAdmission({
        inbox: createInbox(),
        nowMs,
        bodyByteLength:
          DEFAULT_INBOX_POLICY
            .requestBodyByteLimit,
        policy:
          DEFAULT_INBOX_POLICY,
      })

    expect(result).toMatchObject({
      admitted: true,
      sequence: 3,
      nextInbox: {
        storedRequestCount: 3,
        lifetimeRequestCount: 3,
        nextSequence: 4,
      },
    })
  })

  it('rejects one byte over the limit', () => {
    expect(
      assessCaptureAdmission({
        inbox: createInbox(),
        nowMs,
        bodyByteLength:
          DEFAULT_INBOX_POLICY
            .requestBodyByteLimit + 1,
        policy:
          DEFAULT_INBOX_POLICY,
      }),
    ).toEqual({
      admitted: false,
      reason: 'body-too-large',
    })
  })

  it('rejects an invalid body length', () => {
    expect(
      assessCaptureAdmission({
        inbox: createInbox(),
        nowMs,
        bodyByteLength: -1,
        policy:
          DEFAULT_INBOX_POLICY,
      }),
    ).toEqual({
      admitted: false,
      reason: 'invalid-body-length',
    })
  })

  it('does not reset the lifetime quota after clearing', () => {
    expect(
      assessCaptureAdmission({
        inbox: createInbox({
          storedRequestCount: 0,
          lifetimeRequestCount: 50,
          nextSequence: 51,
        }),
        nowMs,
        bodyByteLength: 10,
        policy:
          DEFAULT_INBOX_POLICY,
      }),
    ).toEqual({
      admitted: false,
      reason: 'inbox-limit-reached',
    })
  })

  it('rejects an expired inbox', () => {
    expect(
      assessCaptureAdmission({
        inbox: createInbox({
          expiresAtMs: nowMs,
        }),
        nowMs,
        bodyByteLength: 10,
        policy:
          DEFAULT_INBOX_POLICY,
      }),
    ).toEqual({
      admitted: false,
      reason: 'inbox-expired',
    })
  })

  it('rejects a deleted inbox', () => {
    expect(
      assessCaptureAdmission({
        inbox: createInbox({
          deletedAtMs: nowMs - 1,
        }),
        nowMs,
        bodyByteLength: 10,
        policy:
          DEFAULT_INBOX_POLICY,
      }),
    ).toEqual({
      admitted: false,
      reason: 'inbox-deleted',
    })
  })

  it('rejects corrupted counter state', () => {
    expect(() =>
      assessCaptureAdmission({
        inbox: createInbox({
          storedRequestCount: 4,
          lifetimeRequestCount: 2,
        }),
        nowMs,
        bodyByteLength: 10,
        policy:
          DEFAULT_INBOX_POLICY,
      }),
    ).toThrow(
      'The inbox state is invalid.',
    )
  })
})