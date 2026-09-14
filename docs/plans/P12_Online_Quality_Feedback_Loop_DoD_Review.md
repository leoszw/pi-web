# P12 Online Quality Feedback Loop DoD Review

## Scope

P12 is implemented on `feat/industry-online-quality-p12`, based on the P11 close commit:

```text
90609b34e0975772be148ad9b4ea869146bfb4a0
```

The phase remains deterministic and mock-backed. It does **not** connect a real production telemetry stream, real online feedback warehouse, production dataset registry, or automatic Golden promotion flow.

All Online Dashboard and Dataset Health aggregate values explicitly report:

```text
source = MOCK_FIXTURE
```

so the UI cannot be mistaken for real production monitoring.

## Online Dashboard

Route:

```text
/industry/quality
```

BFF:

```text
GET /api/industry/v1/quality/online
```

The dashboard covers all planned P12 online quality dimensions:

```text
Intent drift
Clarification
Zero retrieval
Low confidence
Tool error
Mutation reject
RAG insufficient evidence
P95 latency
Average token usage
Average cost
User correction
```

Each metric includes current value, previous value, delta, warning/failure thresholds, unit, and PASS/WARN/FAIL status.

Mock quality signals link back to trusted Trace IDs so a reviewer can inspect evidence in the existing P5 Trace Explorer.

## Trace -> Draft Eval workflow

Implemented state flow:

```text
Trace
 -> sanitize
 -> SANITIZED
 -> Draft Case
 -> DRAFT
 -> Human Label
 -> LABELED
 -> Review
 -> REVIEWED
 -> Dataset Version
 -> VERSIONED
```

The browser submits only:

```text
traceId
targetDomain
```

for Trace conversion.

Trusted project/user scope is always supplied by the BFF context.

The router reads only Basic Trace:

```text
debug = false
prompt = false
audit = false
```

and performs an additional sanitization pass before creating feedback. Prompt/debug/audit payloads are therefore not used as Draft input.

Representative secret patterns sanitized include:

```text
Bearer credentials
sk-* API keys
approval-* tokens
MySQL/PostgreSQL DSNs
api key/password/cookie/authorization key-value forms
```

## Feedback domains

P12 supports online feedback routing into:

```text
INTENT
RETRIEVAL
RAG
TOOL
MUTATION
MEMORY
```

Each feedback item records:

```text
feedbackId
projectId
traceId
targetDomain
stage
sanitizedInput
sanitization evidence
human label
human labeler
difficulty
tags
reviewer/review time
dataset version
```

All feedback is isolated by trusted active project.

## Human labeling and review

Label requests accept only:

```text
label
tags
difficulty
notes
```

Review requests accept only:

```text
approved = true
reviewNote
```

State transitions fail closed. For example:

- labeling before DRAFT returns `ONLINE_FEEDBACK_INVALID_STATE`;
- versioning before REVIEWED is rejected;
- the same item cannot be versioned twice;
- action bodies cannot inject project/user/reviewer/golden fields.

## Dataset Version

Endpoint:

```text
POST /api/industry/v1/quality/feedback/:feedbackId/version
GET  /api/industry/v1/quality/dataset/versions
```

Every generated P12 dataset version is fixed to:

```text
status = REVIEWED
golden = false
```

The version records a stable SHA-256 fingerprint, creating user, source feedback IDs, and case count.

P12 intentionally has **no** endpoint or browser action for:

```text
Make Golden
Promote to Golden
Auto Golden
```

Requests to guessed `/golden` or `/promote` routes return not found.

This preserves the plan rule:

```text
online sample -> sanitize -> human label -> review -> dataset version
```

without automatic Golden conversion.

## Authorization model

Read:

```text
quality.read
or quality.admin
```

Create Draft / label:

```text
quality.read + quality.feedback.edit
or quality.admin
```

Trace conversion additionally always requires:

```text
trace.read.basic
or trace.admin
```

`quality.admin` does not bypass Trace permissions.

Review:

```text
quality.read + quality.feedback.review
or quality.admin
```

Dataset Version requires both a Quality review authority and Dataset edit authority:

```text
(quality.admin OR quality.read + quality.feedback.review)
AND
(eval.dataset.edit OR eval.admin)
```

Therefore:

- `eval.admin` alone is not Quality read authority;
- `quality.admin` alone cannot version evaluation datasets;
- Quality administration does not imply Trace access;
- Dataset edit permission does not imply Quality review permission.

## Dataset Health

Endpoint:

```text
GET /api/industry/v1/quality/dataset/health
```

The UI displays the planned health dimensions:

```text
Reviewed %
Hard / adversarial count and %
Tag distribution
Duplicate count
Near-duplicate count
Holdout leakage count
Label churn rate
Last review age
```

Health issues are represented explicitly as typed findings such as:

```text
DUPLICATE
NEAR_DUPLICATE
HOLDOUT_LEAKAGE
LABEL_CHURN
STALE_REVIEW
```

The current deterministic health fixture includes duplicate, near-duplicate, and label-churn warnings; holdout leakage is zero.

## Web UI

Added:

```text
web/src/features/p12/OnlineQualityPage.tsx
web/src/features/p12/p12.css
web/src/api/p12-client.ts
```

