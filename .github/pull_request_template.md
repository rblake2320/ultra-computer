## Summary

## Why
- Rationale: `WHY-NNNN` or explanation for a non-consequential change
- Decision record: `docs/decisions/NNNN-*.md` or `Not required` with reason
- Alternatives considered:

## Scope and compatibility
- [ ] Public APIs and function signatures are unchanged
- [ ] Database schemas and stored-data semantics are unchanged
- [ ] Authentication and authorization semantics are unchanged
- [ ] Model/provider routing semantics are unchanged
- [ ] Deployment requirements and defaults are unchanged
- [ ] Any checked item above that is false is explicitly flagged for human review

## Verification
- [ ] `npm run check`
- [ ] `npm run test:unit -- --run`
- [ ] `npm run test:coverage`
- [ ] `npm run build`
- [ ] `npm run audit`
- [ ] `npm run verify` (full pipeline)
- [ ] `gitleaks detect --no-banner --redact --source .`
- [ ] `npm run smoke:prod`
- [ ] `npm run live:docker` (required `live-docker` CI check)

## Evidence Labels (per docs/VERIFICATION_POLICY.md)
- VERIFIED LIVE / VERIFIED LOCALLY / UNIT-LEVEL ONLY / STATIC ONLY / NOT VERIFIED / BLOCKED

## Risk
- [ ] Auth / webhook / sandbox / CLI behavior changed
- [ ] Policy rules changed (add `POLICY_DIR` evidence)
- [ ] Durable execution path changed (add workflow ledger evidence)
- [ ] User-facing behavior changed

## Evidence
- Evidence label:
- Commands and results:
- Live evidence or exact reason it is not required:

## Deferred work
- Parked item: `PARK-NNNN`, or `None`
- Current risk and reactivation trigger:

## Documentation
- [ ] `CHANGELOG.md` records what changed
- [ ] `WHY.md` records why consequential behavior changed
- [ ] `PARKED.md` records known deferred work
- [ ] README, runbooks, and environment examples match actual behavior
