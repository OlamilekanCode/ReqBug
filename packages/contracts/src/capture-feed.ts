import { z } from 'zod'
import {
  MAX_INBOX_CAPTURE_COUNT,
} from './capture'
import {
  CaptureSummarySchema,
} from './capture-summary'

export const CaptureListResponseSchema = z
  .object({
    requests: z
      .array(CaptureSummarySchema)
      .max(MAX_INBOX_CAPTURE_COUNT),
  })
  .strict()

export type CaptureListResponse = z.infer<
  typeof CaptureListResponseSchema
>

export const RequestCreatedEventSchema = z
  .object({
    type: z.literal('request.created'),
    data: CaptureSummarySchema,
  })
  .strict()

export type RequestCreatedEvent = z.infer<
  typeof RequestCreatedEventSchema
>