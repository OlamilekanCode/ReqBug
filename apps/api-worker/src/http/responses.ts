import {
  CAPTURE_METHODS,
} from '@reqbug/contracts'

import type {
  CaptureRequestPreparationFailureReason,
} from '../capture/prepare-capture-request.js'

import type {
  CaptureReadFailureReason,
  CaptureWebhookFailureReason,
  ReadInboxMetadataFailureReason,
} from '../inbox-object/rpc-types.js'

import {
  WebCryptoSecureValueGenerator,
} from '../platform/crypto.js'

const allowedCaptureMethods =
  CAPTURE_METHODS.join(', ')

export function jsonResponse(
  method: string,
  value: unknown,
  status: number,
  additionalHeaders:
    Record<string, string> = {},
): Response {
  const headers =
    new Headers({
      'Content-Type':
        'application/json; charset=utf-8',

      'Cache-Control':
        'no-store',

      'Referrer-Policy':
        'no-referrer',

      ...additionalHeaders,
    })

  return new Response(
    method === 'HEAD'
      ? null
      : JSON.stringify(value),
    {
      status,
      headers,
    },
  )
}

export function noContentResponse(): Response {
  return new Response(
    null,
    {
      status: 204,

      headers: {
        'Cache-Control':
          'no-store',

        'Referrer-Policy':
          'no-referrer',
      },
    },
  )
}

export function captureError(
  method: string,
  status: number,
  code: string,
  message: string,
  additionalHeaders:
    Record<string, string> = {},
): Response {
  const values =
    new WebCryptoSecureValueGenerator()

  return jsonResponse(
    method,
    {
      error: {
        code,
        message,

        requestId:
          `err_${values.generateInboxId()}`,
      },
    },
    status,
    additionalHeaders,
  )
}

export function preparationFailureResponse(
  method: string,
  reason:
    CaptureRequestPreparationFailureReason,
): Response {
  switch (reason) {
    case 'method-not-allowed':
      return captureError(
        method,
        405,
        'METHOD_NOT_ALLOWED',
        'This HTTP method cannot be captured.',
        {
          Allow:
            allowedCaptureMethods,
        },
      )

    case 'body-too-large':
      return captureError(
        method,
        413,
        'BODY_TOO_LARGE',
        'The request body exceeds the capture limit.',
      )

    case 'path-query-too-large':
    case 'too-many-query-entries':
      return captureError(
        method,
        414,
        'REQUEST_TARGET_TOO_LARGE',
        'The request path or query exceeds the capture limit.',
      )

    case 'too-many-headers':
      return captureError(
        method,
        431,
        'TOO_MANY_HEADERS',
        'The request contains too many headers.',
      )

    case 'invalid-request':
      return captureError(
        method,
        400,
        'INVALID_REQUEST',
        'The request cannot be captured.',
      )
  }
}

export function persistenceFailureResponse(
  method: string,
  reason:
    CaptureWebhookFailureReason,
): Response {
  switch (reason) {
    case 'not-found':
    case 'invalid-capability':
    case 'inbox-not-found':
      return captureError(
        method,
        404,
        'NOT_FOUND',
        'The requested webhook inbox was not found.',
      )

    case 'expired':
    case 'deleted':
    case 'inbox-expired':
    case 'inbox-deleted':
      return captureError(
        method,
        410,
        'INBOX_GONE',
        'This webhook inbox is no longer available.',
      )

    case 'inbox-limit-reached':
      return captureError(
        method,
        429,
        'INBOX_LIMIT_REACHED',
        'This webhook inbox has reached its capture limit.',
      )

    case 'body-too-large':
      return captureError(
        method,
        413,
        'BODY_TOO_LARGE',
        'The request body exceeds the capture limit.',
      )

    case 'invalid-body-length':
      return captureError(
        method,
        503,
        'CAPTURE_UNAVAILABLE',
        'The request could not be stored.',
      )
  }
}

export function inboxReadFailureResponse(
  method: string,
  reason:
    ReadInboxMetadataFailureReason,
): Response {
  switch (reason) {
    case 'not-found':
    case 'invalid-capability':
      return captureError(
        method,
        404,
        'NOT_FOUND',
        'The requested webhook inbox was not found.',
      )

    case 'expired':
    case 'deleted':
      return captureError(
        method,
        410,
        'INBOX_GONE',
        'This webhook inbox is no longer available.',
      )
  }
}

export function captureReadFailureResponse(
  method: string,
  reason:
    CaptureReadFailureReason,
): Response {
  if (reason === 'request-not-found') {
    return captureError(
      method,
      404,
      'NOT_FOUND',
      'The requested webhook capture was not found.',
    )
  }

  return inboxReadFailureResponse(
    method,
    reason,
  )
}
