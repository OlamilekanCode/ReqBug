
import { describe, expect, it } from 'vitest'
import {
  BodyByteLengthSchema,
  BodySha256Schema,
  CAPTURE_METHODS,
  CaptureMethodSchema,
  CapturedHeaderSchema,
  CapturedPathSchema,
  CapturedQueryEntrySchema,
  MAX_CAPTURE_BODY_BYTES,
  UtcDateTimeSchema,
} from '../src'

describe('CaptureMethodSchema', () => {
  it('accepts every approved webhook method', () => {
    for (const method of CAPTURE_METHODS) {
      expect(CaptureMethodSchema.safeParse(method).success).toBe(true)
    }
  })

  it('rejects CONNECT and TRACE', () => {
    expect(CaptureMethodSchema.safeParse('CONNECT').success).toBe(false)
    expect(CaptureMethodSchema.safeParse('TRACE').success).toBe(false)
  })
})

describe('CapturedHeaderSchema', () => {
  it('accepts a normalized header', () => {
    expect(
      CapturedHeaderSchema.safeParse({
        name: 'content-type',
        value: 'application/json',
      }).success,
    ).toBe(true)
  })

  it('rejects non-normalized header names', () => {
    expect(
      CapturedHeaderSchema.safeParse({
        name: 'Content-Type',
        value: 'application/json',
      }).success,
    ).toBe(false)
  })

  it('rejects header values containing line breaks', () => {
    expect(
      CapturedHeaderSchema.safeParse({
        name: 'x-example',
        value: 'safe\r\ninjected-header: value',
      }).success,
    ).toBe(false)
  })
})

describe('CapturedQueryEntrySchema', () => {
  it('allows repeated query names without losing their order', () => {
    const entries = [
      { name: 'tag', value: 'first' },
      { name: 'tag', value: 'second' },
    ]

    const result = entries.map((entry) =>
      CapturedQueryEntrySchema.parse(entry),
    )

    expect(result).toEqual(entries)
  })
})

describe('CapturedPathSchema', () => {
  it('accepts a captured path and rejects a path without a leading slash', () => {
    expect(CapturedPathSchema.safeParse('/stripe/events').success).toBe(true)
    expect(CapturedPathSchema.safeParse('stripe/events').success).toBe(false)
  })
})

describe('body metadata schemas', () => {
  it('accepts the body limit and rejects one byte above it', () => {
    expect(
      BodyByteLengthSchema.safeParse(MAX_CAPTURE_BODY_BYTES).success,
    ).toBe(true)

    expect(
      BodyByteLengthSchema.safeParse(MAX_CAPTURE_BODY_BYTES + 1).success,
    ).toBe(false)
  })

  it('accepts only an unpadded SHA-256 Base64URL digest', () => {
    expect(BodySha256Schema.safeParse('a'.repeat(43)).success).toBe(true)
    expect(BodySha256Schema.safeParse('a'.repeat(42)).success).toBe(false)
    expect(BodySha256Schema.safeParse(`${'a'.repeat(43)}=`).success).toBe(
      false,
    )
  })
})

describe('UtcDateTimeSchema', () => {
  it('accepts a UTC ISO timestamp', () => {
    expect(
      UtcDateTimeSchema.safeParse('2026-07-20T12:00:00.000Z').success,
    ).toBe(true)
  })
})