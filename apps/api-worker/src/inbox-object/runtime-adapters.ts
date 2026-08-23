import type {
  Clock,
  ExpiryScheduler,
  InboxLifecycleNotifier,
  SecureValueGenerator,
} from '@reqbug/core'

export interface PresetCapabilities {
  readonly inboxId: string
  readonly ingestToken: string
  readonly readToken: string
}

export class SystemClock
  implements Clock {
  nowMilliseconds(): number {
    return Date.now()
  }
}

export class PresetSecureValueGenerator
  implements SecureValueGenerator {
  private capabilityIndex = 0

  constructor(
    private readonly values:
      PresetCapabilities,
  ) {}

  generateInboxId(): string {
    return this.values.inboxId
  }

  generateCapabilityToken(): string {
    const token =
      this.capabilityIndex === 0
        ? this.values.ingestToken
        : this.capabilityIndex === 1
          ? this.values.readToken
          : null

    if (token === null) {
      throw new Error(
        'All preset capabilities have already been consumed.',
      )
    }

    this.capabilityIndex += 1

    return token
  }
}

export class DurableObjectExpiryScheduler
  implements ExpiryScheduler {
  constructor(
    private readonly storage:
      DurableObjectStorage,
  ) {}

  async scheduleInboxExpiry({
    expiresAtMs,
  }: {
    readonly inboxId: string
    readonly expiresAtMs: number
  }): Promise<void> {
    await this.storage.setAlarm(
      expiresAtMs,
    )
  }
}

export class NoopInboxLifecycleNotifier
  implements InboxLifecycleNotifier {
  async publishInboxCleared(): Promise<void> {
    // Live WebSocket broadcasting is added later.
  }

  async terminateInbox(): Promise<void> {
    // Live WebSocket termination is added later.
  }
}