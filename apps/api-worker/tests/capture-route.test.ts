import {
  MAX_CAPTURE_BODY_BYTES,
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
  createTestInbox,
} from './support/api-worker-fixtures.js'

interface CapturedRouteRow
  extends Record<
    string,
    SqlStorageValue
  > {
  id: string
  method: string
  path: string
  query_json: string
  body: ArrayBuffer
  body_size: number
}

interface CountRow
  extends Record<
    string,
    SqlStorageValue
  > {
  count: number
}

function getRequestCount(
  state: DurableObjectState,
): number {
  return state.storage.sql
    .exec<CountRow>(
      `
        SELECT
          count(*) AS count
        FROM captured_requests
      `,
    )
    .one()
    .count
}

describe('webhook capture route', () => {
  it('durably captures exact bytes and removes the routing capability', async () => {
    const inbox =
      await createTestInbox()

    const body =
      new Uint8Array([
        0,
        1,
        127,
        128,
        254,
        255,
      ])

    const response =
      await exports.default.fetch(
        new Request(
          inbox.ingestUrl +
          '/stripe/events' +
          '?mode=test&mode=debug',
          {
            method: 'POST',

            headers: {
              'content-type':
                'application/octet-stream',
            },

            body,
          },
        ),
      )

    expect(response.status).toBe(200)

    expect(
      response.headers.get(
        'cache-control',
      ),
    ).toBe('no-store')

    const result =
      await response.json() as {
        received: boolean
        requestId: string
      }

    expect(result.received).toBe(true)

    expect(result.requestId).toMatch(
      /^whr_[A-Za-z0-9_-]{22}$/u,
    )

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
        const row =
          state.storage.sql
            .exec<CapturedRouteRow>(
              `
                SELECT
                  id,
                  method,
                  path,
                  query_json,
                  body,
                  body_size
                FROM captured_requests
              `,
            )
            .one()

        expect(row.id).toBe(
          result.requestId,
        )

        expect(row.method).toBe('POST')

        expect(row.path).toBe(
          '/stripe/events',
        )

        expect(row.path).not.toContain(
          inbox.inboxId,
        )

        expect(
          row.query_json,
        ).not.toContain(
          new URL(inbox.ingestUrl)
            .pathname
            .split('/')
            .at(-1)!,
        )

        expect(
          JSON.parse(row.query_json),
        ).toEqual([
          {
            name: 'mode',
            value: 'test',
          },
          {
            name: 'mode',
            value: 'debug',
          },
        ])

        expect(
          new Uint8Array(row.body),
        ).toEqual(body)

        expect(row.body_size).toBe(
          body.byteLength,
        )

        expect(
          await instance.repository
            .findById(
              inbox.inboxId,
            ),
        ).toMatchObject({
          storedRequestCount: 1,
          lifetimeRequestCount: 1,
          nextSequence: 2,
        })
      },
    )
  })

  it('returns a generic 404 for an invalid ingest capability', async () => {
    const inbox =
      await createTestInbox()

    const invalidUrl =
      new URL(inbox.ingestUrl)

    const segments =
      invalidUrl.pathname.split('/')

    segments[segments.length - 1] =
      'x'.repeat(43)

    invalidUrl.pathname =
      segments.join('/')

    const response =
      await exports.default.fetch(
        new Request(
          invalidUrl,
          {
            method: 'POST',
            body: 'must not store',
          },
        ),
      )

    expect(response.status).toBe(404)

    expect(
      await response.json(),
    ).toMatchObject({
      error: {
        code: 'NOT_FOUND',
      },
    })

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
        expect(
          getRequestCount(state),
        ).toBe(0)
      },
    )
  })

  it('rejects an oversized body without storing partial bytes', async () => {
    const inbox =
      await createTestInbox()

    const response =
      await exports.default.fetch(
        new Request(
          inbox.ingestUrl,
          {
            method: 'POST',

            body:
              new Uint8Array(
                MAX_CAPTURE_BODY_BYTES + 1,
              ),
          },
        ),
      )

    expect(response.status).toBe(413)

    expect(
      await response.json(),
    ).toMatchObject({
      error: {
        code: 'BODY_TOO_LARGE',
      },
    })

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
        expect(
          getRequestCount(state),
        ).toBe(0)

        expect(
          await instance.repository
            .findById(
              inbox.inboxId,
            ),
        ).toMatchObject({
          storedRequestCount: 0,
          lifetimeRequestCount: 0,
          nextSequence: 1,
        })
      },
    )
  })

  it('rejects unsupported HTTP methods', async () => {
    const inbox =
      await createTestInbox()

    const response =
      await exports.default.fetch(
        new Request(
          inbox.ingestUrl,
          {
            method: 'PROPFIND',
          },
        ),
      )

    expect(response.status).toBe(405)

    expect(
      response.headers.get('allow'),
    ).toBe(
      'GET, HEAD, POST, PUT, PATCH, DELETE, OPTIONS',
    )

    expect(
      await response.json(),
    ).toMatchObject({
      error: {
        code:
          'METHOD_NOT_ALLOWED',
      },
    })
  })

  it('returns 429 when the lifetime quota is exhausted', async () => {
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
            SET
              stored_request_count = 0,
              lifetime_request_count = 50,
              next_sequence = 51
          `,
        )
      },
    )

    const response =
      await exports.default.fetch(
        new Request(
          inbox.ingestUrl,
          {
            method: 'POST',
            body: 'quota test',
          },
        ),
      )

    expect(response.status).toBe(429)

    expect(
      await response.json(),
    ).toMatchObject({
      error: {
        code:
          'INBOX_LIMIT_REACHED',
      },
    })

    await runInDurableObject(
      stub,
      async (
        _instance: ReqBugInbox,
        state,
      ) => {
        expect(
          getRequestCount(state),
        ).toBe(0)
      },
    )
  })

  it('captures HEAD without returning a response body', async () => {
    const inbox =
      await createTestInbox()

    const response =
      await exports.default.fetch(
        new Request(
          `${inbox.ingestUrl}/health`,
          {
            method: 'HEAD',
          },
        ),
      )

    expect(response.status).toBe(200)
    expect(await response.text()).toBe('')

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
        const row =
          state.storage.sql
            .exec<CapturedRouteRow>(
              `
                SELECT
                  id,
                  method,
                  path,
                  query_json,
                  body,
                  body_size
                FROM captured_requests
              `,
            )
            .one()

        expect(row.method).toBe('HEAD')
        expect(row.path).toBe('/health')
        expect(row.body_size).toBe(0)
      },
    )
  })
})
