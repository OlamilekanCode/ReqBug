import { describe, expect, it } from 'vitest'
import {
  CaptureListResponseSchema,
  MAX_CAPTURE_BODY_BYTES,
  MAX_INBOX_CAPTURE_COUNT,
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
  it('accepts an empty inbox', () => {
    expect(
      CaptureListResponseSchema.safeParse({
        requests: [],
      }).success,
    ).toBe(true)
  })

  it('accepts the maximum retained captures', () => {
    const requests = Array.from(
      { length: MAX_INBOX_CAPTURE_COUNT },
      (_, index) => ({
        ...validSummary,
        id: `whr_${index + 1}`,
        sequence: index + 1,
      }),
    )

    expect(
      CaptureListResponseSchema.safeParse({
        requests,
      }).success,
    ).toBe(true)
  })

  it('rejects more than the inbox capture limit', () => {
    const requests = Array.from(
      { length: MAX_INBOX_CAPTURE_COUNT + 1 },
      (_, index) => ({
        ...validSummary,
        id: `whr_${index + 1}`,
        sequence: index + 1,
      }),
    )

    expect(
      CaptureListResponseSchema.safeParse({
        requests,
      }).success,
    ).toBe(false)
  })

  it('rejects unexpected response properties', () => {
    expect(
      CaptureListResponseSchema.safeParse({
        requests: [validSummary],
        internalStorageKey: 'must-not-leak',
      }).success,
    ).toBe(false)
  })
})

describe('RequestCreatedEventSchema', () => {
  it('accepts a request.created event', () => {
    expect(
      RequestCreatedEventSchema.safeParse({
        type: 'request.created',
        data: validSummary,
      }).success,
    ).toBe(true)
  })

  it('rejects an unknown event type', () => {
    expect(
      RequestCreatedEventSchema.safeParse({
        type: 'request.deleted',
        data: validSummary,
      }).success,
    ).toBe(false)
  })

  it('validates the embedded capture summary', () => {
    expect(
      RequestCreatedEventSchema.safeParse({
        type: 'request.created',
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
        type: 'request.created',
        data: validSummary,
        secret: 'must-not-leak',
      }).success,
    ).toBe(false)
  })
})