import {
  CAPTURE_METHODS,
  CreateInboxResponseSchema,
  MAX_CAPTURE_BODY_BYTES,
  MAX_INBOX_CAPTURE_COUNT,
} from '@reqbug/contracts'

import {
  Hono,
  type Context,
} from 'hono'

import {
  prepareCaptureRequest,
  type CaptureRequestPreparationFailureReason,
} from './capture/prepare-capture-request.js'

import {
  ReqBugInbox,
  type CaptureWebhookFailureReason,
} from './inbox-object/reqbug-inbox.js'

import {
  WebCryptoSecureValueGenerator,
} from './platform/crypto.js'

export {
  ReqBugInbox,
}

type AppEnvironment = {
  Bindings: CloudflareBindings
}

const app =
  new Hono<AppEnvironment>()

const allowedCaptureMethods =
  CAPTURE_METHODS.join(', ')

function jsonResponse(
  method: string,
  value: unknown,
  status: number,
  additionalHeaders:
    Record<string, string> = {},
): Response {
  const headers =
    new Headers({
      'Content-Type':
        'application/json; charset=utf-8',

      'Cache-Control':
        'no-store',

      'Referrer-Policy':
        'no-referrer',

      ...additionalHeaders,
    })

  return new Response(
    method === 'HEAD'
      ? null
      : JSON.stringify(value),
    {
      status,
      headers,
    },
  )
}

function captureError(
  method: string,
  status: number,
  code: string,
  message: string,
  additionalHeaders:
    Record<string, string> = {},
): Response {
  const values =
    new WebCryptoSecureValueGenerator()

  return jsonResponse(
    method,
    {
      error: {
        code,
        message,

        requestId:
          `err_${values.generateInboxId()}`,
      },
    },
    status,
    additionalHeaders,
  )
}

function preparationFailureResponse(
  method: string,
  reason:
    CaptureRequestPreparationFailureReason,
): Response {
  switch (reason) {
    case 'method-not-allowed':
      return captureError(
        method,
        405,
        'METHOD_NOT_ALLOWED',
        'This HTTP method cannot be captured.',
        {
          Allow:
            allowedCaptureMethods,
        },
      )

    case 'body-too-large':
      return captureError(
        method,
        413,
        'BODY_TOO_LARGE',
        'The request body exceeds the capture limit.',
      )

    case 'path-query-too-large':
    case 'too-many-query-entries':
      return captureError(
        method,
        414,
        'REQUEST_TARGET_TOO_LARGE',
        'The request path or query exceeds the capture limit.',
      )

    case 'too-many-headers':
      return captureError(
        method,
        431,
        'TOO_MANY_HEADERS',
        'The request contains too many headers.',
      )

    case 'invalid-request':
      return captureError(
        method,
        400,
        'INVALID_REQUEST',
        'The request cannot be captured.',
      )
  }
}

function persistenceFailureResponse(
  method: string,
  reason:
    CaptureWebhookFailureReason,
): Response {
  switch (reason) {
    case 'not-found':
    case 'invalid-capability':
    case 'inbox-not-found':
      return captureError(
        method,
        404,
        'NOT_FOUND',
        'The requested webhook inbox was not found.',
      )

    case 'expired':
    case 'deleted':
    case 'inbox-expired':
    case 'inbox-deleted':
      return captureError(
        method,
        410,
        'INBOX_GONE',
        'This webhook inbox is no longer available.',
      )

    case 'inbox-limit-reached':
      return captureError(
        method,
        429,
        'INBOX_LIMIT_REACHED',
        'This webhook inbox has reached its capture limit.',
      )

    case 'body-too-large':
      return captureError(
        method,
        413,
        'BODY_TOO_LARGE',
        'The request body exceeds the capture limit.',
      )

    case 'invalid-body-length':
      return captureError(
        method,
        503,
        'CAPTURE_UNAVAILABLE',
        'The request could not be stored.',
      )
  }
}

