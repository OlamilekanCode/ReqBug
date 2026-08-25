import {
  CaptureDetailSchema,
  CaptureIdSchema,
  CaptureListResponseSchema,
} from '@reqbug/contracts'

import type {
  Hono,
} from 'hono'

import type {
  AppEnvironment,
} from '../app-environment.js'

import {
  getBearerCapability,
} from '../auth/bearer-capability.js'

import {
  parseCaptureListParameters,
} from '../http/capture-list-query.js'

import {
  captureError,
  captureReadFailureResponse,
  inboxReadFailureResponse,
  jsonResponse,
  noContentResponse,
} from '../http/responses.js'

export function registerCaptureRoutes(
  app: Hono<AppEnvironment>,
): void {
  app.get(
    '/api/v1/inboxes/:inboxId/requests',
    async (context) => {
      const request =
        context.req.raw

      const inboxId =
        context.req.param('inboxId')

      const readToken =
        getBearerCapability(request)

      if (
        inboxId === undefined ||
        readToken === null
      ) {
        return captureError(
          request.method,
          404,
          'NOT_FOUND',
          'The requested webhook inbox was not found.',
        )
      }

      const parameters =
        parseCaptureListParameters(
          request.url,
        )

      if (!parameters.valid) {
        return captureError(
          request.method,
          400,
          'INVALID_REQUEST',
          'The capture list parameters are invalid.',
        )
      }

      const inbox =
        context.env.INBOXES.getByName(
          inboxId,
        )

      try {
        const result =
          await inbox.listInboxCaptures({
            inboxId,
            readToken,
            before:
              parameters.before,
            limit:
              parameters.limit,
          })

        if (!result.found) {
          return inboxReadFailureResponse(
            request.method,
            result.reason,
          )
        }

        const response =
          CaptureListResponseSchema.parse({
            data:
              result.captures,

            page: {
              nextBefore:
                result.nextBefore,
            },
          })

        return jsonResponse(
          request.method,
          response,
          200,
        )
      } catch {
        return captureError(
          request.method,
          503,
          'INBOX_UNAVAILABLE',
          'The webhook inbox is temporarily unavailable.',
        )
      }
    },
  )

  app.delete(
    '/api/v1/inboxes/:inboxId/requests',
    async (context) => {
      const request =
        context.req.raw

      const inboxId =
        context.req.param('inboxId')

      const readToken =
        getBearerCapability(request)

      if (
        inboxId === undefined ||
        readToken === null
      ) {
        return captureError(
          request.method,
          404,
          'NOT_FOUND',
          'The requested webhook inbox was not found.',
        )
      }

      const inbox =
        context.env.INBOXES.getByName(
          inboxId,
        )

      try {
        const result =
          await inbox.clearInboxRequests({
            inboxId,
            readToken,
          })

        if (!result.cleared) {
          return inboxReadFailureResponse(
            request.method,
            result.reason,
          )
        }

        return noContentResponse()
      } catch {
        return captureError(
          request.method,
          503,
          'INBOX_UNAVAILABLE',
          'The webhook inbox is temporarily unavailable.',
        )
      }
    },
  )

  app.get(
    '/api/v1/inboxes/:inboxId/requests/:requestId/body',
    async (context) => {
      const request =
        context.req.raw

      const inboxId =
        context.req.param('inboxId')

      const requestId =
        context.req.param('requestId')

      const readToken =
        getBearerCapability(request)

      if (
        inboxId === undefined ||
        requestId === undefined ||
        readToken === null ||
        !CaptureIdSchema.safeParse(
          requestId,
        ).success
      ) {
        return captureError(
          request.method,
          404,
          'NOT_FOUND',
          'The requested webhook capture was not found.',
        )
      }

      const inbox =
        context.env.INBOXES.getByName(
          inboxId,
        )

      try {
        const result =
          await inbox.readCaptureBody({
            inboxId,
            readToken,
            requestId,
          })

        if (!result.found) {
          return captureReadFailureResponse(
            request.method,
            result.reason,
          )
        }

        return new Response(
          result.body,
          {
            status: 200,

            headers: {
              'Content-Type':
                result.contentType ??
                'application/octet-stream',

              'Content-Length':
                String(
                  result.body.byteLength,
                ),

              'Content-Disposition':
                'attachment; filename="reqbug-body.bin"',

              'Cache-Control':
                'no-store',

              'Referrer-Policy':
                'no-referrer',

              'X-Content-Type-Options':
                'nosniff',
            },
          },
        )
      } catch {
        return captureError(
          request.method,
          503,
          'INBOX_UNAVAILABLE',
          'The webhook inbox is temporarily unavailable.',
        )
      }
    },
  )

  app.get(
    '/api/v1/inboxes/:inboxId/requests/:requestId',
    async (context) => {
      const request =
        context.req.raw

      const inboxId =
        context.req.param('inboxId')

      const requestId =
        context.req.param('requestId')

      const readToken =
        getBearerCapability(request)

      if (
        inboxId === undefined ||
        requestId === undefined ||
        readToken === null ||
        !CaptureIdSchema.safeParse(
          requestId,
        ).success
      ) {
        return captureError(
          request.method,
          404,
          'NOT_FOUND',
          'The requested webhook capture was not found.',
        )
      }

      const inbox =
        context.env.INBOXES.getByName(
          inboxId,
        )

      try {
        const result =
          await inbox.readCaptureDetail({
            inboxId,
            readToken,
            requestId,
          })

        if (!result.found) {
          return captureReadFailureResponse(
            request.method,
            result.reason,
          )
        }

        const response =
          CaptureDetailSchema.parse(
            result.detail,
          )

        return jsonResponse(
          request.method,
          response,
          200,
        )
      } catch {
        return captureError(
          request.method,
          503,
          'INBOX_UNAVAILABLE',
          'The webhook inbox is temporarily unavailable.',
        )
      }
    },
  )
}
