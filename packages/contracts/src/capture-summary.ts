import { z } from 'zod'
import {
  BodyByteLengthSchema,
  BodySha256Schema,
  CaptureMethodSchema,
  CapturedPathSchema,
  MAX_INBOX_CAPTURE_COUNT,
  UtcDateTimeSchema,
} from './capture'

export const CAPTURE_SOURCE_KINDS = [
  'github',
  'stripe',
  'shopify',
  'paystack',
  'flutterwave',
  'generic',
] as const

export const CaptureSourceKindSchema = z.enum(CAPTURE_SOURCE_KINDS)

export const SOURCE_CONFIDENCE_LEVELS = [
  'high',
  'medium',
  'low',
] as const

export const SourceConfidenceSchema = z.enum(
  SOURCE_CONFIDENCE_LEVELS,
)

const controlCharacterPattern = /[\u0000-\u001F\u007F]/u

const SafeBoundedTextSchema = z
  .string()
  .min(1)
  .max(256)
  .refine(
    (value) => !controlCharacterPattern.test(value),
    {
      message: 'Value must not contain control characters',
    },
  )

export const CaptureIdSchema = z.string().min(1).max(128)

export const ExtractedIdentifierSchema = SafeBoundedTextSchema

export const CaptureSourceEvidenceSchema = SafeBoundedTextSchema

const DetectedCaptureSourceSchema = z
  .object({
    kind: CaptureSourceKindSchema,
    confidence: SourceConfidenceSchema,
    evidence: z
      .array(CaptureSourceEvidenceSchema)
      .min(1)
      .max(10),
  })
  .strict()

const UnknownCaptureSourceSchema = z
  .object({
    kind: z.literal('unknown'),
    confidence: z.null(),
    evidence: z.array(z.never()).max(0),
  })
  .strict()

export const CaptureSourceSchema = z.union([
  DetectedCaptureSourceSchema,
  UnknownCaptureSourceSchema,
])

export type CaptureSource = z.infer<typeof CaptureSourceSchema>

export const RETRY_CLASSIFICATIONS = [
  'unique',
  'probable',
  'definite',
] as const

export const RetryClassificationSchema = z.enum(
  RETRY_CLASSIFICATIONS,
)

export const CaptureRetrySchema = z
  .object({
    groupKey: SafeBoundedTextSchema,
    classification: RetryClassificationSchema,
    attempt: z
      .number()
      .int()
      .min(1)
      .max(MAX_INBOX_CAPTURE_COUNT),
    groupSize: z
      .number()
      .int()
      .min(1)
      .max(MAX_INBOX_CAPTURE_COUNT),
  })
  .strict()
  .superRefine((retry, context) => {
    if (retry.attempt > retry.groupSize) {
      context.addIssue({
        code: 'custom',
        path: ['attempt'],
        message: 'Retry attempt cannot exceed the group size',
      })
    }

    if (
      retry.classification === 'unique' &&
      (retry.attempt !== 1 || retry.groupSize !== 1)
    ) {
      context.addIssue({
        code: 'custom',
        path: ['classification'],
        message: 'A unique capture must be attempt 1 of group size 1',
      })
    }

    if (
      retry.classification !== 'unique' &&
      retry.groupSize < 2
    ) {
      context.addIssue({
        code: 'custom',
        path: ['groupSize'],
        message:
          'A probable or definite retry group must contain at least two captures',
      })
    }
  })

export type CaptureRetry = z.infer<typeof CaptureRetrySchema>

export const CaptureSummarySchema = z
  .object({
    id: CaptureIdSchema,
    sequence: z.number().int().min(1),
    receivedAt: UtcDateTimeSchema,
    method: CaptureMethodSchema,
    path: CapturedPathSchema,
    contentType: SafeBoundedTextSchema.nullable(),
    bodyBytes: BodyByteLengthSchema,
    bodySha256: BodySha256Schema,
    source: CaptureSourceSchema,
    deliveryId: ExtractedIdentifierSchema.nullable(),
    eventId: ExtractedIdentifierSchema.nullable(),
    retry: CaptureRetrySchema,
  })
  .strict()

export type CaptureSummary = z.infer<typeof CaptureSummarySchema>