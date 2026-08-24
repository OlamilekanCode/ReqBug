import {
  Hono,
} from 'hono'

import type {
  AppEnvironment,
} from './app-environment.js'

import {
  ReqBugInbox,
} from './inbox-object/reqbug-inbox.js'

import {
  registerCaptureRoutes,
} from './routes/captures.js'

import {
  registerInboxRoutes,
} from './routes/inboxes.js'

import {
  registerWebhookRoutes,
} from './routes/webhooks.js'

export {
  ReqBugInbox,
}

const app =
  new Hono<AppEnvironment>()

app.get('/', (context) => {
  return context.json({
    service: 'reqbug-api',
    status: 'ok',
  })
})

registerInboxRoutes(app)
registerCaptureRoutes(app)
registerWebhookRoutes(app)

export default app
