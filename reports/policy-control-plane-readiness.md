# Policy Control Plane Operational Readiness Gate

Date: 2026-06-06

## Evidence Rule

This report follows `docs/VERIFICATION_POLICY.md`. Unit tests, static checks, local smoke tests, and CI checks are not represented as live production proof. Anything not exercised through the real path is labeled `UNIT ONLY`, `STATIC ONLY`, `NOT VERIFIED`, `BLOCKED`, or `GAP ACCEPTED`.

## Architecture Verdict

Verdict: directionally sound and now useful as a control-plane foundation, but not yet a complete enterprise policy architecture.

Evidence:

- Sound: the core tool/action boundary now has typed policy files, deny-by-default rules, fail-closed load behavior, redacted audit records, and focused failure tests.
- Functional: agent tool calls from orchestrator/swarm/MCP server converge on `executeTool()`, which evaluates the top-level tool policy before dispatch, then evaluates domain policy for shell, filesystem, network, browser navigation, and image provider/download paths.
- Underwired: several non-tool application egress paths still call `fetch()` outside the policy plane: OAuth/model token flows in `server/routes.ts`, `server/oauthFlow.ts`, `server/modelConnections.ts`, and outbound messaging/webhook delivery in `server/messagingHub.ts`. These are not claimed green.
- Partially integrated: audit writes are best-effort and now operator-visible on failure, but there is no durable queue, SIEM sink, alerting policy, or audit health endpoint.
- Some complexity is justified by product breadth, but the system is broad enough that policy enforcement should move toward shared middleware/helpers rather than repeated inline evaluator calls in each route.
- No dead policy files were found; each `policies/*-access.json` is loaded by `server/policyEngine.ts`. No unreachable test policy was added.
- CI permissions are mostly least-privilege; an unused `id-token: write` grant was removed from the security workflow during this gate.
- Docker live-local deployment proof now exists through `npm run live:docker`: clean Linux image build from a digest-pinned Node base image, non-root runtime user, production container startup, auth, sandbox filesystem API, private browser navigation denial, policy audit write, missing policy fail-closed behavior, and audit write failure logging.
- Hyper-V VM proof is `BLOCKED`: `Get-VM`/Hyper-V operations require Windows authorization not available in this session. Azure VM proof is `BLOCKED`: `az account show` reports that `az login` is required.

Architecture score for this gate: `PASS for core policy foundation`, `GAP ACCEPTED for full platform egress governance`.

## Wiring Trace

### Agent Tool Path

`modelRouter/orchestrator/swarm/MCP server` -> `executeTool(name,args,sessionId)` -> `tool-access.json` decision -> domain-specific evaluator (`filesystem`, `shell`, `network`) -> action execution -> `writePolicyAudit()` -> `ToolResult` success or `Policy denied`.

Evidence:

- `server/orchestrator.ts` and `server/swarmEngine.ts` call `executeTool()`.
- `server/mcpProtocol.ts` server-side tool calls call `executeTool()`.
- `server/tools.ts` gates top-level tool execution and per-domain operations.

### Browser API Path

HTTP request -> `createAuthMiddleware()` for `/api/*` unless exempt -> `registerBrowserRoutes()` -> tool policy for route action -> network policy for navigation -> `executeBrowserTool()` -> audit record -> JSON/image response or `403 Policy denied`.

Evidence:

- `server/browserRoutes.ts` gates `browse_url`, browser actions, evaluate, resize, close, and screenshots.
- `browse_url` additionally checks `network:browse`.

### Filesystem API Path

HTTP request -> `/api/*` auth -> `registerFileRoutes()` -> `resolveInside()` path containment -> filesystem policy -> file operation -> audit record -> JSON/file response or `403 Policy denied`.

Evidence:

- `server/fileRoutes.ts` gates upload destination, list, read, download, and delete under repo `sandbox`.
- Prefix-sibling escapes are separately covered by `tests/unit/pathSafety.test.ts`.

### CLI/Protocol Path

HTTP protocol route or CLI engine call -> URL/method/path validation -> network/filesystem/shell policy -> command or fetch -> redacted stdout/stderr/body metadata -> audit record -> result or deny/error response.

Evidence:

- `server/protocolRoutes.ts` gates `/api/protocols/http/request`.
- `server/cliToolEngine.ts` gates filesystem execution path, shell command, and HTTP request.

### Connector/GitHub/MCP Client Path

