# Changelog

All notable changes to this project will be documented in this file.

## [Unreleased] - 2026-07-16

### Security
- Added separator-aware sandbox path containment to block prefix-sibling escapes.
- Replaced long-lived API keys in EventSource URLs with short-lived,
  path-bound stream tokens.
- Sanitized rendered chat Markdown and added executable-markup regression tests.
- Hardened uploads with bounded sizes, allowlisted types, safe generated names,
  path containment, collision checks, and cleanup on failure.
- Added governed outbound HTTP with policy checks, DNS/private-address
  protection, redirect revalidation, production HTTPS enforcement, timeouts,
  response-size limits, and address-pinned connections that close the
  DNS-rebinding gap between validation and transport.
- Made production reject missing/placeholder secrets and host-shell fallback.
- Added CSP and related HTTP security headers.
- Kept the production script policy strict while allowing Vite's development
  React preamble, and aligned the font policy with the stylesheets the UI
  actually loads so local browser sessions render instead of failing blank.
- Applied API rate limiting before authentication so invalid-key attempts are
  bounded, and prevented live-gate failures from echoing secret-bearing errors.
- Normalized rate-limit client addresses with the library's IPv6-aware helper.
- Documented one fingerprint-scoped Gitleaks exception for a public example JWT
  in historical test data; no secret rule, commit, or path is broadly excluded.
- Redacted messaging credentials recursively from channel and delivery data.
- Cleared high/critical npm audit findings and upgraded vulnerable or
  unsupported runtime dependency paths.

### Added
- Added agent guidance, review rubric, security policy, contribution guide,
  proprietary license file, editor settings, code ownership, and CI workflow.
- Added WHY, parked-work, ADR, and pull-request records so consequential changes
  preserve their rationale, evidence, alternatives, and intentional deferrals.
- Added provider-native OpenAI Responses, Anthropic, and Google adapters plus
  explicit OpenAI-compatible adapters for compatible services.
- Added a persistent provider model catalog with discovery, lifecycle tracking,
  explicit connection probes, and a Models-page synchronization action.
- Added runtime readiness checks, bounded graceful shutdown, and a dedicated
  Temporal worker container.
- Added real Slack Web API and Gmail API delivery paths; unconfigured
  credentials now fail closed instead of returning simulated success.
- Added real local TCP/filesystem security tests, provider contract tests,
  model-catalog migration/parser tests, lifecycle tests, and stream-token tests.
- Added a multi-stage Node.js 24 container build and a production-shaped Compose
  stack with non-root/read-only services, internal Redis, loopback host ports,
  persistent application/Temporal data, and required secrets.

### Fixed
- Fixed Windows production startup by disabling unsupported `reusePort` on Windows.
- Split frontend routes into lazy-loaded chunks to remove the oversized initial bundle warning.
- Made `/api/health` report actual required database, gRPC, queue, and worker
  state instead of optimistic startup state.
- Made shutdown idempotently drain HTTP, gRPC, browser, queue, and worker
  resources; fatal production startup and unhandled errors now terminate.
- Made the SQLite location honor `DATABASE_PATH`.
- Prevented ambiguous provider/model identifiers from silently selecting an
  incompatible adapter, and bypassed response caching for tools and probes.
- Migrated Google integration from the deprecated SDK to `@google/genai`.
- Updated CI action pins, Node.js 24 coverage, dependency audit, CodeQL,
  Scorecard, SBOM, and secret-scan gates.
- Removed fabricated marketplace download, rating, and verification values.
- Made Temporal worker health depend on an established Temporal connection,
  eliminating process-alive readiness false positives.
- Fixed multi-network Temporal connectivity by binding the server on all
  container interfaces and routing clients through an explicit frontend alias.
- Made the standalone production smoke explicitly opt out of the required
  Redis queue; real queue availability remains enforced by the service-stack
  integration gate.
- Updated the OpenAI fallback choices to GPT-5.6 Sol, Terra, and Luna, and made
  GPT-5.6 requests explicitly use medium reasoning unless a caller overrides
  the effort.

### Changed
- Declared Node.js `>=22 <25`, npm 11, and Node.js 24 as the container/CI
  baseline.
- Updated compatible dependency ranges and migrated dependencies that were
  more than one major line behind, including TypeScript 7, React DayPicker 10,
  React Resizable Panels 4, Hook Form resolvers 5, and Zod Validation Error 5;
  also migrated the deprecated Recharts 2 line to Recharts 3.
- Removed the unused direct `node-fetch` dependency in favor of the supported
  Node runtime transport behind governed egress.
- Model discovery is additive: newly listed models are available for selection,
  but capabilities remain unverified until an explicit connection test.
- Live catalog synchronization remains credential-backed and authoritative;
  fallback choices keep setup usable but never impersonate a successful
  provider discovery response.
- Production Compose no longer exposes infrastructure services publicly or
  mounts the Docker daemon socket.

### Verification
- Local typecheck, unit suite, build, dependency audit, and Docker stack checks
  are recorded only at their actual evidence level.
- Provider adapter tests use real local HTTP/SSE transport but not paid provider
  accounts.
- A production-shaped Compose run completed a real Redis queue operation and a
  real three-activity Temporal workflow; Temporal history contained exactly
  three activity-completion events and the completed result was re-read
  idempotently.
- A clean Linux production image ran as the HTTP app target on an isolated
  Docker bridge network and passed authentication, sandbox upload/read,
  private-address policy denial, policy-audit persistence, BullMQ dispatch,
  missing-policy fail-closed, and audit-write-failure checks.
- OpenAI live catalog discovery was attempted and returned HTTP 401; OpenAI
  discovery is therefore **not verified live** in this session.
- Slack and Gmail code paths are implemented against their provider APIs, but
  no live Slack or Gmail account was exercised in this session.
- Coverage changed from 37.72% statements / 42.55% branches / 29.85% functions
  / 43.01% lines (83/40/20/77 covered items across four test files) to 31.16% /
  26.03% / 32.05% / 32.54% (1391/820/293/1291 covered items across 21 test
  files). The percentage change is not directly comparable because the current
  suite imports and measures a much larger production source set; absolute
  covered statements increased by 1,308.
- No paid-provider inference success is claimed by this changelog.

## 0.1.0 - 2026-04-11

### Added
- Initial beta release of the Ultra Computer agent orchestration platform.
