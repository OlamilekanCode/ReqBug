import {
  DurableObject,
} from 'cloudflare:workers'

import {
  SqliteInboxRepository,
} from './sqlite-inbox-repository.js'

export class ReqBugInbox
  extends DurableObject<CloudflareBindings> {
  readonly repository:
    SqliteInboxRepository

  constructor(
    ctx: DurableObjectState,
    env: CloudflareBindings,
  ) {
    super(ctx, env)

    this.repository =
      new SqliteInboxRepository(
        ctx.storage,
      )
  }

  fetch(): Response {
    return new Response(
      'Not Found',
      {
        status: 404,
      },
    )
  }
}