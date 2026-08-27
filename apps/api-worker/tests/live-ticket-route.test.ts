import {
  ApiErrorResponseSchema,
  LIVE_TICKET_LIFETIME_SECONDS,
  LiveTicketResponseSchema,
} from '@reqbug/contracts'

import {
  runInDurableObject,
} from 'cloudflare:test'

import {
  env,
  exports,
} from 'cloudflare:workers'

import {
  describe,
  expect,
  it,
} from 'vitest'

import type {
  ReqBugInbox,
} from '../src/inbox-object/reqbug-inbox.js'

import {
  sha256Bytes,
} from '../src/platform/crypto.js'

import {
  createTestInbox,
} from './support/api-worker-fixtures.js'

interface LiveTicketRow
  extends Record<
    string,
    SqlStorageValue
  > {
  ticket_hash: ArrayBuffer
  expires_at_ms: number
}

interface CountRow
  extends Record<
    string,
    SqlStorageValue
  > {
  count: number
}

function liveTicketUrl(
  inboxId: string,
  query = '',
): string {
  return 'https://reqbug.test' +
    `/api/v1/inboxes/${inboxId}` +
    `/live-tickets${query}`
}

function liveTicketRequest(
  inboxId: string,
  authorization?: string,
  query = '',
): Request {
  return new Request(
    liveTicketUrl(inboxId, query),
    {
      method: 'POST',

      headers:
        authorization === undefined
          ? undefined
          : {
              Authorization:
                authorization,
            },
    },
  )
}

function bearer(
  token: string,
): string {
  return `Bearer ${token}`
}

async function ticketHash(
  ticket: string,
): Promise<Uint8Array> {
  return sha256Bytes(
    new TextEncoder().encode(ticket),
  )
}

async function issueTicket(
  inboxId: string,
  readToken: string,
) {
  const response =
    await exports.default.fetch(
      liveTicketRequest(
        inboxId,
        bearer(readToken),
      ),
    )

  expect(response.status).toBe(201)

  return LiveTicketResponseSchema
    .parse(
      await response.json(),
    )
    .data
}

async function expectGenericNotFound(
  response: Response,
): Promise<string> {
  expect(response.status).toBe(404)

  const body =
    await response.text()

  expect(
    ApiErrorResponseSchema.parse(
      JSON.parse(body),
    ).error.code,
  ).toBe('NOT_FOUND')

  return body
}

