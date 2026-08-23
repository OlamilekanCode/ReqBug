export type InboxCoreErrorCode =
  | 'INVALID_CLOCK'
  | 'INVALID_POLICY'
  | 'INVALID_GENERATED_INBOX_ID'
  | 'INVALID_GENERATED_CAPABILITY'
  | 'DUPLICATE_GENERATED_CAPABILITY'
  | 'INVALID_TOKEN_DIGEST'
  | 'EXPIRY_SCHEDULE_FAILED'

export class InboxCoreError extends Error {
  readonly code: InboxCoreErrorCode
  readonly originalCause: unknown

  constructor(
    code: InboxCoreErrorCode,
    message: string,
    originalCause: unknown = null,
  ) {
    super(message)

    this.name = 'InboxCoreError'
    this.code = code
    this.originalCause = originalCause
  }
}