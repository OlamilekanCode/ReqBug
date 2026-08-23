export const INBOX_SCHEMA_VERSION = 1

export function initializeInboxSchema(
  sql: SqlStorage,
): void {
  sql.exec(`
    CREATE TABLE IF NOT EXISTS inbox_meta (
      singleton_id INTEGER PRIMARY KEY
        CHECK (singleton_id = 1),

      schema_version INTEGER NOT NULL
        CHECK (
          schema_version =
          ${INBOX_SCHEMA_VERSION}
        ),

      inbox_id TEXT NOT NULL UNIQUE,

      ingest_token_hash BLOB NOT NULL
        CHECK (
          length(ingest_token_hash) = 32
        ),

      read_token_hash BLOB NOT NULL
        CHECK (
          length(read_token_hash) = 32
        ),

      created_at_ms INTEGER NOT NULL
        CHECK (created_at_ms >= 0),

      expires_at_ms INTEGER NOT NULL
        CHECK (
          expires_at_ms > created_at_ms
        ),

      deleted_at_ms INTEGER
        CHECK (
          deleted_at_ms IS NULL OR
          deleted_at_ms >= created_at_ms
        ),

      stored_request_count INTEGER NOT NULL
        CHECK (
          stored_request_count >= 0
        ),

      lifetime_request_count INTEGER NOT NULL
        CHECK (
          lifetime_request_count >=
          stored_request_count
        ),

      next_sequence INTEGER NOT NULL
        CHECK (
          next_sequence =
          lifetime_request_count + 1
        )
    );

    CREATE TABLE IF NOT EXISTS captured_requests (
      id TEXT PRIMARY KEY,

      sequence INTEGER NOT NULL UNIQUE
        CHECK (sequence >= 1),

      received_at_ms INTEGER NOT NULL
        CHECK (received_at_ms >= 0),

      method TEXT NOT NULL
        CHECK (
          method IN (
            'GET',
            'HEAD',
            'POST',
            'PUT',
            'PATCH',
            'DELETE',
            'OPTIONS'
          )
        ),

      path TEXT NOT NULL,

      query_json TEXT NOT NULL
        CHECK (json_valid(query_json)),

      headers_json TEXT NOT NULL
        CHECK (json_valid(headers_json)),

      content_type TEXT,

      body BLOB NOT NULL,

      body_size INTEGER NOT NULL
        CHECK (
          body_size >= 0 AND
          body_size <= 262144 AND
          body_size = length(body)
        ),

      body_sha256 BLOB NOT NULL
        CHECK (
          length(body_sha256) = 32
        ),

      source_kind TEXT,

      source_confidence TEXT,

      source_evidence_json TEXT NOT NULL
        CHECK (
          json_valid(source_evidence_json)
        ),

      delivery_id TEXT,

      event_id TEXT,

      retry_group_key TEXT NOT NULL,

      retry_classification TEXT NOT NULL
        CHECK (
          retry_classification IN (
            'unique',
            'probable',
            'definite'
          )
        )
    );

    CREATE INDEX IF NOT EXISTS
      captured_requests_retry_group_sequence
      ON captured_requests (
        retry_group_key,
        sequence
      );

    CREATE TABLE IF NOT EXISTS live_tickets (
      ticket_hash BLOB PRIMARY KEY
        CHECK (
          length(ticket_hash) = 32
        ),

      expires_at_ms INTEGER NOT NULL
        CHECK (expires_at_ms >= 0)
    );

    CREATE INDEX IF NOT EXISTS
      live_tickets_expires_at
      ON live_tickets (
        expires_at_ms
      );
  `)
}