import {
  InboxCoreError,
  isValidStoredInboxState,
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