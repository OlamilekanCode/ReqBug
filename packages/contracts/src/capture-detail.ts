import { z } from 'zod'
import {
  CapturedHeaderSchema,
  CapturedQueryEntrySchema,
  MAX_CAPTURE_BODY_BYTES,
  MAX_CAPTURE_HEADER_COUNT,
  MAX_CAPTURE_QUERY_ENTRY_COUNT,
} from './capture'
import { CaptureSummarySchema } from './capture-summary'

export const BodyDownloadUrlSchema = z
  .string()
  .max(512)
  .regex(
    /^\/api\/v1\/inboxes\/[^/?#]+\/requests\/[^/?#]+\/body$/u,
    {
      message: 'Body download URL must be an internal API path',
    },
  )

const BinaryCaptureBodyViewSchema = z
  .object({
    encoding: z.literal('binary'),
    downloadUrl: BodyDownloadUrlSchema,
  })
  .strict()

const TextCaptureBodyViewSchema = z
  .object({
    encoding: z.literal('utf-8'),
    text: z.string().max(MAX_CAPTURE_BODY_BYTES),
    jsonDerived: z.literal(false),
    downloadUrl: BodyDownloadUrlSchema,
  })
  .strict()

const JsonCaptureBodyViewSchema = z
  .object({
    encoding: z.literal('utf-8'),
    text: z.string().max(MAX_CAPTURE_BODY_BYTES),
    json: z.json(),
    jsonDerived: z.literal(true),
    downloadUrl: BodyDownloadUrlSchema,
  })
  .strict()

export const CaptureBodyViewSchema = z.union([
  BinaryCaptureBodyViewSchema,
  TextCaptureBodyViewSchema,
  JsonCaptureBodyViewSchema,
])

export type CaptureBodyView = z.infer<typeof CaptureBodyViewSchema>

export const CaptureDetailSchema = CaptureSummarySchema.extend({
  query: z
    .array(CapturedQueryEntrySchema)
    .max(MAX_CAPTURE_QUERY_ENTRY_COUNT),
  headers: z
    .array(CapturedHeaderSchema)
    .max(MAX_CAPTURE_HEADER_COUNT),
  body: CaptureBodyViewSchema,
})

export type CaptureDetail = z.infer<typeof CaptureDetailSchema>