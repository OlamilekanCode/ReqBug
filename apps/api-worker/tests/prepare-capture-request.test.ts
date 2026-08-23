import {
  MAX_CAPTURE_BODY_BYTES,
} from '@reqbug/contracts'

import {
  describe,
  expect,
  it,
} from 'vitest'

import {
  MAX_CAPTURE_TARGET_BYTES,
  prepareCaptureRequest,
} from '../src/capture/prepare-capture-request.js'

describe('prepareCaptureRequest', () => {
  it('preserves exact request-body bytes', async () => {
    const body =
      new Uint8Array([
        0,
        1,
        2,
        127,
        128,
        254,
        255,
      ])

    const result =
      await prepareCaptureRequest({
        request: new Request(
          'https://reqbug.test/h/id/token/events',
          {
            method: 'POST',
            headers: {
              'content-type':
                'application/octet-stream',
            },
            body,
          },
        ),

        capturedPath: '/events',
      })

    expect(result.prepared).toBe(true)

    if (!result.prepared) {
      throw new Error(
        'The request was unexpectedly rejected.',
      )
    }

    expect(result.capture.body).toEqual(body)
    expect(result.capture.path).toBe('/events')
    expect(result.capture.method).toBe('POST')
  })

  it('preserves repeated query entries in order', async () => {
    const result =
      await prepareCaptureRequest({
        request: new Request(
          'https://reqbug.test/h/id/token/events' +
          '?tag=first&tag=second',
          {
            method: 'GET',
          },
        ),

        capturedPath: '/events',
      })

    expect(result).toMatchObject({
      prepared: true,

      capture: {
        query: [
          {
            name: 'tag',
            value: 'first',
          },
          {
            name: 'tag',
            value: 'second',
          },
        ],
      },
    })
  })

  it('accepts a body at the exact limit', async () => {
    const body =
      new Uint8Array(
        MAX_CAPTURE_BODY_BYTES,
      ).fill(7)

    const result =
      await prepareCaptureRequest({
        request: new Request(
          'https://reqbug.test/h/id/token',
          {
            method: 'POST',
            body,
          },
        ),

        capturedPath: '/',
      })

    expect(result.prepared).toBe(true)

    if (result.prepared) {
      expect(
        result.capture.body.byteLength,
      ).toBe(MAX_CAPTURE_BODY_BYTES)
    }
  })

  it('rejects one byte above the body limit', async () => {
    const body =
      new Uint8Array(
        MAX_CAPTURE_BODY_BYTES + 1,
      )

    const result =
      await prepareCaptureRequest({
        request: new Request(
          'https://reqbug.test/h/id/token',
          {
            method: 'POST',
            body,
          },
        ),

        capturedPath: '/',
      })

    expect(result).toEqual({
      prepared: false,
      reason: 'body-too-large',
    })
  })

  it('rejects unsupported HTTP methods', async () => {
    const result =
      await prepareCaptureRequest({
        request: new Request(
          'https://reqbug.test/h/id/token',
          {
            method: 'PROPFIND',
          },
        ),

        capturedPath: '/',
      })

    expect(result).toEqual({
      prepared: false,
      reason: 'method-not-allowed',
    })
  })

  it('rejects an oversized captured target', async () => {
    const result =
      await prepareCaptureRequest({
        request: new Request(
          'https://reqbug.test/h/id/token',
          {
            method: 'GET',
          },
        ),

        capturedPath:
          '/' +
          'a'.repeat(
            MAX_CAPTURE_TARGET_BYTES,
          ),
      })

    expect(result).toEqual({
      prepared: false,
      reason: 'path-query-too-large',
    })
  })

  it('rejects more than 100 headers', async () => {
    const headers = new Headers()

    for (
      let index = 0;
      index < 101;
      index += 1
    ) {
      headers.set(
        `x-test-${index}`,
        'value',
      )
    }

    const result =
      await prepareCaptureRequest({
        request: new Request(
          'https://reqbug.test/h/id/token',
          {
            method: 'POST',
            headers,
          },
        ),

        capturedPath: '/',
      })

    expect(result).toEqual({
      prepared: false,
      reason: 'too-many-headers',
    })
  })

  it('rejects more than 100 query entries', async () => {
    const search =
      new URLSearchParams()

    for (
      let index = 0;
      index < 101;
      index += 1
    ) {
      search.append(
        'item',
        String(index),
      )
    }

    const result =
      await prepareCaptureRequest({
        request: new Request(
          `https://reqbug.test/h/id/token?${search}`,
          {
            method: 'GET',
          },
        ),

        capturedPath: '/',
      })

    expect(result).toEqual({
      prepared: false,
      reason:
        'too-many-query-entries',
    })
  })

  it('normalizes the dedicated content type while preserving its header', async () => {
    const result =
      await prepareCaptureRequest({
        request: new Request(
          'https://reqbug.test/h/id/token',
          {
            method: 'POST',

            headers: {
              'content-type':
                'Application/JSON; Charset=UTF-8',
            },

            body: '{}',
          },
        ),

        capturedPath: '/',
      })

    expect(result.prepared).toBe(true)

    if (!result.prepared) {
      throw new Error(
        'The request was unexpectedly rejected.',
      )
    }

    expect(
      result.capture.contentType,
    ).toBe('application/json')

    expect(
      result.capture.headers,
    ).toContainEqual({
      name: 'content-type',
      value:
        'Application/JSON; Charset=UTF-8',
    })
  })
})