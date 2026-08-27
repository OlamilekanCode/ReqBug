import type {
  StoredInbox,
} from './model.js'

export interface Clock {
  nowMilliseconds(): number
}

export interface SecureValueGenerator {
  generateInboxId(): string
  generateCapabilityToken(): string
}

export interface TokenDigestService {
  digest(
    token: string,
  ): Promise<Uint8Array>

  verify(
    token: string,
    expectedDigest: Uint8Array,
  ): Promise<boolean>
}

export interface InboxRepository {
  create(inbox: StoredInbox): Promise<void>

  findById(
    inboxId: string,
  ): Promise<StoredInbox | null>

  deleteById(
    inboxId: string,
  ): Promise<void>
}

export interface ExpiryScheduler {
  scheduleInboxExpiry(input: {
    readonly inboxId: string
    readonly expiresAtMs: number
  }): Promise<void>
}

export interface ClearStoredRequestsResult {
  readonly clearedRequestCount: number
}

export type LiveTicketIssueResult =
  | {
      readonly issued: true
    }
  | {
      readonly issued: false
      readonly reason:
        'live-ticket-limit-reached'
    }

export type LiveTicketConsumeResult =
  | {
      readonly consumed: true
    }
  | {
      readonly consumed: false
      readonly reason:
        | 'not-found'
        | 'expired'
    }

export interface InboxLifecycleRepository
  extends InboxRepository {
  clearRequestsById(
    inboxId: string,
  ): Promise<ClearStoredRequestsResult>

  markDeleted(input: {
    readonly inboxId: string
    readonly deletedAtMs: number
  }): Promise<void>
}

export interface LiveTicketRepository {
  issueLiveTicket(input: {
    readonly ticketHash: Uint8Array
    readonly expiresAtMs: number
    readonly nowMs: number
    readonly unexpiredLimit: number
  }): Promise<LiveTicketIssueResult>

  consumeLiveTicket(input: {
    readonly ticketHash: Uint8Array
    readonly nowMs: number
  }): Promise<LiveTicketConsumeResult>
}

export type InboxTerminationReason =
  | 'deleted'
  | 'expired'

export interface InboxLifecycleNotifier {
  publishInboxCleared(input: {
    readonly inboxId: string
    readonly clearedAtMs: number
  }): Promise<void>

  terminateInbox(input: {
    readonly inboxId: string
    readonly reason:
      InboxTerminationReason
    readonly occurredAtMs: number
  }): Promise<void>
}
