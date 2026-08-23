import {
  DEFAULT_INBOX_POLICY,
  createInbox,
  expireInbox,
  type CreatedInboxCapabilities,
} from '@reqbug/core'

import {
  DurableObject,
} from 'cloudflare:workers'

import {
  WebCryptoTokenDigestService,
} from '../platform/crypto.js'

import {
  DurableObjectExpiryScheduler,
  NoopInboxLifecycleNotifier,
  PresetSecureValueGenerator,
  SystemClock,
  type PresetCapabilities,
} from './runtime-adapters.js'

import {
  SqliteInboxRepository,
} from './sqlite-inbox-repository.js'

export class ReqBugInbox
  extends DurableObject<CloudflareBindings> {
  readonly repository:
    SqliteInboxRepository

  private readonly clock =
    new SystemClock()

  private readonly tokenDigests =
    new WebCryptoTokenDigestService()

  private readonly expiry:
    DurableObjectExpiryScheduler

  private readonly notifier =
    new NoopInboxLifecycleNotifier()

  constructor(
    ctx: DurableObjectState,
    env: CloudflareBindings,
  ) {
    super(ctx, env)

    this.repository =
      new SqliteInboxRepository(
        ctx.storage,
      )

    this.expiry =
      new DurableObjectExpiryScheduler(
        ctx.storage,
      )
  }

  async initializeInbox(
    capabilities:
      PresetCapabilities,
  ): Promise<CreatedInboxCapabilities> {
    return createInbox({
      policy: DEFAULT_INBOX_POLICY,
      clock: this.clock,

      values:
        new PresetSecureValueGenerator(
          capabilities,
        ),

      tokenDigests:
        this.tokenDigests,

      inboxes:
        this.repository,

      expiry:
        this.expiry,
    })
  }

  async alarm(): Promise<void> {
    const inbox =
      await this.repository
        .findCurrent()

    if (inbox === null) {
      return
    }

    await expireInbox(
      {
        clock: this.clock,
        tokenDigests:
          this.tokenDigests,
        inboxes:
          this.repository,
        expiry:
          this.expiry,
        notifier:
          this.notifier,
      },
      inbox.inboxId,
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