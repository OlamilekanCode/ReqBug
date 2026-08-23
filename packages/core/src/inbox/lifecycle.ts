import {
  authorizeInbox,
  type InboxAuthorizationFailureReason,
} from './authorize-inbox.js'
import { InboxCoreError } from './errors.js'
import {
  isValidTimestamp,
} from './model.js'
import type {
  Clock,
  ExpiryScheduler,
  InboxLifecycleNotifier,
  InboxLifecycleRepository,
  TokenDigestService,
} from './ports.js'

export interface InboxLifecycleDependencies {
  readonly clock: Clock
  readonly tokenDigests: TokenDigestService
  readonly inboxes:
    InboxLifecycleRepository
  readonly expiry: ExpiryScheduler
  readonly notifier:
    InboxLifecycleNotifier
}

export interface AuthorizedLifecycleInput {
  readonly inboxId: string
  readonly readToken: string
}

export type ClearInboxRequestsResult =
  | {
      readonly cleared: true
      readonly clearedAtMs: number
      readonly clearedRequestCount: number
      readonly liveNotificationDelivered:
        boolean
    }
  | {
      readonly cleared: false
      readonly reason:
        InboxAuthorizationFailureReason
    }

export async function clearInboxRequests(
  dependencies:
    InboxLifecycleDependencies,
  input: AuthorizedLifecycleInput,
): Promise<ClearInboxRequestsResult> {
  const authorization =
    await authorizeInbox(
      dependencies,
      {
        inboxId: input.inboxId,
        capabilityToken:
          input.readToken,
        capability: 'read',
      },
    )

  if (!authorization.authorized) {
    return {
      cleared: false,
      reason: authorization.reason,
    }
  }

  const clearedAtMs =
    dependencies.clock.nowMilliseconds()

  if (!isValidTimestamp(clearedAtMs)) {
    throw new InboxCoreError(
      'INVALID_CLOCK',
      'The clock returned an invalid timestamp.',
    )
  }

  const clearResult =
    await dependencies.inboxes
      .clearRequestsById(
        input.inboxId,
      )

  let liveNotificationDelivered = true

  try {
    await dependencies.notifier
      .publishInboxCleared({
        inboxId: input.inboxId,
        clearedAtMs,
      })
  } catch {
    liveNotificationDelivered = false
  }

  return {
    cleared: true,
    clearedAtMs,
    clearedRequestCount:
      clearResult.clearedRequestCount,
    liveNotificationDelivered,
  }
}

export type DeleteInboxResult =
  | {
      readonly deleted: true
      readonly deletedAtMs: number
      readonly liveTerminationDelivered:
        boolean
      readonly storagePurged: boolean
    }
  | {
      readonly deleted: false
      readonly reason:
        InboxAuthorizationFailureReason
    }

export async function deleteInbox(
  dependencies:
    InboxLifecycleDependencies,
  input: AuthorizedLifecycleInput,
): Promise<DeleteInboxResult> {
  const authorization =
    await authorizeInbox(
      dependencies,
      {
        inboxId: input.inboxId,
        capabilityToken:
          input.readToken,
        capability: 'read',
      },
    )

  if (!authorization.authorized) {
    return {
      deleted: false,
      reason: authorization.reason,
    }
  }

  const deletedAtMs =
    dependencies.clock.nowMilliseconds()

  if (!isValidTimestamp(deletedAtMs)) {
    throw new InboxCoreError(
      'INVALID_CLOCK',
      'The clock returned an invalid timestamp.',
    )
  }

  await dependencies.inboxes.markDeleted({
    inboxId: input.inboxId,
    deletedAtMs,
  })

  let liveTerminationDelivered = true

  try {
    await dependencies.notifier
      .terminateInbox({
        inboxId: input.inboxId,
        reason: 'deleted',
        occurredAtMs: deletedAtMs,
      })
  } catch {
    liveTerminationDelivered = false
  }

  let storagePurged = true

  try {
    await dependencies.inboxes
      .deleteById(input.inboxId)
  } catch {
    storagePurged = false
  }

  return {
    deleted: true,
    deletedAtMs,
    liveTerminationDelivered,
    storagePurged,
  }
}

export type ExpireInboxResult =
  | {
      readonly expired: true
      readonly expiredAtMs: number
      readonly liveTerminationDelivered:
        boolean
      readonly storagePurged: boolean
    }
  | {
      readonly expired: false
      readonly reason:
        | 'not-found'
        | 'deleted'
        | 'not-due'
      readonly rescheduled: boolean
    }

export async function expireInbox(
  dependencies:
    InboxLifecycleDependencies,
  inboxId: string,
): Promise<ExpireInboxResult> {
  const inbox =
    await dependencies.inboxes
      .findById(inboxId)

  if (inbox === null) {
    return {
      expired: false,
      reason: 'not-found',
      rescheduled: false,
    }
  }

  const nowMs =
    dependencies.clock.nowMilliseconds()

  if (!isValidTimestamp(nowMs)) {
    throw new InboxCoreError(
      'INVALID_CLOCK',
      'The clock returned an invalid timestamp.',
    )
  }

  if (
    inbox.deletedAtMs !== null &&
    inbox.deletedAtMs <
      inbox.expiresAtMs
  ) {
    return {
      expired: false,
      reason: 'deleted',
      rescheduled: false,
    }
  }

  if (nowMs < inbox.expiresAtMs) {
    await dependencies.expiry
      .scheduleInboxExpiry({
        inboxId,
        expiresAtMs:
          inbox.expiresAtMs,
      })

    return {
      expired: false,
      reason: 'not-due',
      rescheduled: true,
    }
  }

  await dependencies.inboxes.markDeleted({
    inboxId,
    deletedAtMs: nowMs,
  })

  let liveTerminationDelivered = true

  try {
    await dependencies.notifier
      .terminateInbox({
        inboxId,
        reason: 'expired',
        occurredAtMs: nowMs,
      })
  } catch {
    liveTerminationDelivered = false
  }

  let storagePurged = true

  try {
    await dependencies.inboxes
      .deleteById(inboxId)
  } catch {
    storagePurged = false
  }

  return {
    expired: true,
    expiredAtMs: inbox.expiresAtMs,
    liveTerminationDelivered,
    storagePurged,
  }
}