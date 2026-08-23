export {
  DEFAULT_INBOX_POLICY,
  type InboxPolicy,
} from './inbox-policy.js'

export {
  CAPABILITY_TOKEN_LENGTH,
  SHA_256_DIGEST_BYTE_LENGTH,
  getInboxAvailability,
  isValidCapabilityToken,
  isValidInboxId,
  isValidInboxPolicy,
  isValidTimestamp,
  isValidTokenDigest,
  type CreatedInboxCapabilities,
  type InboxAvailability,
  type InboxCapabilityKind,
  type StoredInbox,
} from './inbox/model.js'

export {
  InboxCoreError,
  type InboxCoreErrorCode,
} from './inbox/errors.js'

export type {
  Clock,
  ExpiryScheduler,
  InboxRepository,
  SecureValueGenerator,
  TokenDigestService,
} from './inbox/ports.js'

export {
  createInbox,
  type CreateInboxDependencies,
} from './inbox/create-inbox.js'

export {
  authorizeInbox,
  type AuthorizeInboxDependencies,
  type AuthorizeInboxInput,
  type InboxAuthorizationFailureReason,
  type InboxAuthorizationResult,
} from './inbox/authorize-inbox.js'

export {
  assessCaptureAdmission,
  type AssessCaptureAdmissionInput,
  type CaptureAdmissionFailureReason,
  type CaptureAdmissionResult,
} from './inbox/capture-admission.js'

export {
  clearInboxRequests,
  deleteInbox,
  expireInbox,
  type AuthorizedLifecycleInput,
  type ClearInboxRequestsResult,
  type DeleteInboxResult,
  type ExpireInboxResult,
  type InboxLifecycleDependencies,
} from './inbox/lifecycle.js'

export type {
  ClearStoredRequestsResult,
  InboxLifecycleNotifier,
  InboxLifecycleRepository,
  InboxTerminationReason,
} from './inbox/ports.js'