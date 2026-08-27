import {
  CaptureDetailSchema,
} from '@reqbug/contracts'

import {
  DEFAULT_INBOX_POLICY,
  authorizeInbox,
  clearInboxRequests as clearInboxRequestsUseCase,
  consumeLiveTicket as consumeLiveTicketUseCase,
  createInbox,
  deleteInbox as deleteInboxUseCase,
  expireInbox,
  issueLiveTicket as issueLiveTicketUseCase,
  type CreatedInboxCapabilities,
} from '@reqbug/core'

import {
  DurableObject,
} from 'cloudflare:workers'

import {
  WebCryptoSecureValueGenerator,
  WebCryptoTokenDigestService,
  sha256Bytes,
} from '../platform/crypto.js'

import {
  createCaptureBodyView,
  createRetryGroupKey,
} from './capture-derived.js'

import {
  toCaptureSummary,
} from './capture-mappers.js'

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

export type {
  ClearInboxRequestsFailureReason,
  ClearInboxRequestsInput,
  ClearInboxRequestsResult,
  ConsumeLiveTicketInput,
  ConsumeLiveTicketResult,
  CaptureReadFailureReason,
  CaptureWebhookFailureReason,
  CaptureWebhookInput,
  CaptureWebhookResult,
  DeleteInboxFailureReason,
  DeleteInboxInput,
  DeleteInboxResult,
  IssueLiveTicketInput,
  IssueLiveTicketResult,
  ListInboxCapturesInput,
  ListInboxCapturesResult,
  ReadCaptureBodyResult,
  ReadCaptureDetailInput,
  ReadCaptureDetailResult,
  ReadInboxMetadataFailureReason,
  ReadInboxMetadataInput,
  ReadInboxMetadataResult,
} from './rpc-types.js'

import type {
  ClearInboxRequestsInput,
  ClearInboxRequestsResult,
  ConsumeLiveTicketInput,
  ConsumeLiveTicketResult,
  CaptureWebhookInput,
  CaptureWebhookResult,
  DeleteInboxInput,
  DeleteInboxResult,
  IssueLiveTicketInput,
  IssueLiveTicketResult,
  ListInboxCapturesInput,
  ListInboxCapturesResult,
  ReadCaptureBodyResult,
  ReadCaptureDetailInput,
  ReadCaptureDetailResult,
  ReadInboxMetadataInput,
  ReadInboxMetadataResult,
} from './rpc-types.js'

