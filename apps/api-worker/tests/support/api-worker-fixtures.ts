import {
  CaptureAcceptedResponseSchema,
  CreateInboxResponseSchema,
} from '@reqbug/contracts'

import {
  exports,
} from 'cloudflare:workers'

import {
  expect,
} from 'vitest'

export async function createTestInbox() {
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

export function authorizedRequest(
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

export async function captureWebhook({
  ingestUrl,
  path = '',
  method = 'POST',
  body,
  contentType,
  headers = {},
}: {
  readonly ingestUrl: string
  readonly path?: string
  readonly method?: string
  readonly body?:
    string | Uint8Array
  readonly contentType?: string
  readonly headers?:
    Record<string, string>
}): Promise<string> {
  const requestHeaders =
    new Headers(headers)

  if (contentType !== undefined) {
    requestHeaders.set(
      'content-type',
      contentType,
    )
  }

  const response =
    await exports.default.fetch(
      new Request(
        `${ingestUrl}${path}`,
        {
          method,
          headers:
            requestHeaders,
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
