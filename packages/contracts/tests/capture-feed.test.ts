import { describe, expect, it } from 'vitest'
import {
  CaptureListResponseSchema,
  LIVE_PROTOCOL_VERSION,
  MAX_CAPTURE_BODY_BYTES,
  MAX_CAPTURE_LIST_PAGE_SIZE,
  RequestCreatedEventSchema,
} from '../src'

const validSummary = {
  id: 'whr_test',
  sequence: 1,
  receivedAt: '2026-07-20T12:00:00.000Z',
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

describe('CaptureListResponseSchema', () => {
  it('accepts an empty final page', () => {
    expect(
      CaptureListResponseSchema.safeParse({
        data: [],
        page: {
          nextBefore: null,
        },
      }).success,
    ).toBe(true)
  })

  it('accepts the maximum list page size', () => {
    const data = Array.from(
      { length: MAX_CAPTURE_LIST_PAGE_SIZE },
      (_, index) => ({
        ...validSummary,
        id: `whr_${index + 1}`,
        sequence: index + 1,
      }),
    )

    expect(
      CaptureListResponseSchema.safeParse({
        data,
        page: {
          nextBefore: 1,
        },
      }).success,
    ).toBe(true)
  })

  it('rejects more than the maximum page size', () => {
    const data = Array.from(
      { length: MAX_CAPTURE_LIST_PAGE_SIZE + 1 },
      (_, index) => ({
        ...validSummary,
        id: `whr_${index + 1}`,
        sequence: index + 1,
      }),
    )

    expect(
      CaptureListResponseSchema.safeParse({
        data,
        page: {
          nextBefore: null,
        },
      }).success,
    ).toBe(false)
  })

  it('rejects a non-positive pagination cursor', () => {
    expect(
      CaptureListResponseSchema.safeParse({
        data: [validSummary],
        page: {
          nextBefore: 0,
        },
      }).success,
    ).toBe(false)
  })

  it('rejects unexpected response properties', () => {
    expect(
      CaptureListResponseSchema.safeParse({
        data: [validSummary],
        page: {
          nextBefore: null,
        },
        internalStorageKey: 'must-not-leak',
      }).success,
    ).toBe(false)
  })
})

describe('RequestCreatedEventSchema', () => {
  const validEvent = {
    version: LIVE_PROTOCOL_VERSION,
    type: 'request.created',
    occurredAt: '2026-07-20T12:00:01.000Z',
    data: validSummary,
  }

  it('accepts a versioned request.created event', () => {
    expect(
      RequestCreatedEventSchema.safeParse(validEvent).success,
    ).toBe(true)
  })

  it('rejects an unsupported protocol version', () => {
    expect(
      RequestCreatedEventSchema.safeParse({
        ...validEvent,
        version: 2,
      }).success,
    ).toBe(false)
  })

  it('rejects an unknown event type', () => {
    expect(
      RequestCreatedEventSchema.safeParse({
        ...validEvent,
        type: 'request.deleted',
      }).success,
    ).toBe(false)
  })

  it('validates the embedded capture summary', () => {
    expect(
      RequestCreatedEventSchema.safeParse({
        ...validEvent,
        data: {
          ...validSummary,
          bodyBytes: MAX_CAPTURE_BODY_BYTES + 1,
        },
      }).success,
    ).toBe(false)
  })

  it('rejects unexpected event properties', () => {
    expect(
      RequestCreatedEventSchema.safeParse({
        ...validEvent,
        secret: 'must-not-leak',
      }).success,
    ).toBe(false)
  })
})