HTTP request -> `/api/*` auth -> `callMCPTool()` or connector validation -> GitHub tool policy for GitHub connector -> network policy for MCP/validation HTTP call -> provider call -> audit record -> response or error.

Evidence:

- `server/connectorRegistry.ts` gates GitHub validation/read-only tool names and remote MCP calls.
- `server/mcpProtocol.ts` gates remote MCP client requests/notifications.

### A2A Path

Route or client call -> A2A helper -> network policy -> outbound fetch -> response or `Policy denied`.

Evidence:

- `server/a2aProtocol.ts` gates discovery, send, stream, get task, and cancel task network calls.

## Left Out, Duplicated, Partial, or Sloppy Areas

| Item | Status | Evidence | Disposition |
| --- | --- | --- | --- |
| OAuth/model token exchange egress | GAP ACCEPTED | Direct `fetch()` exists in `server/routes.ts`, `server/oauthFlow.ts`, `server/modelConnections.ts` | Needs shared outbound HTTP client with policy enforcement. |
| Messaging/webhook delivery egress | GAP ACCEPTED | Direct `fetch()` exists in `server/messagingHub.ts` | Needs shared outbound HTTP client with policy enforcement and delivery audit correlation. |
| Policy helper duplication | GAP ACCEPTED | Inline `evaluatePolicy()` + `writePolicyAudit()` repeated across routes | Refactor to shared `enforcePolicy()` helpers before adding many more domains. |
| Audit durability | GAP ACCEPTED | JSONL file write only; write failure warns and returns false | Need production log collector/SIEM sink and alerting. |
| SSRF defense depth | GAP ACCEPTED | Evaluator blocks obvious private/loopback/link-local hosts, but does not resolve and pin DNS/IPs or validate redirect chains for every fetch path | Needs hardened outbound HTTP client. |
| Shell execution model | GAP ACCEPTED | Policy blocks dangerous patterns but still executes through shell for allowed commands | Long-term target should prefer argv-based command execution or purpose-built tools. |
| GitHub Actions immutable pinning | GAP ACCEPTED | Actions use version tags such as `@v4`, not commit SHAs | Owner: platform/security; follow-up: pin third-party actions to reviewed SHAs or document trusted-action policy. |
| Hyper-V VM gate | BLOCKED | `Get-VM` failed with Windows authorization error | Run from elevated/admin context or delegate VM provisioning to environment owner. |
| Azure VM gate | BLOCKED | `az account show` failed because Azure CLI is not logged in | Run `az login` with approved subscription and budget guardrails. |
| GitHub mutating actions | NOT VERIFIED | Mutating tools are intentionally denied | Requires explicit approval workflow before enabling. |
| Live external policy proof | NOT VERIFIED | No real GitHub/MCP/A2A/OpenAI provider calls executed in this gate | Requires credentials/services and cost/permission approval. |

## Failure Lifecycle

| Area | Detect | Log | Report | Contain / Fail Closed | Remediate | Test | Return to Normal |
| --- | --- | --- | --- | --- | --- | --- | --- |
| Filesystem | `resolveInside()` returns null, policy denies path/action | Policy audit JSONL | HTTP `400/403` or tool error | Operation not executed | Narrow policy or fix caller path | `UNIT ONLY`: policy/path tests | Re-run unit + route smoke with real file path |
| Shell | Shell policy deny rule, CLI validator deny rule, process exit/timeout | Policy audit, CLI blocked warning, redacted stdout/stderr | Tool/CLI result with deny/error | Denied commands not spawned; timeout kills process | Add purpose-built tool or narrow allow rule | `UNIT ONLY`: denied/allowed shell policy and secret-safe denial | Re-run unit + controlled command smoke |
| Network | URL parse failure, private target hard deny, method/action deny | Policy audit | HTTP `403`, tool error, thrown connector error | Fetch not called after deny | Use approved public URL/method or add narrow rule | `UNIT ONLY`: public/private/method policy tests | Re-run unit + live route test if target available |
| GitHub/tool access | GitHub connector/toolName policy deny | Policy audit | Connector validation false or route error | Mutating GitHub tools denied | Add approval workflow before narrow allow | `UNIT ONLY`: read-only allow/mutate deny | Live GitHub read test with scoped token |
| Secrets/env | Sensitive key/value redaction, safe env allowlist | Redacted audit and command outputs | User sees redacted errors | Sensitive `extraEnv` keys omitted from subprocess env | Move to secret manager; rotate leaked secrets | `UNIT ONLY`: redaction/circular/error tests | Re-run secret scan + log review |
| Policy loading | Missing/invalid policy file produces deny decision | Policy audit may record deny; route reports deny | `Policy denied: Policy load failed...` | No allow if policy cannot load | Restore valid JSON policy, run schema tests | `UNIT ONLY`: missing/invalid config test | Clear cache/restart, re-run verify |
| Audit logging | `writePolicyAudit()` returns false and warns | Redacted `console.warn` | Operator log warning; user decision unchanged | Audit failure does not grant access | Fix disk/path/permissions or collector | `UNIT ONLY`: EISDIR audit write failure | Re-run audit write test and inspect log sink |
| CI/security scans | GitHub Actions status, local commands | GitHub job logs/artifacts | PR checks red/green by job | Merge blocked by branch protections if configured | Fix code/deps/workflow | `VERIFIED LOCALLY/CI`: remote checks | Re-run failed workflow |
| Production runtime | Health smoke, logs, watchdog | Platform logs; `GET /api/health` | Health response/log alerts | Auth gate and policy denies contain unsafe actions | Rollback or patch + redeploy | `VERIFIED LOCALLY`: `npm run smoke:prod`; live deploy NOT VERIFIED | Controlled rollout after health + logs pass |
| Docker live-local runtime | Docker container health, HTTP assertions, container logs | Docker stdout/stderr and policy audit JSONL inside container | `npm run live:docker` exits non-zero on failure | Test containers are removed; denied actions are not executed | Fix code/policy/env/image and rebuild | `PASS`: `npm run live:docker` | Re-run Docker gate, then promote artifact |

