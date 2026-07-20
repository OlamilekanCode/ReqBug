# ReqBug

> Ephemeral webhook inspector and replay-safe debugger.

ReqBug is a temporary webhook inbox for receiving, inspecting, filtering, verifying, and safely reproducing webhook requests during development.

## Project status

ReqBug is currently in the foundation stage. The approved MVP architecture and implementation milestones are being established before feature development begins.

## Planned MVP

- Anonymous temporary webhook inboxes
- Live request inspection
- Exact raw-body preservation
- Stripe, GitHub, and generic HMAC-SHA256 verification
- Retry and duplicate grouping
- Replay-safe local request generation
- Automatic 24-hour expiration