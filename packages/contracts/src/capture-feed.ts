import { z } from 'zod'
import {
  MAX_INBOX_CAPTURE_COUNT,
  UtcDateTimeSchema,
} from './capture'
import {
  CaptureSummarySchema,
} from './capture-summary'

export const DEFAULT_CAPTURE_LIST_PAGE_SIZE = 25

export const MAX_CAPTURE_LIST_PAGE_SIZE =
  MAX_INBOX_CAPTURE_COUNT

export const CaptureListCursorSchema = z
  .number()
  .int()
  .min(1)

export const CaptureListPageSchema = z
  .object({
    nextBefore: CaptureListCursorSchema.nullable(),
  })
  .strict()

export const CaptureListResponseSchema = z
  .object({
    data: z
      .array(CaptureSummarySchema)
      .max(MAX_CAPTURE_LIST_PAGE_SIZE),
    page: CaptureListPageSchema,
  })
  .strict()

export type CaptureListResponse = z.infer<
  typeof CaptureListResponseSchema
>

export const LIVE_PROTOCOL_VERSION = 1

export const RequestCreatedEventSchema = z
  .object({
    version: z.literal(LIVE_PROTOCOL_VERSION),
    type: z.literal('request.created'),
    occurredAt: UtcDateTimeSchema,
    data: CaptureSummarySchema,
  })
  .strict()

export type RequestCreatedEvent = z.infer<
  typeof RequestCreatedEventSchema
>