import type {
  InboxPolicy,
} from '../inbox-policy.js'
import { InboxCoreError } from './errors.js'
import {
  isValidCapabilityToken,
  isValidInboxId,
  isValidInboxPolicy,
  isValidTimestamp,
  isValidTokenDigest,
  type CreatedInboxCapabilities,
  type StoredInbox,
} from './model.js'
import type {
  Clock,
  ExpiryScheduler,
  InboxRepository,
  SecureValueGenerator,
  TokenDigestService,
} from './ports.js'

export interface CreateInboxDependencies {
  readonly policy: InboxPolicy
  readonly clock: Clock
  readonly values: SecureValueGenerator
  readonly tokenDigests: TokenDigestService
  readonly inboxes: InboxRepository
  readonly expiry: ExpiryScheduler
}

export async function createInbox({
  policy,
  clock,
  values,
  tokenDigests,
  inboxes,
  expiry,
}: CreateInboxDependencies): Promise<CreatedInboxCapabilities> {
  if (!isValidInboxPolicy(policy)) {
    throw new InboxCoreError(
      'INVALID_POLICY',
      'The inbox policy is invalid.',
    )
  }

  const createdAtMs =
    clock.nowMilliseconds()

  if (!isValidTimestamp(createdAtMs)) {
    throw new InboxCoreError(
      'INVALID_CLOCK',
      'The clock returned an invalid timestamp.',
    )
  }

  const expiresAtMs =
    createdAtMs + policy.ttlMilliseconds

  if (!isValidTimestamp(expiresAtMs)) {
    throw new InboxCoreError(
      'INVALID_CLOCK',
      'The calculated expiry timestamp is invalid.',
    )
  }

  const inboxId =
    values.generateInboxId()

  const ingestToken =
    values.generateCapabilityToken()

  const readToken =
    values.generateCapabilityToken()

  if (!isValidInboxId(inboxId)) {
    throw new InboxCoreError(
      'INVALID_GENERATED_INBOX_ID',
      'The generated inbox ID is invalid.',
    )
  }

  if (
    !isValidCapabilityToken(ingestToken) ||
    !isValidCapabilityToken(readToken)
  ) {
    throw new InboxCoreError(
      'INVALID_GENERATED_CAPABILITY',
      'A generated capability token is invalid.',
    )
  }

  if (ingestToken === readToken) {
    throw new InboxCoreError(
      'DUPLICATE_GENERATED_CAPABILITY',
      'Ingest and read capabilities must be different.',
    )
  }

  const [
    ingestTokenHash,
    readTokenHash,
  ] = await Promise.all([
    tokenDigests.digest(ingestToken),
    tokenDigests.digest(readToken),
  ])

  if (
    !isValidTokenDigest(ingestTokenHash) ||
    !isValidTokenDigest(readTokenHash)
  ) {
    throw new InboxCoreError(
      'INVALID_TOKEN_DIGEST',
      'The token digest service returned an invalid digest.',
    )
  }

  const storedInbox: StoredInbox = {
    schemaVersion: 1,
    inboxId,
    ingestTokenHash:
      ingestTokenHash.slice(),
    readTokenHash:
      readTokenHash.slice(),
    createdAtMs,
    expiresAtMs,
    deletedAtMs: null,
    storedRequestCount: 0,
    lifetimeRequestCount: 0,
    nextSequence: 1,
  }

  await inboxes.create(storedInbox)

  try {
    await expiry.scheduleInboxExpiry({
      inboxId,
      expiresAtMs,
    })
  } catch (scheduleError) {
    let cleanupError: unknown = null

    try {
      await inboxes.deleteById(inboxId)
    } catch (error) {
      cleanupError = error
    }

    throw new InboxCoreError(
      'EXPIRY_SCHEDULE_FAILED',
      'The inbox expiry could not be scheduled.',
      {
        scheduleError,
        cleanupError,
      },
    )
  }

  return {
    inboxId,
    ingestToken,
    readToken,
    createdAtMs,
    expiresAtMs,
  }
}