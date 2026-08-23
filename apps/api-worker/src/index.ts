import {
  CreateInboxResponseSchema,
  MAX_CAPTURE_BODY_BYTES,
  MAX_INBOX_CAPTURE_COUNT,
} from '@reqbug/contracts'

import { Hono } from 'hono'

import {
  ReqBugInbox,
} from './inbox-object/reqbug-inbox.js'

import {
  WebCryptoSecureValueGenerator,
} from './platform/crypto.js'

export {
  ReqBugInbox,
}

const app = new Hono<{
  Bindings: CloudflareBindings
}>()

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

export default app