import { z } from 'zod'
import {
  MAX_CAPTURE_BODY_BYTES,
  MAX_INBOX_CAPTURE_COUNT,
  UtcDateTimeSchema,
} from './capture'
import { CaptureIdSchema } from './capture-summary'

export const MAX_INBOX_LIFETIME_MS =
  24 * 60 * 60 * 1000

export const LIVE_TICKET_LIFETIME_SECONDS = 30

const opaqueIdentifierPattern =
  /^[A-Za-z0-9_-]+$/u

const capabilityTokenPattern =
  /^[A-Za-z0-9_-]{43}$/u

const apiErrorCodePattern =
  /^[A-Z][A-Z0-9_]{0,63}$/u

const controlCharacterPattern =
  /[\u0000-\u001F\u007F]/u

export const InboxIdSchema = z
  .string()
  .min(1)
  .max(128)
  .regex(opaqueIdentifierPattern)

export const CapabilityTokenSchema = z
  .string()
  .regex(capabilityTokenPattern)

export const ApiRequestIdSchema = z
  .string()
  .min(1)
  .max(128)
  .regex(opaqueIdentifierPattern)

export const ApiErrorCodeSchema = z
  .string()
  .regex(apiErrorCodePattern)

export const SafeApiMessageSchema = z
  .string()
  .min(1)
  .max(512)
  .refine(
    (value) => !controlCharacterPattern.test(value),
    {
      message: 'API messages must not contain control characters',
    },
  )

const HttpsUrlSchema = z
  .url()
  .refine(
    (value) => {
      const url = new URL(value)

      return (
        url.protocol === 'https:' &&
        url.username.length === 0 &&
        url.password.length === 0
      )
    },
    {
      message:
        'URL must use HTTPS and must not contain credentials',
    },
  )

function hasValidInboxLifetime(
  createdAt: string,
  expiresAt: string,
): boolean {
  const createdAtMs = Date.parse(createdAt)
  const expiresAtMs = Date.parse(expiresAt)
  const lifetimeMs = expiresAtMs - createdAtMs

  return (
    lifetimeMs > 0 &&
    lifetimeMs <= MAX_INBOX_LIFETIME_MS
  )
}

export const CreateInboxDataSchema = z
  .object({
    inboxId: InboxIdSchema,
    ingestUrl: HttpsUrlSchema,
    dashboardUrl: HttpsUrlSchema,
    readToken: CapabilityTokenSchema,
    createdAt: UtcDateTimeSchema,
    expiresAt: UtcDateTimeSchema,
    limits: z
      .object({
        requests: z.literal(
          MAX_INBOX_CAPTURE_COUNT,
        ),
        bodyBytes: z.literal(
          MAX_CAPTURE_BODY_BYTES,
        ),
      })
      .strict(),
  })
  .strict()
  .superRefine((data, context) => {
    if (
      !hasValidInboxLifetime(
        data.createdAt,
        data.expiresAt,
      )
    ) {
      context.addIssue({
        code: 'custom',
        path: ['expiresAt'],
        message:
          'Inbox expiry must be after creation and no more than 24 hours later',
      })
    }

    const ingestUrl = new URL(data.ingestUrl)
    const dashboardUrl = new URL(
      data.dashboardUrl,
    )

    const ingestParts = ingestUrl.pathname
      .split('/')
      .filter(Boolean)

    const validIngestPath =
      ingestParts.length === 3 &&
      ingestParts[0] === 'h' &&
      ingestParts[1] === data.inboxId &&
      CapabilityTokenSchema.safeParse(
        ingestParts[2],
      ).success

    if (
      !validIngestPath ||
      ingestUrl.search.length > 0 ||
      ingestUrl.hash.length > 0
    ) {
      context.addIssue({
        code: 'custom',
        path: ['ingestUrl'],
        message:
          'Ingest URL must contain the inbox and ingest capability',
      })
    }

    const expectedDashboardPath =
      `/inboxes/${data.inboxId}`

    const expectedDashboardHash =
      `#access=${data.readToken}`

    if (
      dashboardUrl.pathname !==
        expectedDashboardPath ||
      dashboardUrl.search.length > 0 ||
      dashboardUrl.hash !==
        expectedDashboardHash
    ) {
      context.addIssue({
        code: 'custom',
        path: ['dashboardUrl'],
        message:
          'Dashboard URL must contain the read capability in its fragment',
      })
    }

    if (
      dashboardUrl.origin !== ingestUrl.origin
    ) {
      context.addIssue({
        code: 'custom',
        path: ['dashboardUrl'],
        message:
          'Dashboard and ingest URLs must use the same origin',
      })
    }
  })

export const CreateInboxResponseSchema = z
  .object({
    data: CreateInboxDataSchema,
  })
  .strict()

export type CreateInboxResponse = z.infer<
  typeof CreateInboxResponseSchema
>

export const InboxMetadataDataSchema = z
  .object({
    inboxId: InboxIdSchema,
    createdAt: UtcDateTimeSchema,
    expiresAt: UtcDateTimeSchema,
    status: z.literal('active'),
    storedRequestCount: z
      .number()
      .int()
      .min(0)
      .max(MAX_INBOX_CAPTURE_COUNT),
    lifetimeRequestCount: z
      .number()
      .int()
      .min(0)
      .max(MAX_INBOX_CAPTURE_COUNT),
    requestLimit: z.literal(
      MAX_INBOX_CAPTURE_COUNT,
    ),
    bodyByteLimit: z.literal(
      MAX_CAPTURE_BODY_BYTES,
    ),
  })
  .strict()
  .superRefine((data, context) => {
    if (
      !hasValidInboxLifetime(
        data.createdAt,
        data.expiresAt,
      )
    ) {
      context.addIssue({
        code: 'custom',
        path: ['expiresAt'],
        message: 'Inbox lifetime is invalid',
      })
    }

    if (
      data.storedRequestCount >
      data.lifetimeRequestCount
    ) {
      context.addIssue({
        code: 'custom',
        path: ['storedRequestCount'],
        message:
          'Stored request count cannot exceed lifetime request count',
      })
    }
  })

export const InboxMetadataResponseSchema = z
  .object({
    data: InboxMetadataDataSchema,
  })
  .strict()

export type InboxMetadataResponse = z.infer<
  typeof InboxMetadataResponseSchema
>

export const LiveTicketResponseSchema = z
  .object({
    data: z
      .object({
        ticket: CapabilityTokenSchema,
        expiresAt: UtcDateTimeSchema,
      })
      .strict(),
  })
  .strict()

export type LiveTicketResponse = z.infer<
  typeof LiveTicketResponseSchema
>

export const CaptureAcceptedResponseSchema = z
  .object({
    received: z.literal(true),
    requestId: CaptureIdSchema,
  })
  .strict()

export type CaptureAcceptedResponse = z.infer<
  typeof CaptureAcceptedResponseSchema
>

export const ApiErrorResponseSchema = z
  .object({
    error: z
      .object({
        code: ApiErrorCodeSchema,
        message: SafeApiMessageSchema,
        requestId: ApiRequestIdSchema,
      })
      .strict(),
  })
  .strict()

export type ApiErrorResponse = z.infer<
  typeof ApiErrorResponseSchema
>