function getCapturedPath({
  requestUrl,
  inboxId,
  ingestToken,
}: {
  readonly requestUrl: string
  readonly inboxId: string
  readonly ingestToken: string
}): string | null {
  const pathname =
    new URL(requestUrl).pathname

  const routingPrefix =
    `/h/${inboxId}/${ingestToken}`

  if (pathname === routingPrefix) {
    return '/'
  }

  if (
    !pathname.startsWith(
      `${routingPrefix}/`,
    )
  ) {
    return null
  }

  return pathname.slice(
    routingPrefix.length,
  )
}

async function captureWebhookHandler(
  context: Context<AppEnvironment>,
): Promise<Response> {
  const request =
    context.req.raw

  const inboxId =
    context.req.param('inboxId')

  const ingestToken =
    context.req.param('ingestToken')

    if (
      inboxId === undefined ||
      ingestToken === undefined
    ) {
      return captureError(
        request.method,
        404,
        'NOT_FOUND',
        'The requested webhook inbox was not found.',
      )
    }

  const capturedPath =
    getCapturedPath({
      requestUrl: request.url,
      inboxId,
      ingestToken,
    })

  if (capturedPath === null) {
    return captureError(
      request.method,
      404,
      'NOT_FOUND',
      'The requested webhook inbox was not found.',
    )
  }

  const preparation =
    await prepareCaptureRequest({
      request,
      capturedPath,
    })

  if (!preparation.prepared) {
    return preparationFailureResponse(
      request.method,
      preparation.reason,
    )
  }

  const inbox =
    context.env.INBOXES.getByName(
      inboxId,
    )

  try {
    const result =
      await inbox.captureWebhook({
        inboxId,
        ingestToken,
        capture:
          preparation.capture,
      })

    if (!result.captured) {
      return persistenceFailureResponse(
        request.method,
        result.reason,
      )
    }

    return jsonResponse(
      request.method,
      {
        received: true,
        requestId:
          result.requestId,
      },
      200,
    )
  } catch {
    return captureError(
      request.method,
      503,
      'CAPTURE_UNAVAILABLE',
      'The request could not be stored.',
    )
  }
}

app.get('/', (context) => {
  return context.json({
    service: 'reqbug-api',
    status: 'ok',
  })
})

app.post(
  '/api/v1/inboxes',
  async (context) => {
    const values =
      new WebCryptoSecureValueGenerator()

    const inboxId =
      values.generateInboxId()

    const ingestToken =
      values.generateCapabilityToken()

    const readToken =
      values.generateCapabilityToken()

    const inbox =
      context.env.INBOXES.getByName(
        inboxId,
      )

    const created =
      await inbox.initializeInbox({
        inboxId,
        ingestToken,
        readToken,
      })

    const origin =
      new URL(
        context.req.url,
      ).origin

    const response =
      CreateInboxResponseSchema.parse({
        data: {
          inboxId:
            created.inboxId,

          ingestUrl:
            `${origin}/h/` +
            `${created.inboxId}/` +
            created.ingestToken,

          dashboardUrl:
            `${origin}/inboxes/` +
            `${created.inboxId}` +
            `#access=${created.readToken}`,

          readToken:
            created.readToken,

          createdAt:
            new Date(
              created.createdAtMs,
            ).toISOString(),

          expiresAt:
            new Date(
              created.expiresAtMs,
            ).toISOString(),

          limits: {
            requests:
              MAX_INBOX_CAPTURE_COUNT,

            bodyBytes:
              MAX_CAPTURE_BODY_BYTES,
          },
        },
      })

    context.header(
      'Cache-Control',
      'no-store',
    )

    context.header(
      'Referrer-Policy',
      'no-referrer',
    )

    return context.json(
      response,
      201,
    )
  },
)

app.all(
  '/h/:inboxId/:ingestToken',
  captureWebhookHandler,
)

app.all(
  '/h/:inboxId/:ingestToken/*',
  captureWebhookHandler,
)

export default app