import type {
  InboxPolicy,
} from '../inbox-policy.js'
import {
  authorizeInbox,
  type InboxAuthorizationFailureReason,
} from './authorize-inbox.js'
import { InboxCoreError } from './errors.js'
import {
  getInboxAvailability,
  isValidCapabilityToken,
  isValidTimestamp,
} from './model.js'
import type {
  Clock,
  InboxRepository,
  LiveTicketRepository,
  SecureValueGenerator,
  TokenDigestService,
} from './ports.js'

export interface LiveTicketDependencies {
  readonly clock: Clock
  readonly values: SecureValueGenerator
  readonly tokenDigests: TokenDigestService
  readonly inboxes: InboxRepository
  readonly liveTickets: LiveTicketRepository
  readonly policy: InboxPolicy
}

export interface IssueLiveTicketInput {
  readonly inboxId: string
  readonly readToken: string
}

export type IssueLiveTicketFailureReason =
  | InboxAuthorizationFailureReason
  | 'live-ticket-limit-reached'

export type IssueLiveTicketResult =
  | {
      readonly issued: true
      readonly ticket: string
      readonly expiresAtMs: number
    }
  | {
      readonly issued: false
      readonly reason:
        IssueLiveTicketFailureReason
    }

export async function issueLiveTicket(
  dependencies: LiveTicketDependencies,
  input: IssueLiveTicketInput,
): Promise<IssueLiveTicketResult> {
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
      issued: false,
      reason: authorization.reason,
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

  const expiresAtMs =
    nowMs +
    dependencies.policy
      .liveTicketLifetimeMilliseconds

  if (!isValidTimestamp(expiresAtMs)) {
    throw new InboxCoreError(
      'INVALID_POLICY',
      'The live ticket expiry is invalid.',
    )
  }

  const ticket =
    dependencies.values
      .generateCapabilityToken()

  if (!isValidCapabilityToken(ticket)) {
    throw new InboxCoreError(
      'INVALID_GENERATED_CAPABILITY',
      'The value generator returned an invalid live ticket.',
    )
  }

  const ticketHash =
    await dependencies.tokenDigests
      .digest(ticket)

  const storageResult =
    await dependencies.liveTickets
      .issueLiveTicket({
        ticketHash,
        expiresAtMs,
        nowMs,
        unexpiredLimit:
          dependencies.policy
            .liveConnectionLimit,
      })

  if (!storageResult.issued) {
    return {
      issued: false,
      reason:
        storageResult.reason,
    }
  }

  return {
    issued: true,
    ticket,
    expiresAtMs,
  }
}

export interface ConsumeLiveTicketInput {
  readonly inboxId: string
  readonly ticket: string
}

export type ConsumeLiveTicketFailureReason =
  | 'not-found'
  | 'invalid-ticket'
  | 'expired'
  | 'deleted'

export type ConsumeLiveTicketResult =
  | {
      readonly consumed: true
    }
  | {
      readonly consumed: false
      readonly reason:
        ConsumeLiveTicketFailureReason
    }

export async function consumeLiveTicket(
  dependencies: Omit<
    LiveTicketDependencies,
    'values' | 'policy'
  >,
  input: ConsumeLiveTicketInput,
): Promise<ConsumeLiveTicketResult> {
  if (
    !isValidCapabilityToken(input.ticket)
  ) {
    return {
      consumed: false,
      reason: 'invalid-ticket',
    }
  }

  const inbox =
    await dependencies.inboxes
      .findById(input.inboxId)

  if (inbox === null) {
    return {
      consumed: false,
      reason: 'not-found',
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

  const availability =
    getInboxAvailability(
      inbox,
      nowMs,
    )

  if (availability !== 'active') {
    return {
      consumed: false,
      reason: availability,
    }
  }

  const ticketHash =
    await dependencies.tokenDigests
      .digest(input.ticket)

  const storageResult =
    await dependencies.liveTickets
      .consumeLiveTicket({
        ticketHash,
        nowMs,
      })

  if (!storageResult.consumed) {
    return {
      consumed: false,
      reason:
        storageResult.reason,
    }
  }

  return {
    consumed: true,
  }
}
