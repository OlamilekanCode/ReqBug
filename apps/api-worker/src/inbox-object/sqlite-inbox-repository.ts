import type {
  CaptureMethod,
  CapturedHeader,
  CapturedQueryEntry,
} from '@reqbug/contracts'

import {
  DEFAULT_INBOX_POLICY,
  InboxCoreError,
  assessCaptureAdmission,
  isValidStoredInboxState,
  type CaptureAdmissionFailureReason,
  type InboxLifecycleRepository,
  type StoredInbox,
} from '@reqbug/core'

import {
  initializeInboxSchema,
} from './schema.js'

interface InboxMetaRow
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

interface StoredRequestCountRow
  extends Record<
    string,
    SqlStorageValue
  > {
  stored_request_count: number
}

interface CaptureListRow
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

export interface StoredCaptureSummaryPage {
  readonly captures:
    readonly StoredCaptureSummary[]
  readonly nextBefore: number | null
}

export interface StoredCaptureInput {
  readonly inboxId: string
  readonly id: string
  readonly receivedAtMs: number
  readonly method: CaptureMethod
  readonly path: string
  readonly query:
    readonly CapturedQueryEntry[]
  readonly headers:
    readonly CapturedHeader[]
  readonly contentType: string | null
  readonly body: Uint8Array
  readonly bodySha256: Uint8Array
  readonly retryGroupKey: string
}

export type CapturePersistenceFailureReason =
  | CaptureAdmissionFailureReason
  | 'inbox-not-found'

export type CapturePersistenceResult =
  | {
      readonly stored: true
      readonly requestId: string
      readonly sequence: number
    }
  | {
      readonly stored: false
      readonly reason:
        CapturePersistenceFailureReason
    }