export class ReqBugInbox
  extends DurableObject<CloudflareBindings> {
  readonly repository:
    SqliteInboxRepository

  private readonly clock =
    new SystemClock()

  private readonly tokenDigests =
    new WebCryptoTokenDigestService()

  private readonly values =
    new WebCryptoSecureValueGenerator()

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

  async readInboxMetadata({
    inboxId,
    readToken,
  }: ReadInboxMetadataInput): Promise<ReadInboxMetadataResult> {
    const authorization =
      await authorizeInbox(
        {
          clock: this.clock,

          tokenDigests:
            this.tokenDigests,

          inboxes:
            this.repository,
        },
        {
          inboxId,

          capabilityToken:
            readToken,

          capability: 'read',
        },
      )

    if (!authorization.authorized) {
      return {
        found: false,
        reason:
          authorization.reason,
      }
    }

    const inbox =
      authorization.inbox

    return {
      found: true,

      metadata: {
        inboxId:
          inbox.inboxId,

        createdAtMs:
          inbox.createdAtMs,

        expiresAtMs:
          inbox.expiresAtMs,

        storedRequestCount:
          inbox.storedRequestCount,

        lifetimeRequestCount:
          inbox.lifetimeRequestCount,
      },
    }
  }

  async clearInboxRequests(
    input: ClearInboxRequestsInput,
  ): Promise<ClearInboxRequestsResult> {
    const result =
      await clearInboxRequestsUseCase(
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
        input,
      )

    if (!result.cleared) {
      return result
    }

    return {
      cleared: true,
      clearedAtMs:
        result.clearedAtMs,
      clearedRequestCount:
        result.clearedRequestCount,
    }
  }

  async deleteInbox(
    input: DeleteInboxInput,
  ): Promise<DeleteInboxResult> {
    const result =
      await deleteInboxUseCase(
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
        input,
      )

    if (!result.deleted) {
      return result
    }

    return {
      deleted: true,
      deletedAtMs:
        result.deletedAtMs,
    }
  }

  async issueLiveTicket(
    input: IssueLiveTicketInput,
  ): Promise<IssueLiveTicketResult> {
    return issueLiveTicketUseCase(
      {
        clock: this.clock,
        values: this.values,
        tokenDigests:
          this.tokenDigests,
        inboxes:
          this.repository,
        liveTickets:
          this.repository,
        policy:
          DEFAULT_INBOX_POLICY,
      },
      input,
    )
  }

  async consumeLiveTicket(
    input: ConsumeLiveTicketInput,
  ): Promise<ConsumeLiveTicketResult> {
    return consumeLiveTicketUseCase(
      {
        clock: this.clock,
        tokenDigests:
          this.tokenDigests,
        inboxes:
          this.repository,
        liveTickets:
          this.repository,
      },
      input,
    )
  }
  
  async listInboxCaptures({
    inboxId,
    readToken,
    before,
    limit,
  }: ListInboxCapturesInput): Promise<ListInboxCapturesResult> {
    const authorization =
      await authorizeInbox(
        {
          clock: this.clock,

          tokenDigests:
            this.tokenDigests,

          inboxes:
            this.repository,
        },
        {
          inboxId,

          capabilityToken:
            readToken,

          capability: 'read',
        },
      )

    if (!authorization.authorized) {
      return {
        found: false,
        reason:
          authorization.reason,
      }
    }

    const page =
      this.repository
        .listCaptureSummaries({
          before,
          limit,
        })

    const captures =
      page.captures.map(
        toCaptureSummary,
      )

    return {
      found: true,
      captures,
      nextBefore:
        page.nextBefore,
    }
  }

  async readCaptureDetail({
    inboxId,
    readToken,
    requestId,
  }: ReadCaptureDetailInput): Promise<ReadCaptureDetailResult> {
    const authorization =
      await authorizeInbox(
        {
          clock: this.clock,
          tokenDigests:
            this.tokenDigests,
          inboxes:
            this.repository,
        },
        {
          inboxId,
          capabilityToken:
            readToken,
          capability: 'read',
        },
      )

    if (!authorization.authorized) {
      return {
        found: false,
        reason:
          authorization.reason,
      }
    }

    const capture =
      this.repository
        .findCaptureDetail(requestId)

    if (capture === null) {
      return {
        found: false,
        reason:
          'request-not-found',
      }
    }

    const downloadUrl =
      `/api/v1/inboxes/` +
      `${encodeURIComponent(inboxId)}/` +
      `requests/` +
      `${encodeURIComponent(requestId)}/` +
      `body`

    const detail =
      CaptureDetailSchema.parse({
        ...toCaptureSummary(capture),

        query:
          capture.query,

        headers:
          capture.headers,

        body:
          createCaptureBodyView(
            capture.body,
            downloadUrl,
          ),
      })

    return {
      found: true,
      detail,
    }
  }

  async readCaptureBody({
    inboxId,
    readToken,
    requestId,
  }: ReadCaptureDetailInput): Promise<ReadCaptureBodyResult> {
    const authorization =
      await authorizeInbox(
        {
          clock: this.clock,
          tokenDigests:
            this.tokenDigests,
          inboxes:
            this.repository,
        },
        {
          inboxId,
          capabilityToken:
            readToken,
          capability: 'read',
        },
      )

    if (!authorization.authorized) {
      return {
        found: false,
        reason:
          authorization.reason,
      }
    }

    const capture =
      this.repository
        .findCaptureBody(requestId)

    if (capture === null) {
      return {
        found: false,
        reason:
          'request-not-found',
      }
    }

    return {
      found: true,

      contentType:
        capture.contentType,

      body:
        capture.body,
    }
  }

  async captureWebhook({
    inboxId,
    ingestToken,
    capture,
  }: CaptureWebhookInput): Promise<CaptureWebhookResult> {
    const authorization =
      await authorizeInbox(
        {
          clock: this.clock,

          tokenDigests:
            this.tokenDigests,

          inboxes:
            this.repository,
        },
        {
          inboxId,
          capabilityToken:
            ingestToken,
          capability: 'ingest',
        },
      )

    if (!authorization.authorized) {
      return {
        captured: false,
        reason:
          authorization.reason,
      }
    }

    const receivedAtMs =
      this.clock.nowMilliseconds()

    const bodySha256 =
      await sha256Bytes(
        capture.body,
      )

    const retryGroupKey =
      await createRetryGroupKey(
        capture,
        bodySha256,
      )

    const requestId =
      `whr_${this.values.generateInboxId()}`

    const persistence =
      await this.repository
        .insertCapture({
          inboxId,
          id: requestId,
          receivedAtMs,
          method: capture.method,
          path: capture.path,
          query: capture.query,
          headers: capture.headers,
          contentType:
            capture.contentType,
          body: capture.body,
          bodySha256,
          retryGroupKey,
        })

    if (!persistence.stored) {
      return {
        captured: false,
        reason:
          persistence.reason,
      }
    }

    return {
      captured: true,
      requestId:
        persistence.requestId,
      sequence:
        persistence.sequence,
    }
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
