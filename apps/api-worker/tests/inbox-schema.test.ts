import {
  runInDurableObject,
} from 'cloudflare:test'

import {
  env,
} from 'cloudflare:workers'

import {
  describe,
  expect,
  it,
} from 'vitest'

import type {
  ReqBugInbox,
} from '../src/inbox-object/reqbug-inbox.js'

type TableNameRow = {
  name: string
} & Record<
  string,
  SqlStorageValue
>

function getInboxStub(
  name: string,
) {
  return env.INBOXES.getByName(
    name,
  )
}

describe('ReqBugInbox SQLite schema', () => {
  it('creates every inbox table', async () => {
    await runInDurableObject(
      getInboxStub('schema-tables'),
      (
        _instance: ReqBugInbox,
        state,
      ) => {
        const tableNames =
          state.storage.sql
            .exec<TableNameRow>(`
              SELECT name
              FROM sqlite_master
              WHERE name IN (
                'inbox_meta',
                'captured_requests',
                'live_tickets'
              )
              ORDER BY name
            `)
            .toArray()
            .map((row) => row.name)

        expect(tableNames).toEqual([
          'captured_requests',
          'inbox_meta',
          'live_tickets',
        ])
      },
    )
  })

  it('rejects invalid capability digests', async () => {
    await runInDurableObject(
      getInboxStub(
        'invalid-digest',
      ),
      (
        _instance: ReqBugInbox,
        state,
      ) => {
        expect(() => {
          state.storage.sql
            .exec(
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
                  1,
                  ?,
                  ?,
                  ?,
                  ?,
                  ?,
                  NULL,
                  0,
                  0,
                  1
                )
              `,
              'ibx_invalid',
              new Uint8Array(31)
                .buffer,
              new Uint8Array(32)
                .buffer,
              1_750_000_000_000,
              1_750_000_060_000,
            )
            .toArray()
        }).toThrow()
      },
    )
  })

  it('rejects unsupported HTTP methods', async () => {
    await runInDurableObject(
      getInboxStub(
        'invalid-method',
      ),
      (
        _instance: ReqBugInbox,
        state,
      ) => {
        expect(() => {
          state.storage.sql
            .exec(
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
                  'req_trace',
                  1,
                  ?,
                  'TRACE',
                  '/',
                  '[]',
                  '[]',
                  NULL,
                  ?,
                  0,
                  ?,
                  NULL,
                  NULL,
                  '[]',
                  NULL,
                  NULL,
                  'unique:req_trace',
                  'unique'
                )
              `,
              1_750_000_000_000,
              new ArrayBuffer(0),
              new Uint8Array(32)
                .buffer,
            )
            .toArray()
        }).toThrow()
      },
    )
  })
})