## Coverage Matrix

| Area | Status | Proof | Notes |
| --- | --- | --- | --- |
| Policy schema/load valid files | UNIT ONLY | `tests/unit/policyEngine.test.ts` | Uses real parser and files, not live route. |
| Missing/invalid policy fail closed | UNIT ONLY | `tests/unit/policyEngine.test.ts` | Temp policy dirs used; proves unit behavior only. |
| Deny-by-default unknown tool | UNIT ONLY | `tests/unit/policyEngine.test.ts` | Not live tool route proof. |
| Filesystem allow/deny | PASS for Docker live-local API; UNIT ONLY for evaluator | `npm run live:docker`, `tests/unit/policyEngine.test.ts`, `pathSafety.test.ts` | Docker gate exercised real upload/read/list through production container. |
| Shell allow/deny | UNIT ONLY | `tests/unit/policyEngine.test.ts` | Denied `executeTool("bash")` exercised before spawn; live allowed shell smoke NOT VERIFIED. |
| Network public/private/method deny | PASS for private browser navigation denial; UNIT ONLY for evaluator | `npm run live:docker`, `tests/unit/policyEngine.test.ts` | Public external provider/network success remains NOT VERIFIED. |
| GitHub read-only/mutating policy | UNIT ONLY | `tests/unit/policyEngine.test.ts` | Real GitHub connector call NOT VERIFIED. |
| Redaction including circular metadata | UNIT ONLY | `tests/unit/policyEngine.test.ts` | Real production log collector NOT VERIFIED. |
| Audit write success/failure | PASS for Docker live-local file/log behavior; UNIT ONLY for helper | `npm run live:docker`, `tests/unit/policyEngine.test.ts` | SIEM/log ship remains NOT VERIFIED. |
| TypeScript compatibility | STATIC ONLY | `npm run check` | No runtime proof. |
| Dependency audit | STATIC ONLY | `npm run audit` | npm reports known vulnerabilities only. |
| Secret scan | STATIC ONLY | `gitleaks detect --no-banner --redact --source .` | Repository scan only, not runtime logs. |
| Production startup | PASS | `npm run smoke:prod` | Real local production build/health only. |
| Docker live-local production deployment | PASS | `npm run live:docker` | Real clean Linux image/container with digest-pinned base and non-root runtime user, not a Hyper-V/Azure VM. |
| CI verify | PASS | GitHub Actions Ubuntu/Windows checks | Real CI gate, not live product behavior. |
| Hyper-V VM deployment | BLOCKED | Hyper-V commands require unavailable Windows authorization | Needs elevated/admin VM rights. |
| Azure VM deployment | BLOCKED | Azure CLI not logged in | Needs `az login`, subscription selection, and approved spend controls. |
| Live GitHub/MCP/A2A/OpenAI | NOT VERIFIED | No real credentials/services exercised | Needs explicit live test plan and scoped credentials. |
| OAuth/model egress policy | GAP ACCEPTED | Direct fetches identified | Owner: platform/security; follow-up: shared governed HTTP client. |
| Messaging egress policy | GAP ACCEPTED | Direct fetches identified | Owner: platform/security; follow-up: shared governed HTTP client. |
| Audit alerting/retention | GAP ACCEPTED | File-only audit | Owner: operations; follow-up: log collector/SIEM integration. |
| GitHub Actions immutable pinning | GAP ACCEPTED | Workflow actions use version tags, not reviewed commit SHAs | Owner: platform/security; follow-up: pin or document trusted-action exception policy. |

