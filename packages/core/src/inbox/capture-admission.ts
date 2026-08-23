import type {
  InboxPolicy,
} from '../inbox-policy.js'
import { InboxCoreError } from './errors.js'
import {
  getInboxAvailability,
  isValidInboxPolicy,
  isValidStoredInboxState,
  isValidTimestamp,
  type StoredInbox,
} from './model.js'

export type CaptureAdmissionFailureReason =
  | 'invalid-body-length'
  | 'body-too-large'
  | 'inbox-expired'
  | 'inbox-deleted'
  | 'inbox-limit-reached'

export type CaptureAdmissionResult =
  | {
      readonly admitted: true
      readonly sequence: number
      readonly nextInbox: StoredInbox
    }
  | {
      readonly admitted: false
      readonly reason:
        CaptureAdmissionFailureReason
    }

export interface AssessCaptureAdmissionInput {
  readonly inbox: StoredInbox
  readonly nowMs: number
  readonly bodyByteLength: number
  readonly policy: InboxPolicy
}

export function assessCaptureAdmission({
  inbox,
  nowMs,
  bodyByteLength,
  policy,
}: AssessCaptureAdmissionInput): CaptureAdmissionResult {
  if (!isValidInboxPolicy(policy)) {
    throw new InboxCoreError(
      'INVALID_POLICY',
      'The inbox policy is invalid.',
    )
  }

  if (
    !isValidTimestamp(nowMs) ||
    !isValidStoredInboxState(inbox)
  ) {
    throw new InboxCoreError(
      'INVALID_INBOX_STATE',
      'The inbox state is invalid.',
    )
  }

  if (
    !Number.isSafeInteger(
      bodyByteLength,
    ) ||
    bodyByteLength < 0
  ) {
    return {
      admitted: false,
      reason: 'invalid-body-length',
    }
  }

  if (
    bodyByteLength >
    policy.requestBodyByteLimit
  ) {
    return {
      admitted: false,
      reason: 'body-too-large',
    }
  }

  const availability =
    getInboxAvailability(
      inbox,
      nowMs,
    )

  if (availability === 'expired') {
    return {
      admitted: false,
      reason: 'inbox-expired',
    }
  }

  if (availability === 'deleted') {
    return {
      admitted: false,
      reason: 'inbox-deleted',
    }
  }

  if (
    inbox.lifetimeRequestCount >=
    policy.lifetimeRequestLimit
  ) {
    return {
      admitted: false,
      reason: 'inbox-limit-reached',
    }
  }

  const sequence = inbox.nextSequence

  return {
    admitted: true,
    sequence,
    nextInbox: {
      ...inbox,
      storedRequestCount:
        inbox.storedRequestCount + 1,
      lifetimeRequestCount:
        inbox.lifetimeRequestCount + 1,
      nextSequence: sequence + 1,
    },
  }
}