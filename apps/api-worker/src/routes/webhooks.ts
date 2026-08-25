import type {
  Context,
  Hono,
} from 'hono'

import type {
  AppEnvironment,
} from '../app-environment.js'

import {
  prepareCaptureRequest,
} from '../capture/prepare-capture-request.js'

import {
  captureError,
  jsonResponse,
  persistenceFailureResponse,
  preparationFailureResponse,
} from '../http/responses.js'

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

export function registerWebhookRoutes(
  app: Hono<AppEnvironment>,
): void {
  app.all(
    '/h/:inboxId/:ingestToken',
    captureWebhookHandler,
  )

  app.all(
    '/h/:inboxId/:ingestToken/*',
    captureWebhookHandler,
  )
}
