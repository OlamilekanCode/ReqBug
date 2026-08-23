import {
  DEFAULT_INBOX_POLICY,
  authorizeInbox,
  createInbox,
  expireInbox,
  type CreatedInboxCapabilities,
  type InboxAuthorizationFailureReason,
} from '@reqbug/core'

import {
  DurableObject,
} from 'cloudflare:workers'

import type {
  PreparedCaptureRequest,
} from '../capture/prepare-capture-request.js'

import {
  WebCryptoSecureValueGenerator,
  WebCryptoTokenDigestService,
  bytesToBase64Url,
  sha256Bytes,
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
  type CapturePersistenceFailureReason,
} from './sqlite-inbox-repository.js'

export interface CaptureWebhookInput {
  readonly inboxId: string
  readonly ingestToken: string
  readonly capture:
    PreparedCaptureRequest
}

export interface ReadInboxMetadataInput {
  readonly inboxId: string
  readonly readToken: string
}

export interface InboxMetadataSnapshot {
  readonly inboxId: string
  readonly createdAtMs: number
  readonly expiresAtMs: number
  readonly storedRequestCount: number
  readonly lifetimeRequestCount: number
}

export type ReadInboxMetadataFailureReason =
  InboxAuthorizationFailureReason

export type ReadInboxMetadataResult =
  | {
      readonly found: true
      readonly metadata:
        InboxMetadataSnapshot
    }
  | {
      readonly found: false
      readonly reason:
        ReadInboxMetadataFailureReason
    }

export type CaptureWebhookFailureReason =
  | InboxAuthorizationFailureReason
  | CapturePersistenceFailureReason

export type CaptureWebhookResult =
  | {
      readonly captured: true
      readonly requestId: string
      readonly sequence: number
    }
  | {
      readonly captured: false
      readonly reason:
        CaptureWebhookFailureReason
    }

const textEncoder = new TextEncoder()

async function createRetryGroupKey(
  capture: PreparedCaptureRequest,
  bodySha256: Uint8Array,
): Promise<string> {
  const fingerprintSource =
    textEncoder.encode(
      [
        capture.method,
        capture.path,
        bytesToBase64Url(
          bodySha256,
        ),
      ].join('\n'),
    )

  const fingerprint =
    await sha256Bytes(
      fingerprintSource,
    )

  return (
    'fingerprint:' +
    bytesToBase64Url(fingerprint)
  )
}

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