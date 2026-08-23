import { InboxCoreError } from './errors.js'
import {
  getInboxAvailability,
  isValidTimestamp,
  type InboxCapabilityKind,
  type StoredInbox,
} from './model.js'
import type {
  Clock,
  InboxRepository,
  TokenDigestService,
} from './ports.js'

export type InboxAuthorizationFailureReason =
  | 'not-found'
  | 'invalid-capability'
  | 'expired'
  | 'deleted'

export type InboxAuthorizationResult =
  | {
      readonly authorized: true
      readonly inbox: StoredInbox
    }
  | {
      readonly authorized: false
      readonly reason:
        InboxAuthorizationFailureReason
    }

export interface AuthorizeInboxDependencies {
  readonly clock: Clock
  readonly tokenDigests: TokenDigestService
  readonly inboxes: InboxRepository
}

export interface AuthorizeInboxInput {
  readonly inboxId: string
  readonly capabilityToken: string
  readonly capability:
    InboxCapabilityKind
}

export async function authorizeInbox(
  {
    clock,
    tokenDigests,
    inboxes,
  }: AuthorizeInboxDependencies,
  {
    inboxId,
    capabilityToken,
    capability,
  }: AuthorizeInboxInput,
): Promise<InboxAuthorizationResult> {
  const inbox =
    await inboxes.findById(inboxId)

  if (inbox === null) {
    return {
      authorized: false,
      reason: 'not-found',
    }
  }

  const expectedDigest =
    capability === 'ingest'
      ? inbox.ingestTokenHash
      : inbox.readTokenHash

  const capabilityVerified =
    await tokenDigests.verify(
      capabilityToken,
      expectedDigest.slice(),
    )

  if (!capabilityVerified) {
    return {
      authorized: false,
      reason: 'invalid-capability',
    }
  }

  const nowMs =
    clock.nowMilliseconds()

  if (!isValidTimestamp(nowMs)) {
    throw new InboxCoreError(
      'INVALID_CLOCK',
      'The clock returned an invalid timestamp.',
    )
  }

  const availability =
    getInboxAvailability(
      inbox,
      nowMs,
    )

  if (availability !== 'active') {
    return {
      authorized: false,
      reason: availability,
    }
  }

  return {
    authorized: true,
    inbox,
  }
}