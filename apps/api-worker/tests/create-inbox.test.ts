import {
  CreateInboxResponseSchema,
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
  StoredInbox,
} from '@reqbug/core'

import type {
  ReqBugInbox,
} from '../src/inbox-object/reqbug-inbox.js'

import {
  WebCryptoTokenDigestService,
} from '../src/platform/crypto.js'

describe('POST /api/v1/inboxes', () => {
  it('creates a secured inbox and schedules its expiry', async () => {
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
      CreateInboxResponseSchema.parse(
        await response.json(),
      )

    const {
      inboxId,
      ingestUrl,
      readToken,
      expiresAt,
    } = result.data

    const ingestToken =
      new URL(ingestUrl)
        .pathname
        .split('/')
        .at(-1)

    expect(ingestToken).toBeDefined()

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
        const stored =
          await instance.repository
            .findById(inboxId)

        expect(stored).not.toBeNull()

        if (stored === null) {
          throw new Error(
            'Stored inbox was not found.',
          )
        }

        const digests =
          new WebCryptoTokenDigestService()

        expect(
          await digests.verify(
            ingestToken!,
            stored.ingestTokenHash,
          ),
        ).toBe(true)

        expect(
          await digests.verify(
            readToken,
            stored.readTokenHash,
          ),
        ).toBe(true)

        expect(
          await state.storage
            .getAlarm(),
        ).toBe(
          Date.parse(expiresAt),
        )
      },
    )
  })
  
  it('supports the local Wrangler HTTP origin', async () => {
    const response =
      await exports.default.fetch(
        new Request(
          'http://127.0.0.1:8787/api/v1/inboxes',
          {
            method: 'POST',
          },
        ),
      )

    expect(response.status).toBe(201)

    const result =
      CreateInboxResponseSchema.parse(
        await response.json(),
      )

    const ingestUrl =
      new URL(result.data.ingestUrl)

    const dashboardUrl =
      new URL(
        result.data.dashboardUrl,
      )

    expect(ingestUrl.protocol).toBe(
      'http:',
    )

    expect(ingestUrl.host).toBe(
      '127.0.0.1:8787',
    )

    expect(dashboardUrl.origin).toBe(
      ingestUrl.origin,
    )
  })
})

describe('ReqBugInbox alarm', () => {
  it('purges an inbox whose expiry is due', async () => {
    const inboxId =
      'ibx_due_alarm'

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
        const nowMs = Date.now()

        const inbox: StoredInbox = {
          schemaVersion: 1,
          inboxId,

          ingestTokenHash:
            new Uint8Array(32).fill(1),

          readTokenHash:
            new Uint8Array(32).fill(2),

          createdAtMs:
            nowMs - 2_000,

          expiresAtMs:
            nowMs - 1_000,

          deletedAtMs: null,

          storedRequestCount: 0,
          lifetimeRequestCount: 0,
          nextSequence: 1,
        }

        await instance.repository
          .create(inbox)

        await state.storage.setAlarm(
          inbox.expiresAtMs,
        )

        await instance.alarm()

        expect(
          await instance.repository
            .findCurrent(),
        ).toBeNull()

        expect(
          await state.storage
            .getAlarm(),
        ).toBeNull()
      },
    )
  })
})