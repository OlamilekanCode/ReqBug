import {
  runInDurableObject,
} from 'cloudflare:test'

import {
  env,
} from 'cloudflare:workers'

import {
  describe,
  expect,
  it,
} from 'vitest'

import type {
  StoredInbox,
} from '@reqbug/core'

import type {
  ReqBugInbox,
} from '../src/inbox-object/reqbug-inbox.js'

import {
  sha256Bytes,
} from '../src/platform/crypto.js'

const nowMs = 1_750_000_000_000

interface CountRow
  extends Record<
    string,
    SqlStorageValue
  > {
  count: number
}

interface LiveTicketRow
  extends Record<
    string,
    SqlStorageValue
  > {
  ticket_hash: ArrayBuffer
  expires_at_ms: number
}

function createInbox(
  inboxId: string,
  overrides:
    Partial<StoredInbox> = {},
): StoredInbox {
  return {
    schemaVersion: 1,
    inboxId,

    ingestTokenHash:
      new Uint8Array(32).fill(1),

    readTokenHash:
      new Uint8Array(32).fill(2),

    createdAtMs: nowMs,

    expiresAtMs:
      nowMs + 60_000,

    deletedAtMs: null,

    storedRequestCount: 0,
    lifetimeRequestCount: 0,
    nextSequence: 1,

    ...overrides,
  }
}

function getInboxStub(
  name: string,
) {
  return env.INBOXES.getByName(
    name,
  )
}

async function liveTicketHash(
  ticket: string,
): Promise<Uint8Array> {
  return sha256Bytes(
    new TextEncoder().encode(ticket),
  )
}

