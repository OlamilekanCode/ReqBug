# ReqBug

> Ephemeral webhook inspector and replay-safe debugger.

ReqBug is a temporary webhook inbox that helps developers inspect exactly what a webhook provider sent, verify signatures against the original request bytes, identify retries, and safely reproduce requests against a local or sandbox endpoint.

## Project status

ReqBug is under active development.

The monorepo foundation, inbox policy, browser-safe signature engine, provider catalog, and core capture contracts are implemented and tested. Durable Object persistence, Worker routes, the live dashboard, and replay-pack generation are the next major milestones.

ReqBug is not yet deployed for public use.

## Why ReqBug?

Webhook debugging often requires several disconnected tools:

- A temporary HTTPS endpoint.
- Raw request inspection.
- Provider-specific signature verification.
- Retry and duplicate analysis.
- A safe way to reproduce requests locally.

ReqBug combines these workflows while keeping signing secrets in the browser and avoiding hosted outbound replay.

## Implemented

- pnpm TypeScript monorepo
- React frontend scaffold
- Cloudflare Worker and Hono API scaffold
- Framework-neutral inbox policy
- Exact-byte HMAC verification primitives
- GitHub webhook verification
- Stripe timestamped-signature verification
- Shopify webhook verification
- Paystack webhook verification
- Current Flutterwave HMAC webhook verification
- Configurable generic HMAC-SHA256 verification
- Provider verification metadata catalog
- Validated capture summary, detail, feed, inbox, and live-event contracts
- Automated Vitest coverage for implemented packages

## Planned MVP

- Anonymous capability-based inboxes
- Separate ingest and read capabilities
- 24-hour maximum inbox lifetime
- 50 lifetime captures per inbox
- 256 KiB maximum request body
- Exact request-body preservation
- Live request updates through Durable Object WebSockets
- Request metadata, header, query, text, JSON, and binary inspection
- Provider and event-identifier detection
- Definite and probable retry grouping
- Browser-only signature diagnostics
- Downloadable exact request bodies
- Safe local `curl` and `.http` replay artifacts
- Clear-now and delete-now controls

## Security boundaries

ReqBug is designed for synthetic and sandbox webhook data.

- Signing secrets never leave the browser.
- Only token digests are stored by the backend.
- Read capabilities are delivered through URL fragments.
- Captured data expires after at most 24 hours.
- Hosted forwarding to arbitrary destinations is excluded.
- Captured HTML and SVG are never executed.
- Durable storage must commit before ReqBug acknowledges a delivery.

## Architecture

```text
apps/
  web/             React and Vite dashboard
  api-worker/      Hono and Cloudflare Worker boundary

packages/
  contracts/       Versioned Zod API and live-event contracts
  core/            Framework-neutral domain policy
  signatures/      Browser-safe signature verification