import {
  CaptureBodyViewSchema,
  type CaptureBodyView,
} from '@reqbug/contracts'

import type {
  PreparedCaptureRequest,
} from '../capture/prepare-capture-request.js'

import {
  bytesToBase64Url,
  sha256Bytes,
} from '../platform/crypto.js'

const textEncoder = new TextEncoder()

const fatalUtf8Decoder =
  new TextDecoder(
    'utf-8',
    {
      fatal: true,
      ignoreBOM: false,
    },
  )

export async function createRetryGroupKey(
  capture: PreparedCaptureRequest,
  bodySha256: Uint8Array,
): Promise<string> {
  const fingerprintSource =
    textEncoder.encode(
      [
        capture.method,
        capture.path,
        bytesToBase64Url(
          bodySha256,
        ),
      ].join('\n'),
    )

  const fingerprint =
    await sha256Bytes(
      fingerprintSource,
    )

  return (
    'fingerprint:' +
    bytesToBase64Url(fingerprint)
  )
}

export function createCaptureBodyView(
  body: Uint8Array,
  downloadUrl: string,
): CaptureBodyView {
  let text: string

  try {
    text =
      fatalUtf8Decoder.decode(body)
  } catch {
    return CaptureBodyViewSchema.parse({
      encoding: 'binary',
      downloadUrl,
    })
  }

  try {
    const json: unknown =
      JSON.parse(text)

    return CaptureBodyViewSchema.parse({
      encoding: 'utf-8',
      text,
      json,
      jsonDerived: true,
      downloadUrl,
    })
  } catch {
    return CaptureBodyViewSchema.parse({
      encoding: 'utf-8',
      text,
      jsonDerived: false,
      downloadUrl,
    })
  }
}
