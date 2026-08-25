import {
  ApiErrorResponseSchema,
  CaptureListResponseSchema,
  MAX_INBOX_CAPTURE_COUNT,
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

import {
  authorizedRequest,
  captureWebhook,
  createTestInbox,
} from './support/api-worker-fixtures.js'

import type {
  ReqBugInbox,
} from '../src/inbox-object/reqbug-inbox.js'

function inboxUrl(
  inboxId: string,
  suffix = '',
): string {
  return 'https://reqbug.test' +
    `/api/v1/inboxes/${inboxId}` +
    suffix
}

function lifecycleRequest(
  url: string,
  readToken?: string,
): Request {
  return new Request(
    url,
    {
      method: 'DELETE',

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

async function listCaptureCount(
  inboxId: string,
  readToken: string,
): Promise<number> {
  const response =
    await exports.default.fetch(
      authorizedRequest(
        inboxUrl(
          inboxId,
          '/requests?limit=50',
        ),
        readToken,
      ),
    )

  expect(response.status).toBe(200)

  const feed =
    CaptureListResponseSchema.parse(
      await response.json(),
    )

  return feed.data.length
}

async function expectGenericNotFound(
  response: Response,
): Promise<void> {
  expect(response.status).toBe(404)

  const parsed =
    ApiErrorResponseSchema.parse(
      await response.json(),
    )

  expect(parsed.error.code).toBe(
    'NOT_FOUND',
  )
}

async function readErrorBody(
  response: Response,
): Promise<{
  readonly status: number
  readonly code: string
  readonly message: string
}> {
  const parsed =
    ApiErrorResponseSchema.parse(
      await response.json(),
    )

  return {
    status:
      response.status,
    code:
      parsed.error.code,
    message:
      parsed.error.message,
  }
}

async function expectNoBody(
  response: Response,
): Promise<void> {
  expect(response.status).toBe(204)
  expect(await response.text()).toBe('')
}

describe('authenticated inbox lifecycle routes', () => {
  it('clears stored captures and leaves the inbox usable', async () => {
    const inbox =
      await createTestInbox()

    await captureWebhook({
      ingestUrl:
        inbox.ingestUrl,
      path: '/first',
      body: 'first',
    })

    await captureWebhook({
      ingestUrl:
        inbox.ingestUrl,
      path: '/second',
      body: 'second',
    })

    expect(
      await listCaptureCount(
        inbox.inboxId,
        inbox.readToken,
      ),
    ).toBe(2)

    const clearResponse =
      await exports.default.fetch(
        lifecycleRequest(
          inboxUrl(
            inbox.inboxId,
            '/requests',
          ),
          inbox.readToken,
        ),
      )

    await expectNoBody(clearResponse)

    expect(
      await listCaptureCount(
        inbox.inboxId,
        inbox.readToken,
      ),
    ).toBe(0)

    await captureWebhook({
      ingestUrl:
        inbox.ingestUrl,
      path: '/after-clear',
      body: 'after clear',
    })

    expect(
      await listCaptureCount(
        inbox.inboxId,
        inbox.readToken,
      ),
    ).toBe(1)
  })

  it('does not reset the lifetime quota when captures are cleared', async () => {
    const inbox =
      await createTestInbox()

    await captureWebhook({
      ingestUrl:
        inbox.ingestUrl,
      path:
        '/quota-boundary',
      body:
        'quota boundary',
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
        state.storage.sql.exec(
          `
            UPDATE inbox_meta
            SET
              lifetime_request_count = ?,
              next_sequence = ?
            WHERE
              singleton_id = 1
          `,
          MAX_INBOX_CAPTURE_COUNT,
          MAX_INBOX_CAPTURE_COUNT + 1,
        )
      },
    )

    const clearResponse =
      await exports.default.fetch(
        lifecycleRequest(
          inboxUrl(
            inbox.inboxId,
            '/requests',
          ),
          inbox.readToken,
        ),
      )

    await expectNoBody(clearResponse)

    expect(
      await listCaptureCount(
        inbox.inboxId,
        inbox.readToken,
      ),
    ).toBe(0)

    const rejectedCapture =
      await exports.default.fetch(
        new Request(
          inbox.ingestUrl,
          {
            method: 'POST',
            body:
              'quota remains exhausted',
          },
        ),
      )

    expect(
      rejectedCapture.status,
    ).toBe(429)

    const parsed =
      ApiErrorResponseSchema.parse(
        await rejectedCapture.json(),
      )

    expect(parsed.error.code).toBe(
      'INBOX_LIMIT_REACHED',
    )
  })

  it('deletes an inbox and blocks future reads and ingestion', async () => {
    const inbox =
      await createTestInbox()

    const requestId =
      await captureWebhook({
        ingestUrl:
          inbox.ingestUrl,
        path: '/before-delete',
        body: 'delete me',
      })

    const deleteResponse =
      await exports.default.fetch(
        lifecycleRequest(
          inboxUrl(inbox.inboxId),
          inbox.readToken,
        ),
      )

    await expectNoBody(deleteResponse)

    await expectGenericNotFound(
      await exports.default.fetch(
        authorizedRequest(
          inboxUrl(inbox.inboxId),
          inbox.readToken,
        ),
      ),
    )

    await expectGenericNotFound(
      await exports.default.fetch(
        authorizedRequest(
          inboxUrl(
            inbox.inboxId,
            '/requests',
          ),
          inbox.readToken,
        ),
      ),
    )

    await expectGenericNotFound(
      await exports.default.fetch(
        authorizedRequest(
          inboxUrl(
            inbox.inboxId,
            `/requests/${requestId}`,
          ),
          inbox.readToken,
        ),
      ),
    )

    await expectGenericNotFound(
      await exports.default.fetch(
        authorizedRequest(
          inboxUrl(
            inbox.inboxId,
            `/requests/${requestId}/body`,
          ),
          inbox.readToken,
        ),
      ),
    )

    await expectGenericNotFound(
      await exports.default.fetch(
        new Request(
          inbox.ingestUrl,
          {
            method: 'POST',
            body:
              'must not store',
          },
        ),
      ),
    )
  })

  it('requires read bearer authorization for lifecycle operations', async () => {
    const inbox =
      await createTestInbox()

    const otherInbox =
      await createTestInbox()

    const invalidToken =
      'x'.repeat(43)

    const operations = [
      inboxUrl(
        inbox.inboxId,
        '/requests',
      ),
      inboxUrl(inbox.inboxId),
    ]

    for (const url of operations) {
      await expectGenericNotFound(
        await exports.default.fetch(
          lifecycleRequest(url),
        ),
      )

      await expectGenericNotFound(
        await exports.default.fetch(
          lifecycleRequest(
            url,
            invalidToken,
          ),
        ),
      )

      const ingestToken =
        new URL(
          inbox.ingestUrl,
        ).pathname
          .split('/')
          .at(-1)!

      await expectGenericNotFound(
        await exports.default.fetch(
          lifecycleRequest(
            url,
            ingestToken,
          ),
        ),
      )

      await expectGenericNotFound(
        await exports.default.fetch(
          lifecycleRequest(
            url,
            otherInbox.readToken,
          ),
        ),
      )

      await expectGenericNotFound(
        await exports.default.fetch(
          lifecycleRequest(
            `${url}?access=${inbox.readToken}`,
          ),
        ),
      )
    }

    const inaccessibleInbox =
      await exports.default.fetch(
        lifecycleRequest(
          inboxUrl(
            inbox.inboxId,
            '/requests',
          ),
          otherInbox.readToken,
        ),
      )

    const missingInbox =
      await exports.default.fetch(
        lifecycleRequest(
          inboxUrl(
            'ibx_missing',
            '/requests',
          ),
          otherInbox.readToken,
        ),
      )

    expect(
      await readErrorBody(
        inaccessibleInbox,
      ),
    ).toEqual(
      await readErrorBody(
        missingInbox,
      ),
    )
  })

  it('does not return capability values in lifecycle responses', async () => {
    const inbox =
      await createTestInbox()

    const unauthorizedResponse =
      await exports.default.fetch(
        lifecycleRequest(
          inboxUrl(
            inbox.inboxId,
            `/requests?access=${inbox.readToken}`,
          ),
        ),
      )

    const unauthorizedBody =
      await unauthorizedResponse.text()

    expect(
      unauthorizedBody,
    ).not.toContain(
      inbox.readToken,
    )

    expect(
      unauthorizedBody,
    ).not.toContain(
      new URL(
        inbox.ingestUrl,
      ).pathname
        .split('/')
        .at(-1)!,
    )

    const clearResponse =
      await exports.default.fetch(
        lifecycleRequest(
          inboxUrl(
            inbox.inboxId,
            '/requests',
          ),
          inbox.readToken,
        ),
      )

    await expectNoBody(clearResponse)
  })
})
