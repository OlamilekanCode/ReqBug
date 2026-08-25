import {
  CapturedHeaderSchema,
  CapturedQueryEntrySchema,
} from '@reqbug/contracts'

import {
  InboxCoreError,
  isValidStoredInboxState,
  type StoredInbox,
} from '@reqbug/core'

import type {
  CapturedHeader,
  CapturedQueryEntry,
} from '@reqbug/contracts'

import type {
  CaptureMethod,
} from '@reqbug/contracts'

export interface InboxMetaRow
  extends Record<
    string,
    SqlStorageValue
  > {
  schema_version: number
  inbox_id: string
  ingest_token_hash: ArrayBuffer
  read_token_hash: ArrayBuffer
  created_at_ms: number
  expires_at_ms: number
  deleted_at_ms: number | null
  stored_request_count: number
  lifetime_request_count: number
  next_sequence: number
}

export interface StoredRequestCountRow
  extends Record<
    string,
    SqlStorageValue
  > {
  stored_request_count: number
}

export interface CaptureListRow
  extends Record<
    string,
    SqlStorageValue
  > {
  id: string
  sequence: number
  received_at_ms: number
  method: string
  path: string
  content_type: string | null
  body_size: number
  body_sha256: ArrayBuffer
  source_kind: string | null
  source_confidence: string | null
  source_evidence_json: string
  delivery_id: string | null
  event_id: string | null
  retry_group_key: string
  retry_classification: string
  retry_attempt: number
  retry_group_size: number
}

export interface CaptureDetailRow
  extends CaptureListRow {
  query_json: string
  headers_json: string
  body: ArrayBuffer
}

export interface CaptureBodyRow
  extends Record<
    string,
    SqlStorageValue
  > {
  content_type: string | null
  body: ArrayBuffer
}

export interface StoredCaptureSummary {
  readonly id: string
  readonly sequence: number
  readonly receivedAtMs: number
  readonly method: CaptureMethod
  readonly path: string
  readonly contentType: string | null
  readonly bodyBytes: number
  readonly bodySha256: Uint8Array
  readonly sourceKind: string | null
  readonly sourceConfidence: string | null
  readonly sourceEvidence: unknown
  readonly deliveryId: string | null
  readonly eventId: string | null

  readonly retry: {
    readonly groupKey: string
    readonly classification: string
    readonly attempt: number
    readonly groupSize: number
  }
}

export interface StoredCaptureDetail
  extends StoredCaptureSummary {
  readonly query:
    readonly CapturedQueryEntry[]
  readonly headers:
    readonly CapturedHeader[]
  readonly body: Uint8Array
}

export interface StoredCaptureBody {
  readonly contentType: string | null
  readonly body: Uint8Array
}

export function toStoredInbox(
  row: InboxMetaRow,
): StoredInbox {
  const inbox: StoredInbox = {
    schemaVersion: 1,
    inboxId: row.inbox_id,

    ingestTokenHash:
      new Uint8Array(
        row.ingest_token_hash,
      ).slice(),

    readTokenHash:
      new Uint8Array(
        row.read_token_hash,
      ).slice(),

    createdAtMs:
      row.created_at_ms,

    expiresAtMs:
      row.expires_at_ms,

    deletedAtMs:
      row.deleted_at_ms,

    storedRequestCount:
      row.stored_request_count,

    lifetimeRequestCount:
      row.lifetime_request_count,

    nextSequence:
      row.next_sequence,
  }

  if (!isValidStoredInboxState(inbox)) {
    throw new InboxCoreError(
      'INVALID_INBOX_STATE',
      'The stored inbox state is invalid.',
    )
  }

  return inbox
}

export function toStoredCaptureSummary(
  row: CaptureListRow,
): StoredCaptureSummary {
  return {
    id: row.id,
    sequence: row.sequence,
    receivedAtMs:
      row.received_at_ms,

    method:
      row.method as CaptureMethod,

    path: row.path,

    contentType:
      row.content_type,

    bodyBytes:
      row.body_size,

    bodySha256:
      new Uint8Array(
        row.body_sha256,
      ).slice(),

    sourceKind:
      row.source_kind,

    sourceConfidence:
      row.source_confidence,

    sourceEvidence:
      JSON.parse(
        row.source_evidence_json,
      ),

    deliveryId:
      row.delivery_id,

    eventId:
      row.event_id,

    retry: {
      groupKey:
        row.retry_group_key,

      classification:
        row.retry_classification,

      attempt:
        row.retry_attempt,

      groupSize:
        row.retry_group_size,
    },
  }
}

export function toStoredCaptureDetail(
  row: CaptureDetailRow,
): StoredCaptureDetail {
  const query =
    CapturedQueryEntrySchema
      .array()
      .parse(
        JSON.parse(row.query_json),
      )

  const headers =
    CapturedHeaderSchema
      .array()
      .parse(
        JSON.parse(row.headers_json),
      )

  return {
    ...toStoredCaptureSummary(row),
    query,
    headers,

    body:
      new Uint8Array(
        row.body,
      ).slice(),
  }
}

export function toStoredCaptureBody(
  row: CaptureBodyRow,
): StoredCaptureBody {
  return {
    contentType:
      row.content_type,

    body:
      new Uint8Array(
        row.body,
      ).slice(),
  }
}
