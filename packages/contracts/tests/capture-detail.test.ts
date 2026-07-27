import { describe, expect, it } from 'vitest'
import {
  CaptureBodyViewSchema,
  CaptureDetailSchema,
} from '../src'

const bodyDownloadUrl =
  '/api/v1/inboxes/ibx_test/requests/whr_test/body'

const validDetail = {
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
  query: [
    { name: 'mode', value: 'test' },
    { name: 'mode', value: 'debug' },
  ],
  headers: [
    { name: 'content-type', value: 'application/json' },
    { name: 'x-example', value: 'first' },
    { name: 'x-example', value: 'second' },
  ],
  body: {
    encoding: 'utf-8',
    text: '{"id":"evt_test"}',
    json: { id: 'evt_test' },
    jsonDerived: true,
    downloadUrl: bodyDownloadUrl,
  },
}

describe('CaptureDetailSchema', () => {
  it('accepts a complete JSON capture detail', () => {
    expect(CaptureDetailSchema.safeParse(validDetail).success).toBe(true)
  })

  it('accepts a non-JSON UTF-8 body', () => {
    const result = CaptureDetailSchema.safeParse({
      ...validDetail,
      contentType: 'text/plain',
      body: {
        encoding: 'utf-8',
        text: 'plain webhook body',
        jsonDerived: false,
        downloadUrl: bodyDownloadUrl,
      },
    })

    expect(result.success).toBe(true)
  })

  it('accepts a binary body without derived text', () => {
    const result = CaptureDetailSchema.safeParse({
      ...validDetail,
      contentType: 'application/octet-stream',
      body: {
        encoding: 'binary',
        downloadUrl: bodyDownloadUrl,
      },
    })

    expect(result.success).toBe(true)
  })

  it('rejects derived text attached to a binary body', () => {
    const result = CaptureBodyViewSchema.safeParse({
      encoding: 'binary',
      text: 'this must not be present',
      downloadUrl: bodyDownloadUrl,
    })

    expect(result.success).toBe(false)
  })

  it('rejects non-JSON values in the derived JSON field', () => {
    const result = CaptureBodyViewSchema.safeParse({
      encoding: 'utf-8',
      text: '2026-07-20',
      json: new Date('2026-07-20T00:00:00.000Z'),
      jsonDerived: true,
      downloadUrl: bodyDownloadUrl,
    })

    expect(result.success).toBe(false)
  })

  it('requires JSON when jsonDerived is true', () => {
    const result = CaptureBodyViewSchema.safeParse({
      encoding: 'utf-8',
      text: '{"valid":true}',
      jsonDerived: true,
      downloadUrl: bodyDownloadUrl,
    })

    expect(result.success).toBe(false)
  })

  it('rejects JSON when jsonDerived is false', () => {
    const result = CaptureBodyViewSchema.safeParse({
      encoding: 'utf-8',
      text: '{"valid":true}',
      json: { valid: true },
      jsonDerived: false,
      downloadUrl: bodyDownloadUrl,
    })

    expect(result.success).toBe(false)
  })

  it('rejects external body-download URLs', () => {
    const result = CaptureBodyViewSchema.safeParse({
      encoding: 'binary',
      downloadUrl: 'https://attacker.example/body',
    })

    expect(result.success).toBe(false)
  })

  it('preserves repeated headers and query parameters', () => {
    const result = CaptureDetailSchema.parse(validDetail)

    expect(result.query).toEqual(validDetail.query)
    expect(result.headers).toEqual(validDetail.headers)
  })
})