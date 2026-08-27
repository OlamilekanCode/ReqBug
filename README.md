# ReqBug

[![Continuous integration](https://github.com/OlamilekanCode/ReqBug/actions/workflows/ci.yml/badge.svg)](https://github.com/OlamilekanCode/ReqBug/actions/workflows/ci.yml)

> Ephemeral webhook inspector and replay-safe debugger.

ReqBug gives developers a temporary HTTPS inbox for inspecting webhook requests, validating provider signatures against exact request bytes, identifying retries, and generating safe local replay artifacts.

## Project status

ReqBug is under active development and is not yet deployed for public use.

The backend foundation now includes secure inbox creation, authenticated exact-byte webhook ingestion, authenticated request-reading and lifecycle APIs, secure live-ticket issuance, and GitHub Actions CI. Live WebSocket connections are the next product milestone.

### Current progress

| Milestone | Status |
|---|---|
| TypeScript pnpm monorepo | Complete |
| Capture and API contracts | Complete |
| Provider signature verification | Complete |
| Inbox lifecycle and quota policy | Complete |
| Durable Object SQLite persistence | Complete |
| Secure inbox creation API | Complete |
| Webhook request ingestion | Complete |
| Authenticated request and lifecycle API | Complete |
| Secure live-ticket issuance | Complete |
| Live request updates | Planned |
| React inspection dashboard | Planned |
| Replay-pack generation | Planned |
| GitHub Actions CI | Complete |
| Deployment | Planned |

The repository currently contains **232 passing Vitest tests** across the contracts, core, signatures, and API Worker packages.

## Why ReqBug?

Webhook debugging usually requires several disconnected tools:

- A temporary public HTTPS endpoint
- Raw request inspection
- Provider-specific signature verification
- Retry and duplicate analysis
- A safe way to reproduce requests locally

ReqBug combines those workflows while keeping signing secrets in the browser and avoiding hosted outbound replay.

## Implemented

### Contracts

- Versioned Zod API contracts
- Capture summaries and request details
- Inbox creation and metadata responses
- Paginated capture feeds
- Live event envelopes
- Strict request limits and validation
- Repeated header and query-entry preservation

### Signature verification

Browser-safe verification is implemented for:

- GitHub
- Stripe timestamped signatures
- Shopify
- Paystack
- Current Flutterwave HMAC webhooks
- Configurable generic HMAC-SHA256 webhooks

The provider catalog also records algorithms, encodings, expected headers, freshness protection, duplicate-delivery headers, and security warnings.

### Inbox domain

- Anonymous capability-based inboxes
- Separate ingest and read capabilities
- Cryptographically secure identifiers and tokens
- SHA-256 token-digest storage
- Constant-time capability comparison
- 24-hour maximum lifetime
- 50 lifetime captures per inbox
- 256 KiB request-body limit
- Clear, delete, expiration, and capture-admission policies
- Durable Object expiration alarms

### Cloudflare persistence and API

- Hono API Worker
- SQLite-backed Durable Object
- Inbox metadata schema
- Captured-request schema
- Live-ticket schema
- Transactional lifecycle operations
- Secure `POST /api/v1/inboxes` endpoint
- Durable inbox initialization before responding
- Expiration alarm scheduling
- Security response headers
- Authenticated public webhook-ingestion routes
- Authenticated inbox clear and delete routes
- Authenticated live-ticket issuance route
- Bounded streaming request-body capture
- Exact body-byte and SHA-256 preservation
- Atomic capture insertion and quota advancement
- Provider-facing 200, 404, 405, 410, 413, 414, 429, 431, and 503 responses

## MVP limits

| Limit | Value |
|---|---:|
| Inbox lifetime | 24 hours |
| Lifetime captures per inbox | 50 |
| Maximum request body | 256 KiB |
| Maximum captured headers | 100 |
| Combined path and query size | 8 KiB |
| Concurrent live connections | 3 |
| Live-ticket lifetime | 30 seconds |

Clearing an inbox removes its currently stored captures but does not reset its lifetime capture quota.

Oversized request bodies are rejected and never partially stored.

## Security model

ReqBug is intended for synthetic and sandbox webhook data.

- Inbox access uses unguessable capabilities instead of accounts.
- Ingest and read capabilities are separate.
- Only SHA-256 capability digests are persisted.
- Read capabilities are delivered through URL fragments.
- Signing secrets remain inside the browser.
- Signature verification uses the exact captured body bytes.
- Captured data expires after at most 24 hours.
- Hosted forwarding to arbitrary destinations is excluded.
- Captured HTML and SVG are never executed.
- Durable storage must commit before a webhook receives a success response.
- Production API keys and application secrets should not be entered into hosted debugging tools.

## Architecture

```text
apps/
  web/             React and Vite inspection dashboard
  api-worker/      Hono API and Cloudflare Durable Object

packages/
  contracts/       Versioned Zod API and live-event contracts
  core/            Framework-neutral inbox domain policy
  signatures/      Browser-safe provider signature verification
```

The intended request flow is:

```text
Webhook provider
       |
       v
Cloudflare Worker
       |
       v
Inbox Durable Object
       |
       +--> SQLite metadata and exact request bytes
       |
       +--> Live dashboard events
```

## API implemented so far

### Create an inbox

```http
POST /api/v1/inboxes
```

The response contains:

- A public ingest URL
- A private dashboard URL
- A separate read capability
- Creation and expiration timestamps
- The inbox capture and body-size limits

The raw capabilities are returned only during creation. The backend stores their SHA-256 digests.

### Read inbox metadata and captures

```http
GET /api/v1/inboxes/:inboxId
GET /api/v1/inboxes/:inboxId/requests
GET /api/v1/inboxes/:inboxId/requests/:requestId
GET /api/v1/inboxes/:inboxId/requests/:requestId/body
```

These routes require the read capability in the `Authorization: Bearer <readToken>` header. The body download returns the exact captured bytes with `Cache-Control: no-store`.

### Clear or delete an inbox

```http
DELETE /api/v1/inboxes/:inboxId/requests
DELETE /api/v1/inboxes/:inboxId
```

These routes require the read capability in the `Authorization: Bearer <readToken>` header.

Clearing an inbox removes stored captures but does not reset the 50-request lifetime capture quota. Deleting an inbox invalidates future reads and webhook ingestion.

### Issue a live connection ticket

```http
POST /api/v1/inboxes/:inboxId/live-tickets
```

This route requires the read capability in the `Authorization: Bearer <readToken>` header.

Live tickets expire within 30 seconds, are limited to three unexpired tickets per inbox, and are designed for one successful live connection. The backend stores only SHA-256 ticket digests and expiry timestamps. The WebSocket upgrade route and live events are not implemented yet.

## Planned MVP workflow

1. Create an anonymous temporary inbox.
2. Copy its unique ingest URL into a webhook provider’s sandbox.
3. Receive and durably store exact webhook request bytes.
4. Inspect method, path, query parameters, headers, content type, and body.
5. Detect likely providers, event identifiers, retries, and duplicates.
6. Verify supported signatures locally in the browser.
7. Download the exact captured body.
8. Generate local `curl` and `.http` replay artifacts.
9. Clear or permanently delete the inbox.

## Explicit non-goals

The MVP will not include:

- User accounts
- Permanent webhook storage
- Hosted forwarding or server-side replay
- Production secret management
- Arbitrary JavaScript execution
- A general-purpose API proxy
- Automatic retrying of provider deliveries

## Development

### Requirements

- Node.js `>=24.18.0 <25`
- pnpm `>=11.15.1 <12`

### Install dependencies

```bash
pnpm install
```

### Start the API Worker

```bash
pnpm --filter @reqbug/api-worker dev
```

### Start the web application

```bash
pnpm --filter @reqbug/web dev
```

### Verify the implemented packages

```bash
pnpm --filter @reqbug/contracts typecheck
pnpm --filter @reqbug/contracts test

pnpm --filter @reqbug/core typecheck
pnpm --filter @reqbug/core test

pnpm --filter @reqbug/signatures typecheck
pnpm --filter @reqbug/signatures test

pnpm --filter @reqbug/api-worker typecheck
pnpm --filter @reqbug/api-worker test
```

## Technology

- TypeScript
- React
- Vite
- Hono
- Cloudflare Workers
- Cloudflare Durable Objects
- SQLite
- Zod
- Web Crypto API
- Vitest
- pnpm workspaces

## License

[MIT](LICENSE)