## Current Best-Practice Alignment

Primary sources checked on 2026-06-06:

- OWASP ASVS Cheat Sheet index maps secure coding/architecture, security logging/error handling, input validation, file handling, authorization, secrets, and secure communication areas to relevant cheat sheets: https://cheatsheetseries.owasp.org/IndexASVS.html
- OWASP Logging Cheat Sheet recommends recording action/object/result/reason and sanitizing event data, and says logging failures should not prevent the application from otherwise running or leak information: https://cheatsheetseries.owasp.org/cheatsheets/Logging_Cheat_Sheet.html
- OWASP OS Command Injection Defense recommends avoiding direct OS commands where possible and separating commands from arguments when commands are required: https://cheatsheetseries.owasp.org/cheatsheets/OS_Command_Injection_Defense_Cheat_Sheet.html
- OWASP SSRF Prevention in Node.js warns that hostname-string checks and initial DNS checks are insufficient against redirects, DNS rebinding, alternative IP forms, IPv6, and normalization issues: https://owasp.org/www-community/pages/controls/SSRF_Prevention_in_Nodejs.html
- OWASP Secrets Management Cheat Sheet emphasizes least privilege, automation/rotation, attribution, monitoring, and guardrails for secret access: https://cheatsheetseries.owasp.org/cheatsheets/Secrets_Management_Cheat_Sheet.html
- GitHub Actions Secure Use Reference recommends least-privilege `GITHUB_TOKEN` permissions, masking sensitive data, auditing how secrets are handled, and reviewing logs after valid/invalid input tests: https://docs.github.com/en/actions/reference/security/secure-use
- SLSA frames supply-chain controls as standards to prevent tampering and improve artifact integrity: https://slsa.dev/
- npm audit docs state `npm audit` submits dependency metadata to the registry and reports known vulnerabilities; it requires `package.json` and `package-lock.json`: https://docs.npmjs.com/auditing-package-dependencies-for-security-vulnerabilities/

Assessment:

- Good alignment: deny-by-default policy, least-privilege CI permissions after removing unused OIDC token permission, dependency audit, SBOM, Scorecard, CodeQL, redacted audit logging, and explicit failure labels.
- Needs improvement: shared outbound HTTP client with DNS/IP/redirect hardening, durable audit sink/alerting, argv-based shell execution for allowed commands, immutable action pinning/trusted-action policy, and full live external capability tests.

## Final Answers

- Are all areas wired correctly? No. Core tool/control-plane areas are wired; non-tool OAuth/model/messaging egress remains outside policy.
- What areas pass with real proof? Local production startup and CI verify pass. They prove local/CI behavior only.
- What areas are only unit-level proof? Policy evaluation, redaction, audit write behavior, allow/deny rules, and fail-closed loading.
- What failed and what happens when it fails? Missing/invalid policies deny; audit write failures warn and do not grant access; denied actions return `Policy denied`; command output is redacted.
- What is the recovery path? Restore valid policy, fix audit path/collector, narrow policy rules rather than broad allow, rerun focused tests and full verify, then roll out under health/log observation.
- Is the architecture sound or does it need refactor? Sound as a first-pass control plane; it needs refactor toward shared policy helpers and a governed outbound HTTP client before broad production claims.
- Is anything bloated/sloppy/dead/duplicated? The repo is broad and has repeated inline policy/audit calls. No dead policy files found. Duplication should be reduced before expanding policy domains.
- Is anything left out or forgotten? Yes: OAuth/model/messaging egress, durable audit operations, full live external tests, and redirect/DNS-hard SSRF protection.
- Are practices current, with citations? Yes, sources are listed above and were checked during this gate.
- Which gaps remain and why were they not fixed? Shared HTTP egress, audit SIEM, shell argv refactor, immutable action pinning policy, live provider tests, and GitHub mutation workflow remain because they require broader design, dependency trust review, credentials/services, or operational infrastructure beyond this safe local patch.
