import { Hono } from 'hono'

import {
  ReqBugInbox,
} from './inbox-object/reqbug-inbox.js'

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

export default app