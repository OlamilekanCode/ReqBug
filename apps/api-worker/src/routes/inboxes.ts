import {
  CreateInboxResponseSchema,
  InboxMetadataResponseSchema,
  LiveTicketResponseSchema,
  MAX_CAPTURE_BODY_BYTES,
  MAX_INBOX_CAPTURE_COUNT,
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
  captureError,
  inboxReadFailureResponse,
  jsonResponse,
  liveTicketIssueFailureResponse,
  noContentResponse,
} from '../http/responses.js'

import {
  WebCryptoSecureValueGenerator,
} from '../platform/crypto.js'

export function registerInboxRoutes(
  app: Hono<AppEnvironment>,
): void {
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

  app.get(
    '/api/v1/inboxes/:inboxId',
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
          await inbox.readInboxMetadata({
            inboxId,
            readToken,
          })

        if (!result.found) {
          return inboxReadFailureResponse(
            request.method,
            result.reason,
          )
        }

        const response =
          InboxMetadataResponseSchema.parse({
            data: {
              inboxId:
                result.metadata.inboxId,

              createdAt:
                new Date(
                  result.metadata.createdAtMs,
                ).toISOString(),

              expiresAt:
                new Date(
                  result.metadata.expiresAtMs,
                ).toISOString(),

              status: 'active',

              storedRequestCount:
                result.metadata
                  .storedRequestCount,

              lifetimeRequestCount:
                result.metadata
                  .lifetimeRequestCount,

              requestLimit:
                MAX_INBOX_CAPTURE_COUNT,

              bodyByteLimit:
                MAX_CAPTURE_BODY_BYTES,
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

  app.post(
    '/api/v1/inboxes/:inboxId/live-tickets',
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
          await inbox.issueLiveTicket({
            inboxId,
            readToken,
          })

        if (!result.issued) {
          return liveTicketIssueFailureResponse(
            request.method,
            result.reason,
          )
        }

        const response =
          LiveTicketResponseSchema.parse({
            data: {
              ticket:
                result.ticket,

              expiresAt:
                new Date(
                  result.expiresAtMs,
                ).toISOString(),
            },
          })

        return jsonResponse(
          request.method,
          response,
          201,
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
    '/api/v1/inboxes/:inboxId',
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
          await inbox.deleteInbox({
            inboxId,
            readToken,
          })

        if (!result.deleted) {
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
}
