import {
  ApiErrorResponseSchema,
  CaptureListResponseSchema,
  CreateInboxResponseSchema,
} from '@reqbug/contracts'

import {
  exports,
} from 'cloudflare:workers'

import {
  describe,
  expect,
  it,
} from 'vitest'

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

  return CreateInboxResponseSchema
    .parse(
      await response.json(),
    )
    .data
}

async function capture(
  ingestUrl: string,
  path: string,
  body: string,
): Promise<void> {
  const response =
    await exports.default.fetch(
      new Request(
        `${ingestUrl}${path}`,
        {
          method: 'POST',

          headers: {
            'content-type':
              'application/json; charset=utf-8',
          },

          body,
        },
      ),
    )

  expect(response.status).toBe(200)
}

function listRequest(
  inboxId: string,
  readToken?: string,
  query = '',
): Request {
  return new Request(
    'https://reqbug.test' +
    `/api/v1/inboxes/${inboxId}` +
    `/requests${query}`,
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

describe('GET /api/v1/inboxes/:inboxId/requests', () => {
  it('returns an empty validated capture feed', async () => {
    const inbox =
      await createTestInbox()

    const response =
      await exports.default.fetch(
        listRequest(
          inbox.inboxId,
          inbox.readToken,
        ),
      )

    expect(response.status).toBe(200)

    expect(
      CaptureListResponseSchema.parse(
        await response.json(),
      ),
    ).toEqual({
      data: [],
      page: {
        nextBefore: null,
      },
    })
  })

  it('returns captures newest first', async () => {
    const inbox =
      await createTestInbox()

    await capture(
      inbox.ingestUrl,
      '/first',
      '{"position":1}',
    )

    await capture(
      inbox.ingestUrl,
      '/second',
      '{"position":2}',
    )

    await capture(
      inbox.ingestUrl,
      '/third',
      '{"position":3}',
    )

    const response =
      await exports.default.fetch(
        listRequest(
          inbox.inboxId,
          inbox.readToken,
        ),
      )

    expect(response.status).toBe(200)

    const result =
      CaptureListResponseSchema.parse(
        await response.json(),
      )

    expect(
      result.data.map(
        (capture) => capture.sequence,
      ),
    ).toEqual([3, 2, 1])

    expect(
      result.data.map(
        (capture) => capture.path,
      ),
    ).toEqual([
      '/third',
      '/second',
      '/first',
    ])

    expect(result.data[0]).toMatchObject({
      method: 'POST',
      contentType:
        'application/json',
      source: {
        kind: 'unknown',
        confidence: null,
        evidence: [],
      },
      deliveryId: null,
      eventId: null,
      retry: {
        classification: 'unique',
        attempt: 1,
        groupSize: 1,
      },
    })

    expect(
      result.data[0]?.bodySha256,
    ).toMatch(
      /^[A-Za-z0-9_-]{43}$/u,
    )
  })

  it('paginates using the before cursor', async () => {
    const inbox =
      await createTestInbox()

    await capture(
      inbox.ingestUrl,
      '/one',
      '{"page":1}',
    )

    await capture(
      inbox.ingestUrl,
      '/two',
      '{"page":2}',
    )

    await capture(
      inbox.ingestUrl,
      '/three',
      '{"page":3}',
    )

    const firstResponse =
      await exports.default.fetch(
        listRequest(
          inbox.inboxId,
          inbox.readToken,
          '?limit=2',
        ),
      )

    const firstPage =
      CaptureListResponseSchema.parse(
        await firstResponse.json(),
      )

    expect(
      firstPage.data.map(
        (capture) => capture.sequence,
      ),
    ).toEqual([3, 2])

    expect(
      firstPage.page.nextBefore,
    ).toBe(2)

    const secondResponse =
      await exports.default.fetch(
        listRequest(
          inbox.inboxId,
          inbox.readToken,
          '?limit=2&before=2',
        ),
      )

    const secondPage =
      CaptureListResponseSchema.parse(
        await secondResponse.json(),
      )

    expect(
      secondPage.data.map(
        (capture) => capture.sequence,
      ),
    ).toEqual([1])

    expect(
      secondPage.page.nextBefore,
    ).toBeNull()
  })

  it('requires the read capability in the Authorization header', async () => {
    const inbox =
      await createTestInbox()

    const missingResponse =
      await exports.default.fetch(
        listRequest(inbox.inboxId),
      )

    expect(
      missingResponse.status,
    ).toBe(404)

    const queryResponse =
      await exports.default.fetch(
        listRequest(
          inbox.inboxId,
          undefined,
          `?access=${inbox.readToken}`,
        ),
      )

    expect(queryResponse.status).toBe(404)
  })

  it('rejects invalid pagination parameters', async () => {
    const inbox =
      await createTestInbox()

    for (
      const query of [
        '?limit=0',
        '?limit=51',
        '?before=0',
        '?limit=2&limit=3',
      ]
    ) {
      const response =
        await exports.default.fetch(
          listRequest(
            inbox.inboxId,
            inbox.readToken,
            query,
          ),
        )

      expect(response.status).toBe(400)

      expect(
        ApiErrorResponseSchema.parse(
          await response.json(),
        ).error.code,
      ).toBe('INVALID_REQUEST')
    }
  })
})