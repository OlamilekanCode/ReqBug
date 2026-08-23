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