# Architecture Decision Records

Architecture Decision Records preserve the context and reasoning behind
long-lived technical decisions. Use an ADR when a change affects architecture,
public APIs, stored data, authentication or authorization, model routing,
security boundaries, deployment topology, or operational guarantees.

## Process

1. Copy `0000-template.md` to the next sequential number and a short slug, for
   example `0001-model-capability-contract.md`.
2. Open the ADR as **Proposed** before implementation when human review or a
   breaking decision is required.
3. Record credible alternatives and consequences, including security, cost,
   migration, and rollback implications.
4. Link the ADR from `WHY.md`, the pull request, and relevant documentation.
5. Mark it **Accepted** only when the decision is approved.
6. Never delete or rewrite an accepted ADR. Supersede it with a new ADR.

## Status values

- **Proposed**
- **Accepted**
- **Rejected**
- **Deprecated**
- **Superseded by ADR-NNNN**

The changelog explains what shipped. `WHY.md` explains the concise product and
engineering rationale. ADRs contain the durable technical decision.
