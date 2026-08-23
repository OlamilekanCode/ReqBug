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
  ReqBugInbox,
} from '../src/inbox-object/reqbug-inbox.js'

import {
  sha256Bytes,
} from '../src/platform/crypto.js'

interface CapturedRequestRow
  extends Record<
    string,
    SqlStorageValue
  > {
  id: string
  sequence: number
  method: string
  path: string
  query_json: string
  headers_json: string
  body: ArrayBuffer
  body_size: number
  body_sha256: ArrayBuffer
  retry_group_key: string
  retry_classification: string
}

interface CountRow
  extends Record<
    string,
    SqlStorageValue
  > {
  count: number
}

const ingestToken = 'i'.repeat(43)
const readToken = 'r'.repeat(43)

function createCapture(
  body =
    new Uint8Array([
      0,
      1,
      127,
      128,
      255,
    ]),
) {
  return {
    method: 'POST' as const,
    path: '/events',

    query: [
      {
        name: 'mode',
        value: 'test',
      },
    ],

    headers: [
      {
        name: 'content-type',
        value: 'application/json',
      },
    ],

    contentType:
      'application/json',

    body,
  }
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

describe('ReqBugInbox capture storage', () => {
  it('authorizes and stores exact request bytes', async () => {
    const inboxId =
      'capture-storage'

    const stub =
      env.INBOXES.getByName(
        inboxId,
      )

    await runInDurableObject(
      stub,
      async (
        instance: ReqBugInbox,
        state,
      ) => {
        await instance.initializeInbox({
          inboxId,
          ingestToken,
          readToken,
        })

        const capture =
          createCapture()

        const result =
          await instance.captureWebhook({
            inboxId,
            ingestToken,
            capture,
          })

        expect(result).toMatchObject({
          captured: true,
          sequence: 1,
        })

        if (!result.captured) {
          throw new Error(
            'Capture was unexpectedly rejected.',
          )
        }

        const row =
          state.storage.sql
            .exec<CapturedRequestRow>(
              `
                SELECT
                  id,
                  sequence,
                  method,
                  path,
                  query_json,
                  headers_json,
                  body,
                  body_size,
                  body_sha256,
                  retry_group_key,
                  retry_classification
                FROM captured_requests
              `,
            )
            .one()

        expect(row.id).toBe(
          result.requestId,
        )

        expect(row.sequence).toBe(1)
        expect(row.method).toBe('POST')
        expect(row.path).toBe('/events')

        expect(
          JSON.parse(row.query_json),
        ).toEqual(capture.query)

        expect(
          JSON.parse(row.headers_json),
        ).toEqual(capture.headers)

        expect(
          new Uint8Array(row.body),
        ).toEqual(capture.body)

        expect(row.body_size).toBe(
          capture.body.byteLength,
        )

        expect(
          new Uint8Array(
            row.body_sha256,
          ),
        ).toEqual(
          await sha256Bytes(
            capture.body,
          ),
        )

        expect(
          row.retry_group_key,
        ).toMatch(
          /^fingerprint:[A-Za-z0-9_-]{43}$/u,
        )

        expect(
          row.retry_classification,
        ).toBe('unique')

        expect(
          await instance.repository
            .findById(inboxId),
        ).toMatchObject({
          storedRequestCount: 1,
          lifetimeRequestCount: 1,
          nextSequence: 2,
        })
      },
    )
  })

  it('rejects an invalid ingest capability without storing', async () => {
    const inboxId =
      'capture-wrong-token'

    const stub =
      env.INBOXES.getByName(
        inboxId,
      )

    await runInDurableObject(
      stub,
      async (
        instance: ReqBugInbox,
        state,
      ) => {
        await instance.initializeInbox({
          inboxId,
          ingestToken,
          readToken,
        })

        const result =
          await instance.captureWebhook({
            inboxId,
            ingestToken:
              'x'.repeat(43),
            capture:
              createCapture(),
          })

        expect(result).toEqual({
          captured: false,
          reason:
            'invalid-capability',
        })

        expect(
          getRequestCount(state),
        ).toBe(0)

        expect(
          await instance.repository
            .findById(inboxId),
        ).toMatchObject({
          storedRequestCount: 0,
          lifetimeRequestCount: 0,
          nextSequence: 1,
        })
      },
    )
  })

  it('enforces the lifetime quota without storing', async () => {
    const inboxId =
      'capture-full-inbox'

    const stub =
      env.INBOXES.getByName(
        inboxId,
      )

    await runInDurableObject(
      stub,
      async (
        instance: ReqBugInbox,
        state,
      ) => {
        await instance.initializeInbox({
          inboxId,
          ingestToken,
          readToken,
        })

        state.storage.sql.exec(
          `
            UPDATE inbox_meta
            SET
              stored_request_count = 0,
              lifetime_request_count = 50,
              next_sequence = 51
          `,
        )

        const result =
          await instance.captureWebhook({
            inboxId,
            ingestToken,
            capture:
              createCapture(),
          })

        expect(result).toEqual({
          captured: false,
          reason:
            'inbox-limit-reached',
        })

        expect(
          getRequestCount(state),
        ).toBe(0)

        expect(
          await instance.repository
            .findById(inboxId),
        ).toMatchObject({
          storedRequestCount: 0,
          lifetimeRequestCount: 50,
          nextSequence: 51,
        })
      },
    )
  })

  it('rolls back counters when insertion fails', async () => {
    const inboxId =
      'capture-rollback'

    const stub =
      env.INBOXES.getByName(
        inboxId,
      )

    await runInDurableObject(
      stub,
      async (
        instance: ReqBugInbox,
        state,
      ) => {
        await instance.initializeInbox({
          inboxId,
          ingestToken,
          readToken,
        })

        const inbox =
          await instance.repository
            .findById(inboxId)

        if (inbox === null) {
          throw new Error(
            'Inbox was not created.',
          )
        }

        const input = {
          inboxId,
          id: 'whr_duplicate',
          receivedAtMs:
            inbox.createdAtMs + 1,
          method: 'POST' as const,
          path: '/',
          query: [],
          headers: [],
          contentType: null,
          body:
            new Uint8Array(),
          bodySha256:
            new Uint8Array(32),
          retryGroupKey:
            'fingerprint:test',
        }

        await expect(
          instance.repository
            .insertCapture(input),
        ).resolves.toMatchObject({
          stored: true,
          sequence: 1,
        })

        await expect(
          instance.repository
            .insertCapture(input),
        ).rejects.toThrow()

        expect(
          getRequestCount(state),
        ).toBe(1)

        expect(
          await instance.repository
            .findById(inboxId),
        ).toMatchObject({
          storedRequestCount: 1,
          lifetimeRequestCount: 1,
          nextSequence: 2,
        })
      },
    )
  })
})