function toStoredInbox(
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

export class SqliteInboxRepository
  implements InboxLifecycleRepository {
  readonly storage:
    DurableObjectStorage

  readonly sql:
    SqlStorage

  private schemaInitialized = false

  constructor(
    storage: DurableObjectStorage,
  ) {
    this.storage = storage
    this.sql = storage.sql

    this.ensureSchema()
  }

  private ensureSchema(): void {
    if (this.schemaInitialized) {
      return
    }

    initializeInboxSchema(this.sql)

    this.schemaInitialized = true
  }

  private findMetaRow(
    inboxId?: string,
  ): InboxMetaRow | undefined {
    this.ensureSchema()

    const inboxIdFilter =
      inboxId ?? null

    return this.sql
      .exec<InboxMetaRow>(
        `
          SELECT
            schema_version,
            inbox_id,
            ingest_token_hash,
            read_token_hash,
            created_at_ms,
            expires_at_ms,
            deleted_at_ms,
            stored_request_count,
            lifetime_request_count,
            next_sequence
          FROM inbox_meta
          WHERE
            singleton_id = 1 AND
            (
              ? IS NULL OR
              inbox_id = ?
            )
        `,
        inboxIdFilter,
        inboxIdFilter,
      )
      .toArray()[0]
  }

  async create(
    inbox: StoredInbox,
  ): Promise<void> {
    this.ensureSchema()

    if (!isValidStoredInboxState(inbox)) {
      throw new InboxCoreError(
        'INVALID_INBOX_STATE',
        'The inbox state is invalid.',
      )
    }

    this.sql.exec(
      `
        INSERT INTO inbox_meta (
          singleton_id,
          schema_version,
          inbox_id,
          ingest_token_hash,
          read_token_hash,
          created_at_ms,
          expires_at_ms,
          deleted_at_ms,
          stored_request_count,
          lifetime_request_count,
          next_sequence
        ) VALUES (
          1,
          ?,
          ?,
          ?,
          ?,
          ?,
          ?,
          ?,
          ?,
          ?,
          ?
        )
      `,
      inbox.schemaVersion,
      inbox.inboxId,
      inbox.ingestTokenHash
        .slice()
        .buffer,
      inbox.readTokenHash
        .slice()
        .buffer,
      inbox.createdAtMs,
      inbox.expiresAtMs,
      inbox.deletedAtMs,
      inbox.storedRequestCount,
      inbox.lifetimeRequestCount,
      inbox.nextSequence,
    )
  }

  async findById(
    inboxId: string,
  ): Promise<StoredInbox | null> {
    const row =
      this.findMetaRow(inboxId)

    return row === undefined
      ? null
      : toStoredInbox(row)
  }

  async findCurrent(): Promise<StoredInbox | null> {
    const row = this.findMetaRow()

    return row === undefined
      ? null
      : toStoredInbox(row)
  }

  async insertCapture(
    input: StoredCaptureInput,
  ): Promise<CapturePersistenceResult> {
    this.ensureSchema()

    return this.storage
      .transactionSync(() => {
        const row =
          this.findMetaRow(
            input.inboxId,
          )

        if (row === undefined) {
          return {
            stored: false,
            reason: 'inbox-not-found',
          }
        }

        const inbox =
          toStoredInbox(row)

        const admission =
          assessCaptureAdmission({
            inbox,
            nowMs:
              input.receivedAtMs,
            bodyByteLength:
              input.body.byteLength,
            policy:
              DEFAULT_INBOX_POLICY,
          })

        if (!admission.admitted) {
          return {
            stored: false,
            reason:
              admission.reason,
          }
        }

        this.sql.exec(
          `
            INSERT INTO captured_requests (
              id,
              sequence,
              received_at_ms,
              method,
              path,
              query_json,
              headers_json,
              content_type,
              body,
              body_size,
              body_sha256,
              source_kind,
              source_confidence,
              source_evidence_json,
              delivery_id,
              event_id,
              retry_group_key,
              retry_classification
            ) VALUES (
              ?,
              ?,
              ?,
              ?,
              ?,
              ?,
              ?,
              ?,
              ?,
              ?,
              ?,
              NULL,
              NULL,
              '[]',
              NULL,
              NULL,
              ?,
              'unique'
            )
          `,
          input.id,
          admission.sequence,
          input.receivedAtMs,
          input.method,
          input.path,
          JSON.stringify(input.query),
          JSON.stringify(input.headers),
          input.contentType,
          input.body.slice().buffer,
          input.body.byteLength,
          input.bodySha256
            .slice()
            .buffer,
          input.retryGroupKey,
        )

        this.sql.exec(
          `
            UPDATE inbox_meta
            SET
              stored_request_count = ?,
              lifetime_request_count = ?,
              next_sequence = ?
            WHERE
              singleton_id = 1 AND
              inbox_id = ?
          `,
          admission.nextInbox
            .storedRequestCount,
          admission.nextInbox
            .lifetimeRequestCount,
          admission.nextInbox
            .nextSequence,
          input.inboxId,
        )

        return {
          stored: true,
          requestId: input.id,
          sequence:
            admission.sequence,
        }
      })
  }

    listCaptureSummaries({
    before,
    limit,
  }: {
    readonly before: number | null
    readonly limit: number
  }): StoredCaptureSummaryPage {
    this.ensureSchema()

    if (
      !Number.isInteger(limit) ||
      limit < 1 ||
      limit > 50
    ) {
      throw new Error(
        'Capture list limit is invalid.',
      )
    }

    if (
      before !== null &&
      (
        !Number.isInteger(before) ||
        before < 1
      )
    ) {
      throw new Error(
        'Capture list cursor is invalid.',
      )
    }

    const requestedRowCount =
      limit + 1

    const rows =
      this.sql
        .exec<CaptureListRow>(
          `
            WITH ranked_captures AS (
              SELECT
                id,
                sequence,
                received_at_ms,
                method,
                path,
                content_type,
                body_size,
                body_sha256,
                source_kind,
                source_confidence,
                source_evidence_json,
                delivery_id,
                event_id,
                retry_group_key,
                retry_classification,

                CASE
                  WHEN retry_classification =
                    'unique'
                  THEN 1
                  ELSE ROW_NUMBER() OVER (
                    PARTITION BY
                      retry_group_key
                    ORDER BY
                      sequence ASC
                  )
                END AS retry_attempt,

                CASE
                  WHEN retry_classification =
                    'unique'
                  THEN 1
                  ELSE COUNT(*) OVER (
                    PARTITION BY
                      retry_group_key
                  )
                END AS retry_group_size
              FROM captured_requests
            )
            SELECT
              id,
              sequence,
              received_at_ms,
              method,
              path,
              content_type,
              body_size,
              body_sha256,
              source_kind,
              source_confidence,
              source_evidence_json,
              delivery_id,
              event_id,
              retry_group_key,
              retry_classification,
              retry_attempt,
              retry_group_size
            FROM ranked_captures
            WHERE
              ? IS NULL OR
              sequence < ?
            ORDER BY
              sequence DESC
            LIMIT ?
          `,
          before,
          before,
          requestedRowCount,
        )
        .toArray()

    const hasNextPage =
      rows.length > limit

    const pageRows =
      rows.slice(0, limit)

    const captures =
      pageRows.map(
        (row): StoredCaptureSummary => ({
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
        }),
      )

    const lastCapture =
      captures.at(-1)

    return {
      captures,

      nextBefore:
        hasNextPage &&
        lastCapture !== undefined
          ? lastCapture.sequence
          : null,
    }
  }

  async clearRequestsById(
    inboxId: string,
  ): Promise<{
    clearedRequestCount: number
  }> {
    this.ensureSchema()

    return this.storage
      .transactionSync(() => {
        const row = this.sql
          .exec<StoredRequestCountRow>(
            `
              SELECT
                stored_request_count
              FROM inbox_meta
              WHERE
                singleton_id = 1 AND
                inbox_id = ?
            `,
            inboxId,
          )
          .toArray()[0]

        if (row === undefined) {
          throw new Error(
            'Inbox not found.',
          )
        }

        this.sql.exec(
          `
            DELETE FROM
              captured_requests
          `,
        )

        this.sql.exec(
          `
            UPDATE inbox_meta
            SET stored_request_count = 0
            WHERE
              singleton_id = 1 AND
              inbox_id = ?
          `,
          inboxId,
        )

        return {
          clearedRequestCount:
            row.stored_request_count,
        }
      })
  }

  async markDeleted({
    inboxId,
    deletedAtMs,
  }: {
    inboxId: string
    deletedAtMs: number
  }): Promise<void> {
    const existing =
      this.findMetaRow(inboxId)

    if (existing === undefined) {
      throw new Error(
        'Inbox not found.',
      )
    }

    this.sql.exec(
      `
        UPDATE inbox_meta
        SET deleted_at_ms = ?
        WHERE
          singleton_id = 1 AND
          inbox_id = ?
      `,
      deletedAtMs,
      inboxId,
    )
  }

  async deleteById(
    inboxId: string,
  ): Promise<void> {
    const existing =
      this.findMetaRow(inboxId)

    if (existing === undefined) {
      return
    }

    await this.storage.deleteAll()

    this.schemaInitialized = false
  }
}