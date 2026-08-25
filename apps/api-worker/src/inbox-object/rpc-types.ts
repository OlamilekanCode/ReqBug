import type {
  CaptureDetail,
  CaptureSummary,
} from '@reqbug/contracts'

import type {
  InboxAuthorizationFailureReason,
} from '@reqbug/core'

import type {
  PreparedCaptureRequest,
} from '../capture/prepare-capture-request.js'

import type {
  CapturePersistenceFailureReason,
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

export type CaptureReadFailureReason =
  | InboxAuthorizationFailureReason
  | 'request-not-found'

export interface ReadCaptureDetailInput {
  readonly inboxId: string
  readonly readToken: string
  readonly requestId: string
}

export type ReadCaptureDetailResult =
  | {
      readonly found: true
      readonly detail: CaptureDetail
    }
  | {
      readonly found: false
      readonly reason:
        CaptureReadFailureReason
    }

export type ReadCaptureBodyResult =
  | {
      readonly found: true
      readonly contentType: string | null
      readonly body: Uint8Array
    }
  | {
      readonly found: false
      readonly reason:
        CaptureReadFailureReason
    }

export interface ListInboxCapturesInput {
  readonly inboxId: string
  readonly readToken: string
  readonly before: number | null
  readonly limit: number
}

export type ListInboxCapturesResult =
  | {
      readonly found: true
      readonly captures:
        readonly CaptureSummary[]
      readonly nextBefore: number | null
    }
  | {
      readonly found: false
      readonly reason:
        InboxAuthorizationFailureReason
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
