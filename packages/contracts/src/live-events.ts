import { z } from 'zod'
import {
  LIVE_PROTOCOL_VERSION,
  RequestCreatedEventSchema,
} from './capture-feed'
import { UtcDateTimeSchema } from './capture'
import {
  ApiErrorCodeSchema,
  InboxIdSchema,
  SafeApiMessageSchema,
} from './inbox'

export const SessionReadyEventSchema = z
  .object({
    version: z.literal(
      LIVE_PROTOCOL_VERSION,
    ),
    type: z.literal('session.ready'),
    occurredAt: UtcDateTimeSchema,
    data: z
      .object({
        inboxId: InboxIdSchema,
        expiresAt: UtcDateTimeSchema,
        lastSequence: z
          .number()
          .int()
          .min(0),
      })
      .strict(),
  })
  .strict()

export const InboxClearedEventSchema = z
  .object({
    version: z.literal(
      LIVE_PROTOCOL_VERSION,
    ),
    type: z.literal('inbox.cleared'),
    occurredAt: UtcDateTimeSchema,
    data: z
      .object({
        clearedAt: UtcDateTimeSchema,
      })
      .strict(),
  })
  .strict()

export const InboxExpiringEventSchema = z
  .object({
    version: z.literal(
      LIVE_PROTOCOL_VERSION,
    ),
    type: z.literal('inbox.expiring'),
    occurredAt: UtcDateTimeSchema,
    data: z
      .object({
        expiresAt: UtcDateTimeSchema,
      })
      .strict(),
  })
  .strict()

export const InboxDeletedEventSchema = z
  .object({
    version: z.literal(
      LIVE_PROTOCOL_VERSION,
    ),
    type: z.literal('inbox.deleted'),
    occurredAt: UtcDateTimeSchema,
    data: z
      .object({
        deletedAt: UtcDateTimeSchema,
      })
      .strict(),
  })
  .strict()

export const SessionErrorEventSchema = z
  .object({
    version: z.literal(
      LIVE_PROTOCOL_VERSION,
    ),
    type: z.literal('session.error'),
    occurredAt: UtcDateTimeSchema,
    data: z
      .object({
        code: ApiErrorCodeSchema,
        message: SafeApiMessageSchema,
      })
      .strict(),
  })
  .strict()

export const LiveEventSchema =
  z.discriminatedUnion('type', [
    SessionReadyEventSchema,
    RequestCreatedEventSchema,
    InboxClearedEventSchema,
    InboxExpiringEventSchema,
    InboxDeletedEventSchema,
    SessionErrorEventSchema,
  ])

export type SessionReadyEvent = z.infer<
  typeof SessionReadyEventSchema
>

export type InboxClearedEvent = z.infer<
  typeof InboxClearedEventSchema
>

export type InboxExpiringEvent = z.infer<
  typeof InboxExpiringEventSchema
>

export type InboxDeletedEvent = z.infer<
  typeof InboxDeletedEventSchema
>

export type SessionErrorEvent = z.infer<
  typeof SessionErrorEventSchema
>

export type LiveEvent = z.infer<
  typeof LiveEventSchema
>