The page contains:

1. Online Dashboard.
2. Quality signals with Trace links.
3. Trace -> sanitize form.
4. Feedback Queue.
5. Stage-specific Human Label / Review / Version controls.
6. Dataset Health.
7. Dataset Versions.

P12 is exposed as the top-level route:

```text
/industry/quality
```

and linked from the Evaluation Overview.

The UI explicitly shows `MOCK_FIXTURE` data source and explains that P12 does not provide a Golden promotion action.

## Review round 1

Reviewed strict TypeScript boundaries, route order, quality metrics, state transition ordering, data-source truthfulness, and authorization composition.

Fixes:

1. `eval.admin` no longer grants Quality read implicitly.
2. `quality.admin` no longer grants Trace access implicitly.
3. Trace -> Draft always requires `trace.read.basic` or `trace.admin` independently.
4. Dataset Version requires Dataset edit authority even for `quality.admin`.
5. Review/notes received explicit request-length limits.
6. Sanitization was broadened to cover password/cookie/authorization-style fields.
7. Online Dashboard and Dataset Health now explicitly report `MOCK_FIXTURE`.
8. Web tests were corrected to assert human-readable metric labels instead of brittle derived text.

## Review round 2

Reviewed Golden boundaries, project isolation, action-body injection, state skipping, duplicate active feedback behavior, Trace surface separation, Dataset governance separation, and UI route precedence.

Result:

- no Golden/Promote API exists in P12;
- generated versions remain `REVIEWED / golden=false`;
- cross-project feedback lookup returns not found;
- feedback writes cannot inject project/user/reviewer status;
- Basic Trace is the only Trace surface read by conversion;
- Web request bodies contain no trusted scope fields;
- Online Quality route is resolved before the generic `/industry/*` catch-all;
- P12 does not change P11 Release Gate or Baseline semantics.

## Regression tests

Server:

```text
server/test/p12-online-quality.test.ts
```

Coverage includes:

- quality.read permission;
- active-project requirement;
- all 11 online metrics;
- MOCK_FIXTURE source marking;
- Trace-backed signal IDs;
- strict create body / scope injection rejection;
- sanitized Trace conversion;
- state-skip rejection;
- full SANITIZED -> DRAFT -> LABELED -> REVIEWED -> VERSIONED flow;
- reviewer/labeler sourced from trusted context;
- `REVIEWED / golden=false` Dataset Version;
- repeat-version rejection;
- no `/golden` or `/promote` route;
- independent Quality / Trace / Dataset permissions;
- project isolation;
- all planned Dataset Health dimensions.

Web:

```text
web/test/p12-client.test.ts
web/test/p12-quality-page.test.tsx
web/test/p12-routing.test.tsx
web/test/eval-overview.test.tsx
```

Coverage includes:

- exact request payloads with no trusted scope/Golden fields;
- empty action bodies where required;
- all P12 metric labels;
- explicit MOCK_FIXTURE source;
- Trace -> Draft flow rendering;
- Dataset Health dimensions;
- absence of executable Make Golden / Promote controls;
- `/industry/quality` route precedence;
- Evaluation Overview P12 link.

`server/test/p12-online-quality.test.ts` is included in `npm run test:server`; Web tests continue to use the existing `web/test` glob.

## Execution status

An execution attempt was made:

```text
git clone --depth 1 --branch feat/industry-online-quality-p12 https://github.com/leoszw/pi-web.git
npm run typecheck
npm run test:server
npm run test:web
npm run build
```

The clone failed before repository access:

```text
fatal: unable to access 'https://github.com/leoszw/pi-web.git/':
Could not resolve host: github.com
```

Therefore this review does **not** claim successful execution of typecheck, server tests, web tests, or build.

Current verification state:

```text
implementation complete
+ regression tests authored
+ two static review rounds complete
+ command execution blocked by environment DNS
```

## P12 result

| Requirement | Result |
| --- | --- |
| Online Dashboard | PASS (implementation/static review) |
| Intent drift | PASS |
| Clarification | PASS |
| Zero retrieval | PASS |
| Low confidence | PASS |
| Tool error | PASS |
| Mutation reject | PASS |
| RAG insufficient evidence | PASS |
| Latency | PASS |
| Token / cost | PASS |
| User correction | PASS |
| Trace -> sanitize -> Draft -> Human Label -> Review -> Dataset Version | PASS |
| Basic Trace only | PASS |
| Dataset Health | PASS |
| Reviewed % | PASS |
| hard/adversarial | PASS |
| tag distribution | PASS |
| duplicate / near duplicate | PASS |
| holdout leakage | PASS |
| label churn | PASS |
| last review age | PASS |
| Automatic Golden disabled | PASS |
| Cross-project isolation | PASS |
| Quality / Trace / Dataset permission separation | PASS |
| Real production telemetry | NOT CONNECTED; MOCK_FIXTURE only |
| Actual typecheck/test/build execution | BLOCKED BY ENVIRONMENT |

P12 completes the planned P0-P12 implementation sequence at the mock/control-plane level. The remaining prerequisite before release/merge is command-level verification in an environment that can access the repository and dependencies, plus any future integration of real production telemetry and governed dataset backends.