describe('POST /api/v1/inboxes/:inboxId/live-tickets', () => {
  it('issues a contract-valid ticket and stores only its digest', async () => {
    const inbox =
      await createTestInbox()

    const beforeMs = Date.now()

    const response =
      await exports.default.fetch(
        liveTicketRequest(
          inbox.inboxId,
          bearer(inbox.readToken),
        ),
      )

    const afterMs = Date.now()

    expect(response.status).toBe(201)

    const data =
      LiveTicketResponseSchema.parse(
        await response.json(),
      ).data

    const expiresAtMs =
      Date.parse(data.expiresAt)

    expect(
      Number.isNaN(expiresAtMs),
    ).toBe(false)

    expect(expiresAtMs).toBeGreaterThan(
      beforeMs,
    )

    expect(
      expiresAtMs - afterMs,
    ).toBeLessThanOrEqual(
      LIVE_TICKET_LIFETIME_SECONDS *
        1000,
    )

    const expectedHash =
      await ticketHash(data.ticket)

    const stub =
      env.INBOXES.getByName(
        inbox.inboxId,
      )

    await runInDurableObject(
      stub,
      async (
        instance: ReqBugInbox,
        state,
      ) => {
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
        ).toEqual(expectedHash)

        expect(
          rows[0]!.expires_at_ms,
        ).toBe(expiresAtMs)

        expect(
          JSON.stringify(rows),
        ).not.toContain(data.ticket)

        await expect(
          instance.consumeLiveTicket({
            inboxId:
              inbox.inboxId,
            ticket:
              data.ticket,
          }),
        ).resolves.toEqual({
          consumed: true,
        })

        await expect(
          instance.consumeLiveTicket({
            inboxId:
              inbox.inboxId,
            ticket:
              data.ticket,
          }),
        ).resolves.toEqual({
          consumed: false,
          reason: 'not-found',
        })

        await expect(
          instance.consumeLiveTicket({
            inboxId:
              inbox.inboxId,
            ticket: 'short',
          }),
        ).resolves.toEqual({
          consumed: false,
          reason: 'invalid-ticket',
        })
      },
    )
  })

  it('requires the read bearer capability', async () => {
    const inbox =
      await createTestInbox()

    const otherInbox =
      await createTestInbox()

    const invalidToken =
      'x'.repeat(43)

    const ingestToken =
      new URL(
        inbox.ingestUrl,
      ).pathname
        .split('/')
        .at(-1)!

    const responses = [
      await exports.default.fetch(
        liveTicketRequest(inbox.inboxId),
      ),
      await exports.default.fetch(
        liveTicketRequest(
          inbox.inboxId,
          'Bearer short',
        ),
      ),
      await exports.default.fetch(
        liveTicketRequest(
          inbox.inboxId,
          bearer(invalidToken),
        ),
      ),
      await exports.default.fetch(
        liveTicketRequest(
          inbox.inboxId,
          bearer(ingestToken),
        ),
      ),
      await exports.default.fetch(
        liveTicketRequest(
          inbox.inboxId,
          bearer(otherInbox.readToken),
        ),
      ),
      await exports.default.fetch(
        liveTicketRequest(
          inbox.inboxId,
          undefined,
          `?access=${inbox.readToken}`,
        ),
      ),
      await exports.default.fetch(
        liveTicketRequest(
          'ibx_missing',
          bearer(inbox.readToken),
        ),
      ),
    ]

    for (const response of responses) {
      const body =
        await expectGenericNotFound(
          response,
        )

      expect(body).not.toContain(
        inbox.readToken,
      )

      expect(body).not.toContain(
        ingestToken,
      )
    }
  })

  it('rejects expired and deleted inboxes', async () => {
    const expiredInbox =
      await createTestInbox()

    const expiredStub =
      env.INBOXES.getByName(
        expiredInbox.inboxId,
      )

    await runInDurableObject(
      expiredStub,
      async (
        _instance: ReqBugInbox,
        state,
      ) => {
        const expiresAtMs =
          Date.now() - 1_000

        state.storage.sql.exec(
          `
            UPDATE inbox_meta
            SET
              created_at_ms = ?,
              expires_at_ms = ?
            WHERE singleton_id = 1
          `,
          expiresAtMs - 1_000,
          expiresAtMs,
        )
      },
    )

    const expiredResponse =
      await exports.default.fetch(
        liveTicketRequest(
          expiredInbox.inboxId,
          bearer(expiredInbox.readToken),
        ),
      )

    expect(expiredResponse.status).toBe(410)

    expect(
      ApiErrorResponseSchema.parse(
        await expiredResponse.json(),
      ).error.code,
    ).toBe('INBOX_GONE')

    const deletedInbox =
      await createTestInbox()

    const deleteResponse =
      await exports.default.fetch(
        new Request(
          'https://reqbug.test' +
            `/api/v1/inboxes/` +
            `${deletedInbox.inboxId}`,
          {
            method: 'DELETE',
            headers: {
              Authorization:
                bearer(
                  deletedInbox.readToken,
                ),
            },
          },
        ),
      )

    expect(deleteResponse.status).toBe(204)

    await expectGenericNotFound(
      await exports.default.fetch(
        liveTicketRequest(
          deletedInbox.inboxId,
          bearer(deletedInbox.readToken),
        ),
      ),
    )
  })

  it('limits unexpired tickets and removes expired rows before enforcing the limit', async () => {
    const inbox =
      await createTestInbox()

    const tickets = []

    for (let index = 0; index < 3; index += 1) {
      tickets.push(
        await issueTicket(
          inbox.inboxId,
          inbox.readToken,
        ),
      )
    }

    const fourthResponse =
      await exports.default.fetch(
        liveTicketRequest(
          inbox.inboxId,
          bearer(inbox.readToken),
        ),
      )

    expect(fourthResponse.status).toBe(429)

    const fourthBody =
      await fourthResponse.text()

    expect(
      ApiErrorResponseSchema.parse(
        JSON.parse(fourthBody),
      ).error.code,
    ).toBe(
      'LIVE_TICKET_LIMIT_REACHED',
    )

    for (const ticket of tickets) {
      expect(fourthBody).not.toContain(
        ticket.ticket,
      )
    }

    const stub =
      env.INBOXES.getByName(
        inbox.inboxId,
      )

    await runInDurableObject(
      stub,
      async (
        _instance: ReqBugInbox,
        state,
      ) => {
        state.storage.sql.exec(
          `
            UPDATE live_tickets
            SET expires_at_ms = ?
          `,
          Date.now() - 1_000,
        )
      },
    )

    await issueTicket(
      inbox.inboxId,
      inbox.readToken,
    )

    await runInDurableObject(
      stub,
      async (
        _instance: ReqBugInbox,
        state,
      ) => {
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

        expect(count).toBe(1)
      },
    )
  })

  it('does not allow concurrent issuance to bypass the unexpired-ticket limit', async () => {
    const inbox =
      await createTestInbox()

    const responses =
      await Promise.all(
        Array.from(
          { length: 10 },
          async () =>
            exports.default.fetch(
              liveTicketRequest(
                inbox.inboxId,
                bearer(inbox.readToken),
              ),
            ),
        ),
      )

    expect(
      responses.filter(
        (response) =>
          response.status === 201,
      ),
    ).toHaveLength(3)

    expect(
      responses.filter(
        (response) =>
          response.status === 429,
      ),
    ).toHaveLength(7)

    const stub =
      env.INBOXES.getByName(
        inbox.inboxId,
      )

    await runInDurableObject(
      stub,
      async (
        _instance: ReqBugInbox,
        state,
      ) => {
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
