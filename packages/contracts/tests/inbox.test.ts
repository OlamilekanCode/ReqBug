import { describe, expect, it } from 'vitest'
import {
  ApiErrorResponseSchema,
  CaptureAcceptedResponseSchema,
  CreateInboxResponseSchema,
  InboxMetadataResponseSchema,
  LiveTicketResponseSchema,
  MAX_CAPTURE_BODY_BYTES,
  MAX_INBOX_CAPTURE_COUNT,
} from '../src'

const inboxId = 'ibx_test_123'
const readToken = 'a'.repeat(43)
const ingestToken = 'b'.repeat(43)

const validCreateResponse = {
  data: {
    inboxId,
    ingestUrl:
      `https://reqbug.test/h/${inboxId}/${ingestToken}`,
    dashboardUrl:
      `https://reqbug.test/inboxes/${inboxId}` +
      `#access=${readToken}`,
    readToken,
    createdAt:
      '2026-07-20T12:00:00.000Z',
    expiresAt:
      '2026-07-21T12:00:00.000Z',
    limits: {
      requests: MAX_INBOX_CAPTURE_COUNT,
      bodyBytes: MAX_CAPTURE_BODY_BYTES,
    },
  },
}

describe('CreateInboxResponseSchema', () => {
  it('accepts a complete inbox creation response', () => {
    expect(
      CreateInboxResponseSchema.safeParse(
        validCreateResponse,
      ).success,
    ).toBe(true)
  })

  it('rejects a short read capability', () => {
    const result =
      CreateInboxResponseSchema.safeParse({
        data: {
          ...validCreateResponse.data,
          readToken: 'short',
        },
      })

    expect(result.success).toBe(false)
  })

  it('rejects a dashboard URL with another capability', () => {
    const result =
      CreateInboxResponseSchema.safeParse({
        data: {
          ...validCreateResponse.data,
          dashboardUrl:
            `https://reqbug.test/inboxes/${inboxId}` +
            `#access=${'c'.repeat(43)}`,
        },
      })

    expect(result.success).toBe(false)
  })

  it('rejects a lifetime longer than 24 hours', () => {
    const result =
      CreateInboxResponseSchema.safeParse({
        data: {
          ...validCreateResponse.data,
          expiresAt:
            '2026-07-21T12:00:00.001Z',
        },
      })

    expect(result.success).toBe(false)
  })

  it('rejects cross-origin dashboard and ingest URLs', () => {
    const result =
      CreateInboxResponseSchema.safeParse({
        data: {
          ...validCreateResponse.data,
          dashboardUrl:
            `https://other.test/inboxes/${inboxId}` +
            `#access=${readToken}`,
        },
      })

    expect(result.success).toBe(false)
  })

  it('allows HTTP for local loopback development', () => {
    const result =
      CreateInboxResponseSchema.safeParse({
        data: {
          ...validCreateResponse.data,

          ingestUrl:
            `http://127.0.0.1:8787/h/` +
            `${inboxId}/${ingestToken}`,

          dashboardUrl:
            `http://127.0.0.1:8787/inboxes/` +
            `${inboxId}` +
            `#access=${readToken}`,
        },
      })

    expect(result.success).toBe(true)
  })

  it('rejects HTTP for a non-local host', () => {
    const result =
      CreateInboxResponseSchema.safeParse({
        data: {
          ...validCreateResponse.data,

          ingestUrl:
            `http://reqbug.example/h/` +
            `${inboxId}/${ingestToken}`,

          dashboardUrl:
            `http://reqbug.example/inboxes/` +
            `${inboxId}` +
            `#access=${readToken}`,
        },
      })

    expect(result.success).toBe(false)
  })
})

describe('InboxMetadataResponseSchema', () => {
  const validMetadata = {
    data: {
      inboxId,
      createdAt:
        '2026-07-20T12:00:00.000Z',
      expiresAt:
        '2026-07-21T12:00:00.000Z',
      status: 'active',
      storedRequestCount: 3,
      lifetimeRequestCount: 5,
      requestLimit: MAX_INBOX_CAPTURE_COUNT,
      bodyByteLimit: MAX_CAPTURE_BODY_BYTES,
    },
  }

  it('accepts complete inbox metadata', () => {
    expect(
      InboxMetadataResponseSchema.safeParse(
        validMetadata,
      ).success,
    ).toBe(true)
  })

  it('rejects a stored count greater than the lifetime count', () => {
    const result =
      InboxMetadataResponseSchema.safeParse({
        data: {
          ...validMetadata.data,
          storedRequestCount: 6,
        },
      })

    expect(result.success).toBe(false)
  })

  it('rejects altered public quota values', () => {
    const result =
      InboxMetadataResponseSchema.safeParse({
        data: {
          ...validMetadata.data,
          requestLimit: 100,
        },
      })

    expect(result.success).toBe(false)
  })
})

describe('remaining inbox responses', () => {
  it('accepts a live-ticket response', () => {
    expect(
      LiveTicketResponseSchema.safeParse({
        data: {
          ticket: 'c'.repeat(43),
          expiresAt:
            '2026-07-20T12:00:30.000Z',
        },
      }).success,
    ).toBe(true)
  })

  it('accepts a durable capture acknowledgement', () => {
    expect(
      CaptureAcceptedResponseSchema.safeParse({
        received: true,
        requestId: 'whr_test',
      }).success,
    ).toBe(true)
  })

  it('accepts a safe API error envelope', () => {
    expect(
      ApiErrorResponseSchema.safeParse({
        error: {
          code: 'INBOX_EXPIRED',
          message:
            'This inbox has expired.',
          requestId: 'req_observable_123',
        },
      }).success,
    ).toBe(true)
  })

  it('rejects unsafe API error codes', () => {
    expect(
      ApiErrorResponseSchema.safeParse({
        error: {
          code: 'inbox-expired',
          message:
            'This inbox has expired.',
          requestId: 'req_observable_123',
        },
      }).success,
    ).toBe(false)
  })
})