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

import {
  toStoredCaptureBody,
  toStoredCaptureDetail,
  toStoredCaptureSummary,
  toStoredInbox,
  type CaptureBodyRow,
  type CaptureDetailRow,
  type CaptureListRow,
  type InboxMetaRow,
  type StoredCaptureBody,
  type StoredCaptureDetail,
  type StoredCaptureSummary,
  type StoredRequestCountRow,
} from './sqlite-row-mappers.js'

export type {
  StoredCaptureBody,
  StoredCaptureDetail,
  StoredCaptureSummary,
} from './sqlite-row-mappers.js'

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
        toStoredCaptureSummary,
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

    findCaptureDetail(
    requestId: string,
  ): StoredCaptureDetail | null {
    this.ensureSchema()

    const row =
      this.sql
        .exec<CaptureDetailRow>(
          `
            WITH ranked_captures AS (
              SELECT
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
              *
            FROM ranked_captures
            WHERE id = ?
            LIMIT 1
          `,
          requestId,
        )
        .toArray()[0]

    if (row === undefined) {
      return null
    }

    return toStoredCaptureDetail(row)
  }

  findCaptureBody(
    requestId: string,
  ): StoredCaptureBody | null {
    this.ensureSchema()

    const row =
      this.sql
        .exec<CaptureBodyRow>(
          `
            SELECT
              content_type,
              body
            FROM captured_requests
            WHERE id = ?
            LIMIT 1
          `,
          requestId,
        )
        .toArray()[0]

    if (row === undefined) {
      return null
    }

    return toStoredCaptureBody(row)
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
