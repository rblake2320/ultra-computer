# Code Review Rubric

Reject the change unless all hold:
1. Correctness: handles edge cases, no swallowed errors, no races.
2. Tests: new behavior has tests; negative and boundary cases covered; suite green; no test weakened to pass.
3. Security: no injection, no secrets, validated inputs, safe defaults.
4. Performance: no algorithmic regression on hot paths; no unbounded memory.
5. Clarity: names, structure, and public API are consistent; no dead code.
6. Docs: user-facing changes reflected in README or CHANGELOG.
7. Scope: atomic, conventional commit; no unrelated drive-by changes.
