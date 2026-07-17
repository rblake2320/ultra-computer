# CLAUDE.md
@AGENTS.md

## Project-Specific Safety Rules

- Keep `WHY.md`, `PARKED.md`, relevant ADRs, and `CHANGELOG.md` current in the
  same change as the behavior they explain. A code diff without its rationale,
  evidence, and known deferrals is incomplete.
- Never replace a maintained HTML sanitizer with regex-based sanitization.
- Never add a model by hard-coded name alone; require discovery, capability and
  lifecycle metadata, provider-native compatibility, and regression tests.
- Never claim a feature is wired from static presence or a mocked test. Trace
  the UI action through its server boundary and label every unexercised external
  dependency explicitly.
