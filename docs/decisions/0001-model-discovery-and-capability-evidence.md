# ADR-0001: Separate model discovery from compatibility evidence

- **Status:** Accepted
- **Date:** 2026-07-16
- **Decision owners:** Product and model platform
- **Related:** WHY-0002, PARK-0002, PARK-0003

## Context

Provider model identifiers, aliases, endpoints, parameters, and supported
features change independently of Ultra Computer releases. A hard-coded catalog
becomes stale, while automatically treating every discovered identifier as
compatible can send invalid requests or silently change cost and behavior.

## Decision

Provider model discovery is stored separately from configured models.
Discovered entries carry their source, lifecycle, timestamps, provider
metadata, and compatibility status. Discovery alone leaves compatibility
`unverified` and does not enable a model or replace a pinned/default model.

Adapters expose normalized capabilities and events. Routing may select a model
only when the required capabilities have verified evidence. Providers without a
discovery API continue to support explicit manual configuration.

## Alternatives considered

### Maintain a hard-coded current-model list

Rejected because model releases and retirements routinely occur between Ultra
Computer releases.

### Treat every provider model as OpenAI Chat Completions compatible

Rejected because endpoints, content formats, tools, reasoning controls,
streaming events, and accepted parameters differ across providers and models.

### Automatically probe and enable every discovered model

Rejected as a default because probes may be billable and enabling a model can
change production quality, cost, latency, or safety behavior.

## Consequences

### Benefits

- Newly released models appear without an Ultra Computer code release when the
  provider exposes a catalog API.
- Unsupported models fail explicitly rather than through malformed inference.
- Pinned/default selections remain stable.
- Retirement and compatibility evidence remain auditable.

### Costs and risks

- Provider discovery endpoints and pagination require maintenance.
- Some model capabilities cannot be proven without a billable request.
- Catalog persistence adds an additive database migration.

## Security and privacy

Catalog synchronization uses configured provider credentials server-side.
Credentials are never returned in catalog records. Requests use bounded,
policy-governed egress. Billable probes remain parked until cost, consent, and
data-handling controls are approved.

## Compatibility and migration

The `model_catalog` and `model_probe_results` tables are additive. Existing
configured models and public model routes remain unchanged. Catalog APIs are
additive and do not activate discovered models.

## Verification

- Fresh and existing SQLite databases create the additive tables idempotently.
- Provider parsers reject malformed responses instead of returning success.
- Real provider sync records returned IDs without invented capabilities.
- Missing models are marked retired only after a successful provider sync.
- Existing default and orchestrator model records remain unchanged.

## Rollback

Stop exposing the catalog routes and stop synchronizing. The additive tables can
remain unused; no configured model data depends on them.

## Follow-up

Billable probes and automatic replacement policies remain in `PARKED.md`.
