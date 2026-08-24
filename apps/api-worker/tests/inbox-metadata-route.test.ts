import {
  ApiErrorResponseSchema,
  CreateInboxResponseSchema,
  InboxMetadataResponseSchema,
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

async function createTestInbox() {
  const response =
    await exports.default.fetch(
      new Request(
        'https://reqbug.test/api/v1/inboxes',
        {
          method: 'POST',
        },
      ),
    )

  expect(response.status).toBe(201)

  return CreateInboxResponseSchema
    .parse(
      await response.json(),
    )
    .data
}

function metadataUrl(
  inboxId: string,
): string {
  return (
    'https://reqbug.test' +
    `/api/v1/inboxes/${inboxId}`
  )
}

function metadataRequest(
  inboxId: string,
  readToken?: string,
): Request {
  return new Request(
    metadataUrl(inboxId),
    {
      headers:
        readToken === undefined
          ? undefined
          : {
              Authorization:
                `Bearer ${readToken}`,
            },
    },
  )
}

describe('GET /api/v1/inboxes/:inboxId', () => {
  it('returns metadata for the read capability', async () => {
    const inbox =
      await createTestInbox()

    const response =
      await exports.default.fetch(
        metadataRequest(
          inbox.inboxId,
          inbox.readToken,
        ),
      )

    expect(response.status).toBe(200)

    expect(
      response.headers.get(
        'cache-control',
      ),
    ).toBe('no-store')

    expect(
      response.headers.get(
        'referrer-policy',
      ),
    ).toBe('no-referrer')

    const result =
      InboxMetadataResponseSchema.parse(
        await response.json(),
      )

    expect(result.data).toEqual({
      inboxId:
        inbox.inboxId,

      createdAt:
        inbox.createdAt,

      expiresAt:
        inbox.expiresAt,

      status: 'active',

      storedRequestCount: 0,
      lifetimeRequestCount: 0,
      requestLimit: 50,
      bodyByteLimit: 262144,
    })
  })

  it('returns a generic 404 when authorization is missing', async () => {
    const inbox =
      await createTestInbox()

    const response =
      await exports.default.fetch(
        metadataRequest(inbox.inboxId),
      )

    expect(response.status).toBe(404)

    expect(
      ApiErrorResponseSchema.parse(
        await response.json(),
      ).error.code,
    ).toBe('NOT_FOUND')
  })

  it('does not accept the read capability from the query string', async () => {
    const inbox =
      await createTestInbox()

    const response =
      await exports.default.fetch(
        new Request(
          metadataUrl(inbox.inboxId) +
          `?access=${inbox.readToken}`,
        ),
      )

    expect(response.status).toBe(404)

    expect(
      ApiErrorResponseSchema.parse(
        await response.json(),
      ).error.code,
    ).toBe('NOT_FOUND')
  })

  it('returns a generic 404 for an invalid read capability', async () => {
    const inbox =
      await createTestInbox()

    const response =
      await exports.default.fetch(
        metadataRequest(
          inbox.inboxId,
          'x'.repeat(43),
        ),
      )

    expect(response.status).toBe(404)

    expect(
      ApiErrorResponseSchema.parse(
        await response.json(),
      ).error.code,
    ).toBe('NOT_FOUND')
  })

  it('does not authorize the ingest capability for reading', async () => {
    const inbox =
      await createTestInbox()

    const ingestToken =
      new URL(inbox.ingestUrl)
        .pathname
        .split('/')
        .at(-1)

    if (ingestToken === undefined) {
      throw new Error(
        'The ingest token was not found.',
      )
    }

    const response =
      await exports.default.fetch(
        metadataRequest(
          inbox.inboxId,
          ingestToken,
        ),
      )

    expect(response.status).toBe(404)
  })

  it('returns 410 for an expired inbox', async () => {
    const inbox =
      await createTestInbox()

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
        const nowMs = Date.now()

        state.storage.sql.exec(
          `
            UPDATE inbox_meta
            SET
              created_at_ms = ?,
              expires_at_ms = ?
          `,
          nowMs - 2_000,
          nowMs - 1_000,
        )
      },
    )

    const response =
      await exports.default.fetch(
        metadataRequest(
          inbox.inboxId,
          inbox.readToken,
        ),
      )

    expect(response.status).toBe(410)

    expect(
      ApiErrorResponseSchema.parse(
        await response.json(),
      ).error.code,
    ).toBe('INBOX_GONE')
  })

  it('returns 410 for a deleted inbox', async () => {
    const inbox =
      await createTestInbox()

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
            UPDATE inbox_meta
            SET deleted_at_ms = ?
          `,
          Date.now(),
        )
      },
    )

    const response =
      await exports.default.fetch(
        metadataRequest(
          inbox.inboxId,
          inbox.readToken,
        ),
      )

    expect(response.status).toBe(410)

    expect(
      ApiErrorResponseSchema.parse(
        await response.json(),
      ).error.code,
    ).toBe('INBOX_GONE')
  })
})