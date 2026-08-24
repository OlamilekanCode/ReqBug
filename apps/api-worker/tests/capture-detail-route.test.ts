import {
  ApiErrorResponseSchema,
  CaptureAcceptedResponseSchema,
  CaptureDetailSchema,
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

async function captureRequest({
  ingestUrl,
  path,
  body,
  contentType,
}: {
  readonly ingestUrl: string
  readonly path: string
  readonly body:
    string | Uint8Array
  readonly contentType: string
}) {
  const response =
    await exports.default.fetch(
      new Request(
        `${ingestUrl}${path}`,
        {
          method: 'POST',

          headers: {
            'content-type':
              contentType,

            'x-example':
              'example-value',
          },

          body,
        },
      ),
    )

  expect(response.status).toBe(200)

  return CaptureAcceptedResponseSchema
    .parse(
      await response.json(),
    )
    .requestId
}

function authorizedRequest(
  url: string,
  readToken?: string,
): Request {
  return new Request(
    url,
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

describe('authenticated capture detail routes', () => {
  it('returns JSON detail with repeated query entries and normalized headers', async () => {
    const inbox =
      await createTestInbox()

    const body =
      '{"event":"payment.completed"}'

    const requestId =
      await captureRequest({
        ingestUrl:
          inbox.ingestUrl,

        path:
          '/events?mode=test&mode=debug',

        body,

        contentType:
          'application/json; charset=utf-8',
      })

    const response =
      await exports.default.fetch(
        authorizedRequest(
          'https://reqbug.test' +
          `/api/v1/inboxes/${inbox.inboxId}` +
          `/requests/${requestId}`,
          inbox.readToken,
        ),
      )

    expect(response.status).toBe(200)

    const detail =
      CaptureDetailSchema.parse(
        await response.json(),
      )

    expect(detail.query).toEqual([
      {
        name: 'mode',
        value: 'test',
      },
      {
        name: 'mode',
        value: 'debug',
      },
    ])

    expect(detail.headers).toContainEqual({
      name: 'x-example',
      value: 'example-value',
    })

    expect(detail.contentType).toBe(
      'application/json',
    )

    expect(detail.body).toEqual({
      encoding: 'utf-8',
      text: body,
      json: {
        event:
          'payment.completed',
      },
      jsonDerived: true,

      downloadUrl:
        `/api/v1/inboxes/${inbox.inboxId}` +
        `/requests/${requestId}/body`,
    })
  })

  it('returns a non-JSON UTF-8 body view', async () => {
    const inbox =
      await createTestInbox()

    const requestId =
      await captureRequest({
        ingestUrl:
          inbox.ingestUrl,

        path: '/plain',

        body:
          'plain webhook data',

        contentType:
          'text/plain',
      })

    const response =
      await exports.default.fetch(
        authorizedRequest(
          'https://reqbug.test' +
          `/api/v1/inboxes/${inbox.inboxId}` +
          `/requests/${requestId}`,
          inbox.readToken,
        ),
      )

    const detail =
      CaptureDetailSchema.parse(
        await response.json(),
      )

    expect(detail.body).toMatchObject({
      encoding: 'utf-8',
      text: 'plain webhook data',
      jsonDerived: false,
    })
  })

  it('returns a binary body view without derived text', async () => {
    const inbox =
      await createTestInbox()

    const requestId =
      await captureRequest({
        ingestUrl:
          inbox.ingestUrl,

        path: '/binary',

        body:
          new Uint8Array([
            255,
            254,
            253,
          ]),

        contentType:
          'application/octet-stream',
      })

    const response =
      await exports.default.fetch(
        authorizedRequest(
          'https://reqbug.test' +
          `/api/v1/inboxes/${inbox.inboxId}` +
          `/requests/${requestId}`,
          inbox.readToken,
        ),
      )

    const detail =
      CaptureDetailSchema.parse(
        await response.json(),
      )

    expect(detail.body).toEqual({
      encoding: 'binary',

      downloadUrl:
        `/api/v1/inboxes/${inbox.inboxId}` +
        `/requests/${requestId}/body`,
    })
  })

  it('downloads the exact original body bytes', async () => {
    const inbox =
      await createTestInbox()

    const originalBody =
      new Uint8Array([
        0,
        1,
        127,
        128,
        254,
        255,
      ])

    const requestId =
      await captureRequest({
        ingestUrl:
          inbox.ingestUrl,

        path: '/download',

        body:
          originalBody,

        contentType:
          'application/octet-stream',
      })

    const response =
      await exports.default.fetch(
        authorizedRequest(
          'https://reqbug.test' +
          `/api/v1/inboxes/${inbox.inboxId}` +
          `/requests/${requestId}/body`,
          inbox.readToken,
        ),
      )

    expect(response.status).toBe(200)

    expect(
      response.headers.get(
        'content-type',
      ),
    ).toBe(
      'application/octet-stream',
    )

    expect(
      response.headers.get(
        'cache-control',
      ),
    ).toBe('no-store')

    expect(
      new Uint8Array(
        await response.arrayBuffer(),
      ),
    ).toEqual(originalBody)
  })

  it('protects missing captures and body downloads', async () => {
    const inbox =
      await createTestInbox()

    const missingUrl =
      'https://reqbug.test' +
      `/api/v1/inboxes/${inbox.inboxId}` +
      '/requests/whr_missing'

    const missingResponse =
      await exports.default.fetch(
        authorizedRequest(
          missingUrl,
          inbox.readToken,
        ),
      )

    expect(
      missingResponse.status,
    ).toBe(404)

    expect(
      ApiErrorResponseSchema.parse(
        await missingResponse.json(),
      ).error.code,
    ).toBe('NOT_FOUND')

    const unauthorizedResponse =
      await exports.default.fetch(
        authorizedRequest(
          `${missingUrl}/body`,
        ),
      )

    expect(
      unauthorizedResponse.status,
    ).toBe(404)
  })
})