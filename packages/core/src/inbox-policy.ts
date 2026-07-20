export interface InboxPolicy {
  readonly ttlMilliseconds: number
  readonly lifetimeRequestLimit: number
  readonly requestBodyByteLimit: number
  readonly liveConnectionLimit: number
}

export const DEFAULT_INBOX_POLICY = {
  ttlMilliseconds: 24 * 60 * 60 * 1000,
  lifetimeRequestLimit: 50,
  requestBodyByteLimit: 256 * 1024,
  liveConnectionLimit: 3,
} as const satisfies InboxPolicy