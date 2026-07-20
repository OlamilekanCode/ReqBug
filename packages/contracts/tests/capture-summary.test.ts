import { describe, expect, it } from 'vitest'
import {
  CaptureSourceSchema,
  CaptureSummarySchema,
  ExtractedIdentifierSchema,
} from '../src'

const validSummary = {
  id: 'whr_test_capture',
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

describe('CaptureSummarySchema', () => {
  it('accepts a complete capture summary', () => {
    expect(CaptureSummarySchema.safeParse(validSummary).success).toBe(
      true,
    )
  })

  it('accepts a capture whose source is unknown', () => {
    const result = CaptureSummarySchema.safeParse({
      ...validSummary,
      source: {
        kind: 'unknown',
        confidence: null,
        evidence: [],
      },
    })

    expect(result.success).toBe(true)
  })

  it('rejects unknown sources that claim confidence', () => {
    const result = CaptureSourceSchema.safeParse({
      kind: 'unknown',
      confidence: 'high',
      evidence: [],
    })

    expect(result.success).toBe(false)
  })

  it('requires detected sources to provide evidence', () => {
    const result = CaptureSourceSchema.safeParse({
      kind: 'github',
      confidence: 'high',
      evidence: [],
    })

    expect(result.success).toBe(false)
  })

  it('rejects extracted identifiers containing control characters', () => {
    expect(
      ExtractedIdentifierSchema.safeParse('evt_safe\ninjected').success,
    ).toBe(false)
  })

  it('requires unique captures to be attempt 1 of 1', () => {
    const result = CaptureSummarySchema.safeParse({
      ...validSummary,
      retry: {
        ...validSummary.retry,
        groupSize: 2,
      },
    })

    expect(result.success).toBe(false)
  })

  it('requires probable retry groups to contain multiple captures', () => {
    const result = CaptureSummarySchema.safeParse({
      ...validSummary,
      retry: {
        groupKey: 'fingerprint:test',
        classification: 'probable',
        attempt: 1,
        groupSize: 1,
      },
    })

    expect(result.success).toBe(false)
  })

  it('rejects an attempt greater than its group size', () => {
    const result = CaptureSummarySchema.safeParse({
      ...validSummary,
      retry: {
        groupKey: 'github:delivery:test',
        classification: 'definite',
        attempt: 3,
        groupSize: 2,
      },
    })

    expect(result.success).toBe(false)
  })

  it('rejects unexpected contract properties', () => {
    const result = CaptureSummarySchema.safeParse({
      ...validSummary,
      secretInternalValue: 'must-not-leak',
    })

    expect(result.success).toBe(false)
  })
})