import {
  CaptureMethodSchema,
  CapturedHeaderSchema,
  CapturedPathSchema,
  CapturedQueryEntrySchema,
  MAX_CAPTURE_BODY_BYTES,
  MAX_CAPTURE_HEADER_COUNT,
  MAX_CAPTURE_QUERY_ENTRY_COUNT,
  type CaptureMethod,
  type CapturedHeader,
  type CapturedQueryEntry,
} from '@reqbug/contracts'

export const MAX_CAPTURE_TARGET_BYTES =
  8 * 1024

export type CaptureRequestPreparationFailureReason =
  | 'method-not-allowed'
  | 'path-query-too-large'
  | 'too-many-headers'
  | 'too-many-query-entries'
  | 'body-too-large'
  | 'invalid-request'

export interface PreparedCaptureRequest {
  readonly method: CaptureMethod
  readonly path: string
  readonly query:
    readonly CapturedQueryEntry[]
  readonly headers:
    readonly CapturedHeader[]
  readonly contentType: string | null
  readonly body: Uint8Array
}

export type PrepareCaptureRequestResult =
  | {
      readonly prepared: true
      readonly capture:
        PreparedCaptureRequest
    }
  | {
      readonly prepared: false
      readonly reason:
        CaptureRequestPreparationFailureReason
    }

const textEncoder = new TextEncoder()

async function readBodyWithLimit(
  body: ReadableStream<Uint8Array> | null,
): Promise<
  | {
      readonly accepted: true
      readonly bytes: Uint8Array
    }
  | {
      readonly accepted: false
    }
> {
  if (body === null) {
    return {
      accepted: true,
      bytes: new Uint8Array(),
    }
  }

  const reader = body.getReader()

  const chunks: Uint8Array[] = []
  let totalBytes = 0

  try {
    while (true) {
      const result = await reader.read()

      if (result.done) {
        break
      }

      totalBytes +=
        result.value.byteLength

      if (
        totalBytes >
        MAX_CAPTURE_BODY_BYTES
      ) {
        await reader
          .cancel()
          .catch(() => undefined)

        return {
          accepted: false,
        }
      }

      chunks.push(result.value)
    }
  } finally {
    reader.releaseLock()
  }

  const bytes =
    new Uint8Array(totalBytes)

  let offset = 0

  for (const chunk of chunks) {
    bytes.set(chunk, offset)
    offset += chunk.byteLength
  }

  return {
    accepted: true,
    bytes,
  }
}

export async function prepareCaptureRequest({
  request,
  capturedPath,
}: {
  readonly request: Request
  readonly capturedPath: string
}): Promise<PrepareCaptureRequestResult> {
  const methodResult =
    CaptureMethodSchema.safeParse(
      request.method.toUpperCase(),
    )

  if (!methodResult.success) {
    return {
      prepared: false,
      reason: 'method-not-allowed',
    }
  }

    const url = new URL(request.url)

    const targetByteLength =
        textEncoder.encode(
        capturedPath + url.search,
        ).byteLength

    if (
        targetByteLength >
        MAX_CAPTURE_TARGET_BYTES
    ) {
        return {
        prepared: false,
        reason: 'path-query-too-large',
        }
    }

    const pathResult =
        CapturedPathSchema.safeParse(
        capturedPath,
        )

    if (!pathResult.success) {
        return {
        prepared: false,
        reason: 'invalid-request',
        }
    }

  const query: CapturedQueryEntry[] = []

  url.searchParams.forEach(
    (value, name) => {
      query.push({
        name,
        value,
      })
    },
  )

  if (
    query.length >
    MAX_CAPTURE_QUERY_ENTRY_COUNT
  ) {
    return {
      prepared: false,
      reason: 'too-many-query-entries',
    }
  }

  for (const entry of query) {
    if (
      !CapturedQueryEntrySchema
        .safeParse(entry)
        .success
    ) {
      return {
        prepared: false,
        reason: 'invalid-request',
      }
    }
  }

  const headers: CapturedHeader[] = []

  request.headers.forEach(
    (value, name) => {
      headers.push({
        name,
        value,
      })
    },
  )

  if (
    headers.length >
    MAX_CAPTURE_HEADER_COUNT
  ) {
    return {
      prepared: false,
      reason: 'too-many-headers',
    }
  }

  for (const header of headers) {
    if (
      !CapturedHeaderSchema
        .safeParse(header)
        .success
    ) {
      return {
        prepared: false,
        reason: 'invalid-request',
      }
    }
  }

  const rawContentType =
    request.headers.get(
      'content-type',
    )

  const contentType =
    rawContentType === null ||
    rawContentType.length === 0
      ? null
      : rawContentType

  if (
    contentType !== null &&
    contentType.length > 256
  ) {
    return {
      prepared: false,
      reason: 'invalid-request',
    }
  }

  let bodyResult:
    Awaited<
      ReturnType<typeof readBodyWithLimit>
    >

  try {
    bodyResult =
      await readBodyWithLimit(
        request.body,
      )
  } catch {
    return {
      prepared: false,
      reason: 'invalid-request',
    }
  }

  if (!bodyResult.accepted) {
    return {
      prepared: false,
      reason: 'body-too-large',
    }
  }

  return {
    prepared: true,

    capture: {
      method: methodResult.data,
      path: pathResult.data,
      query,
      headers,
      contentType,
      body: bodyResult.bytes,
    },
  }
}