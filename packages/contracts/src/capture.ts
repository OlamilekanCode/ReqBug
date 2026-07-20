import { z } from 'zod'

export const MAX_INBOX_CAPTURE_COUNT = 50

export const MAX_CAPTURE_BODY_BYTES = 256 * 1024

export const CAPTURE_METHODS = [
  'GET',
  'HEAD',
  'POST',
  'PUT',
  'PATCH',
  'DELETE',
  'OPTIONS',
] as const

export const CaptureMethodSchema = z.enum(CAPTURE_METHODS)

export type CaptureMethod = z.infer<typeof CaptureMethodSchema>

const normalizedHeaderNamePattern =
  /^[!#$%&'*+\-.^_`|~0-9a-z]+$/u

export const CapturedHeaderSchema = z
  .object({
    name: z
      .string()
      .min(1)
      .max(256)
      .regex(normalizedHeaderNamePattern),
    value: z
      .string()
      .max(8192)
      .refine(
        (value) => !value.includes('\r') && !value.includes('\n'),
        {
          message: 'Header values must not contain line breaks',
        },
      ),
  })
  .strict()

export type CapturedHeader = z.infer<typeof CapturedHeaderSchema>

export const CapturedQueryEntrySchema = z
  .object({
    name: z.string().max(8192),
    value: z.string().max(8192),
  })
  .strict()

export type CapturedQueryEntry = z.infer<
  typeof CapturedQueryEntrySchema
>

export const CapturedPathSchema = z
  .string()
  .min(1)
  .max(8192)
  .startsWith('/')

export const BodyByteLengthSchema = z
  .number()
  .int()
  .min(0)
  .max(MAX_CAPTURE_BODY_BYTES)

export const BodySha256Schema = z
  .string()
  .regex(/^[A-Za-z0-9_-]{43}$/u)

export const UtcDateTimeSchema = z.iso.datetime()