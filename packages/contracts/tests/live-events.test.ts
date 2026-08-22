import { describe, expect, it } from 'vitest'
import {
  LIVE_PROTOCOL_VERSION,
  LiveEventSchema,
} from '../src'

const occurredAt =
  '2026-07-20T12:05:00.000Z'

const validSummary = {
  id: 'whr_test',
  sequence: 1,
  receivedAt: occurredAt,
  method: 'POST',
  path: '/stripe/events',
  contentType: 'application/json',
  bodyBytes: 18,
  bodySha256: 'a'.repeat(43),
  source: {
    kind: 'stripe',
    confidence: 'high',
    evidence: ['stripe-signature header'],
  },
  deliveryId: null,
  eventId: 'evt_test',
  retry: {
    groupKey: 'stripe:event:evt_test',
    classification: 'unique',
    attempt: 1,
    groupSize: 1,
  },
}

describe('LiveEventSchema', () => {
  it('accepts session.ready', () => {
    expect(
      LiveEventSchema.safeParse({
        version: LIVE_PROTOCOL_VERSION,
        type: 'session.ready',
        occurredAt,
        data: {
          inboxId: 'ibx_test',
          expiresAt:
            '2026-07-21T12:00:00.000Z',
          lastSequence: 4,
        },
      }).success,
    ).toBe(true)
  })

  it('accepts request.created', () => {
    expect(
      LiveEventSchema.safeParse({
        version: LIVE_PROTOCOL_VERSION,
        type: 'request.created',
        occurredAt,
        data: validSummary,
      }).success,
    ).toBe(true)
  })

  it('accepts inbox.cleared', () => {
    expect(
      LiveEventSchema.safeParse({
        version: LIVE_PROTOCOL_VERSION,
        type: 'inbox.cleared',
        occurredAt,
        data: {
          clearedAt: occurredAt,
        },
      }).success,
    ).toBe(true)
  })

  it('accepts inbox.expiring', () => {
    expect(
      LiveEventSchema.safeParse({
        version: LIVE_PROTOCOL_VERSION,
        type: 'inbox.expiring',
        occurredAt,
        data: {
          expiresAt:
            '2026-07-20T12:10:00.000Z',
        },
      }).success,
    ).toBe(true)
  })

  it('accepts inbox.deleted', () => {
    expect(
      LiveEventSchema.safeParse({
        version: LIVE_PROTOCOL_VERSION,
        type: 'inbox.deleted',
        occurredAt,
        data: {
          deletedAt: occurredAt,
        },
      }).success,
    ).toBe(true)
  })

  it('accepts session.error', () => {
    expect(
      LiveEventSchema.safeParse({
        version: LIVE_PROTOCOL_VERSION,
        type: 'session.error',
        occurredAt,
        data: {
          code: 'LIVE_CONNECTION_ERROR',
          message:
            'The live connection encountered an error.',
        },
      }).success,
    ).toBe(true)
  })

  it('rejects unknown event types', () => {
    expect(
      LiveEventSchema.safeParse({
        version: LIVE_PROTOCOL_VERSION,
        type: 'unknown.event',
        occurredAt,
        data: {},
      }).success,
    ).toBe(false)
  })

  it('rejects unsupported protocol versions', () => {
    expect(
      LiveEventSchema.safeParse({
        version: 2,
        type: 'inbox.cleared',
        occurredAt,
        data: {
          clearedAt: occurredAt,
        },
      }).success,
    ).toBe(false)
  })

  it('validates request.created summaries', () => {
    expect(
      LiveEventSchema.safeParse({
        version: LIVE_PROTOCOL_VERSION,
        type: 'request.created',
        occurredAt,
        data: {
          ...validSummary,
          sequence: 0,
        },
      }).success,
    ).toBe(false)
  })

  it('rejects unexpected envelope fields', () => {
    expect(
      LiveEventSchema.safeParse({
        version: LIVE_PROTOCOL_VERSION,
        type: 'inbox.deleted',
        occurredAt,
        data: {
          deletedAt: occurredAt,
        },
        secret: 'must-not-leak',
      }).success,
    ).toBe(false)
  })
})