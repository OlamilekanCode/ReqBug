import type { InboxPolicy } from '../inbox-policy.js'

export const SHA_256_DIGEST_BYTE_LENGTH = 32
export const CAPABILITY_TOKEN_LENGTH = 43

const opaqueIdentifierPattern =
  /^[A-Za-z0-9_-]+$/u

const capabilityPattern =
  /^[A-Za-z0-9_-]{43}$/u

export interface StoredInbox {
  readonly schemaVersion: 1
  readonly inboxId: string
  readonly ingestTokenHash: Uint8Array
  readonly readTokenHash: Uint8Array
  readonly createdAtMs: number
  readonly expiresAtMs: number
  readonly deletedAtMs: number | null
  readonly storedRequestCount: number
  readonly lifetimeRequestCount: number
  readonly nextSequence: number
}

export interface CreatedInboxCapabilities {
  readonly inboxId: string
  readonly ingestToken: string
  readonly readToken: string
  readonly createdAtMs: number
  readonly expiresAtMs: number
}

export type InboxCapabilityKind =
  | 'ingest'
  | 'read'

export type InboxAvailability =
  | 'active'
  | 'expired'
  | 'deleted'

export function isValidInboxId(
  value: string,
): boolean {
  return (
    value.length >= 1 &&
    value.length <= 128 &&
    opaqueIdentifierPattern.test(value)
  )
}

export function isValidCapabilityToken(
  value: string,
): boolean {
  return capabilityPattern.test(value)
}

export function isValidTokenDigest(
  value: Uint8Array,
): boolean {
  return (
    value.length ===
    SHA_256_DIGEST_BYTE_LENGTH
  )
}

export function isValidTimestamp(
  value: number,
): boolean {
  return (
    Number.isSafeInteger(value) &&
    value >= 0
  )
}

export function isValidInboxPolicy(
  policy: InboxPolicy,
): boolean {
  return (
    Number.isSafeInteger(
      policy.ttlMilliseconds,
    ) &&
    policy.ttlMilliseconds > 0 &&
    Number.isSafeInteger(
      policy.lifetimeRequestLimit,
    ) &&
    policy.lifetimeRequestLimit > 0 &&
    Number.isSafeInteger(
      policy.requestBodyByteLimit,
    ) &&
    policy.requestBodyByteLimit > 0 &&
    Number.isSafeInteger(
      policy.liveConnectionLimit,
    ) &&
    policy.liveConnectionLimit > 0
  )
}

export function getInboxAvailability(
  inbox: StoredInbox,
  nowMs: number,
): InboxAvailability {
  if (inbox.deletedAtMs !== null) {
    return inbox.deletedAtMs >=
      inbox.expiresAtMs
      ? 'expired'
      : 'deleted'
  }

  if (nowMs >= inbox.expiresAtMs) {
    return 'expired'
  }

  return 'active'
}

export function isValidStoredInboxState(
  inbox: StoredInbox,
): boolean {
  const validCounters =
    Number.isSafeInteger(
      inbox.storedRequestCount,
    ) &&
    inbox.storedRequestCount >= 0 &&
    Number.isSafeInteger(
      inbox.lifetimeRequestCount,
    ) &&
    inbox.lifetimeRequestCount >= 0 &&
    inbox.storedRequestCount <=
      inbox.lifetimeRequestCount &&
    Number.isSafeInteger(
      inbox.nextSequence,
    ) &&
    inbox.nextSequence ===
      inbox.lifetimeRequestCount + 1

  const validTimes =
    isValidTimestamp(inbox.createdAtMs) &&
    isValidTimestamp(inbox.expiresAtMs) &&
    inbox.expiresAtMs >
      inbox.createdAtMs &&
    (
      inbox.deletedAtMs === null ||
      (
        isValidTimestamp(
          inbox.deletedAtMs,
        ) &&
        inbox.deletedAtMs >=
          inbox.createdAtMs
      )
    )

  return (
    inbox.schemaVersion === 1 &&
    isValidInboxId(inbox.inboxId) &&
    isValidTokenDigest(
      inbox.ingestTokenHash,
    ) &&
    isValidTokenDigest(
      inbox.readTokenHash,
    ) &&
    validCounters &&
    validTimes
  )
}