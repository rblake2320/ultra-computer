# Changelog

All notable changes to this project will be documented in this file.

## [Unreleased] - 2026-07-16

### Security
- Added separator-aware sandbox path containment to block prefix-sibling escapes.
- Cleared npm audit findings by upgrading vulnerable Anthropic SDK and Drizzle ORM ranges.
- Added browser API key propagation for REST and EventSource-backed production UI requests.

### Added
- Added agent guidance, review rubric, security policy, contribution guide,
  proprietary license file, editor settings, code ownership, and CI workflow.
- Added WHY, parked-work, ADR, and pull-request records so consequential changes
  preserve their rationale, evidence, alternatives, and intentional deferrals.

### Fixed
- Fixed Windows production startup by disabling unsupported `reusePort` on Windows.
- Split frontend routes into lazy-loaded chunks to remove the oversized initial bundle warning.

## 0.1.0 - 2026-04-11

### Added
- Initial beta release of the Ultra Computer agent orchestration platform.