describe('SqliteInboxRepository', () => {
  it('creates and reads an inbox without changing digest bytes', async () => {
    const inbox = createInbox(
      'ibx_round_trip',
    )

    await runInDurableObject(
      getInboxStub('round-trip'),
      async (
        instance: ReqBugInbox,
      ) => {
        await instance.repository
          .create(inbox)

        const stored =
          await instance.repository
            .findById(
              inbox.inboxId,
            )

        expect(stored).toEqual(inbox)

        expect(
          stored?.ingestTokenHash,
        ).not.toBe(
          inbox.ingestTokenHash,
        )

        expect(
          stored?.readTokenHash,
        ).not.toBe(
          inbox.readTokenHash,
        )
      },
    )
  })

  it('rejects a second metadata row in the same object', async () => {
    await runInDurableObject(
      getInboxStub('single-row'),
      async (
        instance: ReqBugInbox,
      ) => {
        await instance.repository
          .create(
            createInbox('ibx_first'),
          )

        await expect(
          instance.repository.create(
            createInbox('ibx_second'),
          ),
        ).rejects.toThrow()
      },
    )
  })

  it('clears stored captures without resetting lifetime usage', async () => {
    await runInDurableObject(
      getInboxStub('clear'),
      async (
        instance: ReqBugInbox,
        state,
      ) => {
        const inbox = createInbox(
          'ibx_clear',
          {
            storedRequestCount: 2,
            lifetimeRequestCount: 5,
            nextSequence: 6,
          },
        )

        await instance.repository
          .create(inbox)

        for (
          const sequence of [1, 2]
        ) {
          state.storage.sql.exec(
            `
              INSERT INTO captured_requests (
                id,
                sequence,
                received_at_ms,
                method,
                path,
                query_json,
                headers_json,
                content_type,
                body,
                body_size,
                body_sha256,
                source_kind,
                source_confidence,
                source_evidence_json,
                delivery_id,
                event_id,
                retry_group_key,
                retry_classification
              ) VALUES (
                ?,
                ?,
                ?,
                'POST',
                '/',
                '[]',
                '[]',
                NULL,
                ?,
                0,
                ?,
                NULL,
                NULL,
                '[]',
                NULL,
                NULL,
                ?,
                'unique'
              )
            `,
            `req_${sequence}`,
            sequence,
            nowMs,
            new ArrayBuffer(0),
            new Uint8Array(32)
              .buffer,
            `unique:req_${sequence}`,
          )
        }

        const result =
          await instance.repository
            .clearRequestsById(
              inbox.inboxId,
            )

        expect(result).toEqual({
          clearedRequestCount: 2,
        })

        const stored =
          await instance.repository
            .findById(
              inbox.inboxId,
            )

        expect(stored).toMatchObject({
          storedRequestCount: 0,
          lifetimeRequestCount: 5,
          nextSequence: 6,
        })

        const requestCount =
          state.storage.sql
            .exec<{
              count: number
            } & Record<
              string,
              SqlStorageValue
            >>(
              `
                SELECT
                  count(*) AS count
                FROM captured_requests
              `,
            )
            .one()

        expect(
          requestCount.count,
        ).toBe(0)
      },
    )
  })

  it('tombstones and then purges object storage', async () => {
    await runInDurableObject(
      getInboxStub('purge'),
      async (
        instance: ReqBugInbox,
      ) => {
        const inbox = createInbox(
          'ibx_purge',
        )

        await instance.repository
          .create(inbox)

        await instance.repository
          .markDeleted({
            inboxId: inbox.inboxId,
            deletedAtMs: nowMs + 1,
          })

        expect(
          await instance.repository
            .findById(
              inbox.inboxId,
            ),
        ).toMatchObject({
          deletedAtMs: nowMs + 1,
        })

        await instance.repository
          .deleteById(
            inbox.inboxId,
          )

        expect(
          await instance.repository
            .findById(
              inbox.inboxId,
            ),
        ).toBeNull()
      },
    )
  })

  it('stores only live-ticket digests and cleans expired rows before enforcing the limit', async () => {
    await runInDurableObject(
      getInboxStub('live-ticket-issue'),
      async (
        instance: ReqBugInbox,
        state,
      ) => {
        const expiredHash =
          await liveTicketHash(
            'e'.repeat(43),
          )

        state.storage.sql.exec(
          `
            INSERT INTO live_tickets (
              ticket_hash,
              expires_at_ms
            ) VALUES (
              ?,
              ?
            )
          `,
          expiredHash.buffer,
          nowMs,
        )

        const rawTicket =
          't'.repeat(43)

        const ticketHash =
          await liveTicketHash(
            rawTicket,
          )

        await expect(
          instance.repository
            .issueLiveTicket({
              ticketHash,
              expiresAtMs:
                nowMs + 30_000,
              nowMs,
              unexpiredLimit: 1,
            }),
        ).resolves.toEqual({
          issued: true,
        })

        await expect(
          instance.repository
            .issueLiveTicket({
              ticketHash:
                await liveTicketHash(
                  'u'.repeat(43),
                ),
              expiresAtMs:
                nowMs + 30_000,
              nowMs,
              unexpiredLimit: 1,
            }),
        ).resolves.toEqual({
          issued: false,
          reason:
            'live-ticket-limit-reached',
        })

        const rows =
          state.storage.sql
            .exec<LiveTicketRow>(
              `
                SELECT
                  ticket_hash,
                  expires_at_ms
                FROM live_tickets
              `,
            )
            .toArray()

        expect(rows).toHaveLength(1)

        expect(
          new Uint8Array(
            rows[0]!.ticket_hash,
          ),
        ).toEqual(ticketHash)

        expect(
          rows[0]!.expires_at_ms,
        ).toBe(nowMs + 30_000)

        expect(
          JSON.stringify(rows),
        ).not.toContain(rawTicket)
      },
    )
  })

  it('consumes a live ticket exactly once and removes expired tickets', async () => {
    await runInDurableObject(
      getInboxStub('live-ticket-consume'),
      async (
        instance: ReqBugInbox,
        state,
      ) => {
        const ticketHash =
          await liveTicketHash(
            'v'.repeat(43),
          )

        await instance.repository
          .issueLiveTicket({
            ticketHash,
            expiresAtMs:
              nowMs + 30_000,
            nowMs,
            unexpiredLimit: 3,
          })

        await expect(
          instance.repository
            .consumeLiveTicket({
              ticketHash,
              nowMs,
            }),
        ).resolves.toEqual({
          consumed: true,
        })

        await expect(
          instance.repository
            .consumeLiveTicket({
              ticketHash,
              nowMs,
            }),
        ).resolves.toEqual({
          consumed: false,
          reason: 'not-found',
        })

        const expiredHash =
          await liveTicketHash(
            'x'.repeat(43),
          )

        await instance.repository
          .issueLiveTicket({
            ticketHash: expiredHash,
            expiresAtMs: nowMs,
            nowMs:
              nowMs - 1,
            unexpiredLimit: 3,
          })

        await expect(
          instance.repository
            .consumeLiveTicket({
              ticketHash:
                expiredHash,
              nowMs,
            }),
        ).resolves.toEqual({
          consumed: false,
          reason: 'expired',
        })

        const count =
          state.storage.sql
            .exec<CountRow>(
              `
                SELECT
                  count(*) AS count
                FROM live_tickets
              `,
            )
            .one()
            .count

        expect(count).toBe(0)
      },
    )
  })

  it('does not allow concurrent live-ticket issuance to exceed the unexpired limit', async () => {
    await runInDurableObject(
      getInboxStub('live-ticket-concurrent'),
      async (
        instance: ReqBugInbox,
        state,
      ) => {
        const results =
          await Promise.all(
            Array.from(
              { length: 10 },
              async (_, index) =>
                instance.repository
                  .issueLiveTicket({
                    ticketHash:
                      await liveTicketHash(
                        `${index}`.repeat(
                          43,
                        ),
                      ),
                    expiresAtMs:
                      nowMs + 30_000,
                    nowMs,
                    unexpiredLimit: 3,
                  }),
            ),
          )

        expect(
          results.filter(
            (result) =>
              result.issued,
          ),
        ).toHaveLength(3)

        expect(
          results.filter(
            (result) =>
              !result.issued,
          ),
        ).toHaveLength(7)

        const count =
          state.storage.sql
            .exec<CountRow>(
              `
                SELECT
                  count(*) AS count
                FROM live_tickets
              `,
            )
            .one()
            .count

        expect(count).toBe(3)
      },
    )
  })
})
