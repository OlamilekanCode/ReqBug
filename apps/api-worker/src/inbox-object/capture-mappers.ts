import {
  CaptureSummarySchema,
  type CaptureSummary,
} from '@reqbug/contracts'

import {
  bytesToBase64Url,
} from '../platform/crypto.js'

import type {
  StoredCaptureSummary,
} from './sqlite-inbox-repository.js'

export function toCaptureSummary(
  capture: StoredCaptureSummary,
): CaptureSummary {
  return CaptureSummarySchema.parse({
    id: capture.id,
    sequence:
      capture.sequence,

    receivedAt:
      new Date(
        capture.receivedAtMs,
      ).toISOString(),

    method:
      capture.method,

    path:
      capture.path,

    contentType:
      capture.contentType,

    bodyBytes:
      capture.bodyBytes,

    bodySha256:
      bytesToBase64Url(
        capture.bodySha256,
      ),

    source:
      capture.sourceKind === null
        ? {
            kind: 'unknown',
            confidence: null,
            evidence: [],
          }
        : {
            kind:
              capture.sourceKind,

            confidence:
              capture.sourceConfidence,

            evidence:
              capture.sourceEvidence,
          },

    deliveryId:
      capture.deliveryId,

    eventId:
      capture.eventId,

    retry: {
      groupKey:
        capture.retry.groupKey,

      classification:
        capture.retry.classification,

      attempt:
        capture.retry.attempt,

      groupSize:
        capture.retry.groupSize,
    },
  })
}
