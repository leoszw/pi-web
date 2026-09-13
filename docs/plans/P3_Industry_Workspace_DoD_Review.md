# P3 Industry Workspace + UIAction DoD Review

## Scope

This review closes P3 on `feat/industry-workspace-p3` at the code/test level. P3 remains mock-only: no real MySQL, OpenSearch, LLM, mutation DML, approval token, or commit path is introduced.

## DoD evidence

| Requirement | Status | Evidence |
| --- | --- | --- |
| Workspace mock end-to-end | PASS (code/test) | `/industry` -> `IndustryWorkspacePage`; Conversation API -> Event Gateway -> UIAction Registry -> interaction response channel |
| Event reconnect recovery | PASS (code/test) | monotonic `sequenceNo`, `afterSequenceNo`, eventId dedupe, gap detection, unknown event ignore, interaction events persisted in conversation stream |
| UIAction registry complete | PASS (code/test) | entity_picker, form, editable_form, table, multi_select, date_picker, diff, mutation_confirmation, report_preview, error_resolution |
| raw HTML prohibited | PASS (code/test) | React text rendering only; no `dangerouslySetInnerHTML`; XSS fixture is asserted escaped |
| 18-digit ID precision | PASS (code/test) | `123456789012345678` is retained as a string through fixture, API, selection and rendering |
| DataTable server pagination | PASS (code/test) | `table_query` interaction returns server-sliced fixture pages |
| DataTable sort allowlist | PASS (code/test) | unsupported sort keys return `UI_ACTION_SORT_NOT_ALLOWED` |
| DataTable filter allowlist | PASS (code/test) | unsupported filter keys return `UI_ACTION_FILTER_NOT_ALLOWED` |
| DataTable stable cursor | PASS (code/test) | cursor fingerprint binds actionId + pageSize + sort + filters; changed query rejects stale cursor |
| DataTable reconnect state | PASS (code/test) | sort/filter query state is persisted in the updated `ui.action.presented` event alongside the cursor |
| DataTable row selection | PASS (code/test) | `table_selection` uses string row IDs and validates against the immutable fixture snapshot |
| Export snapshot reference | PASS (code/test) | table payload exposes immutable-style `exportSnapshotRef`; actual export remains a placeholder |
| Mutation boundary | PASS (code/test) | mutation_confirmation is display-only; interaction API returns `UI_ACTION_MUTATION_DISABLED_P3`; no commit/DML path |
| Approval Token absent | PASS (code/test) | UIAction fixture tests assert no approval token field/content is exposed |
| Two review rounds | PASS | findings and fixes summarized below |

## Interaction contract

P3 uses one server-owned interaction endpoint:

```text
POST /api/industry/v1/conversations/:conversationId/ui-actions/:actionId/interactions
```

Supported non-commit interaction kinds:

```text
entity_selection
form_submit
table_query
table_selection
multi_select
date_select
```

The browser cannot provide tenant/company/user/project/trace scope through this request. The BFF uses strict request-key allowlists and trusted server context.

## Review round 1

Findings fixed:

1. Ordinary conversation messages initially risked receiving default UIAction events, which would have changed the established `1 -> 2 -> 3` event sequence. UIActions are now emitted only for explicit mock UIAction scenarios.
2. DataTable pagination initially exposed cursor metadata without a real server query path. A server-side fixture query engine and interaction route were added.
3. Sort/filter keys are now enforced by server allowlists instead of being trusted from the browser.
4. P3 mutation confirmation is explicitly rejected by the interaction adapter so the UI cannot accidentally become a P4 commit surface.

## Review round 2

Findings fixed:

1. Strict TypeScript validation required narrowing `pageSize` to a number before `Number.isInteger`.
2. Cursor-only recovery was insufficient: after reconnect, the browser could lose the sort/filter state that produced the cursor and then trigger a cursor mismatch. DataTable payloads now persist the normalized query state (`sort` + `filters`) in `ui.action.presented` events.
3. Repeated presentations of the same action are reduced to the latest action state by `actionId`, preventing duplicate action cards after interaction/reconnect.
4. Interaction events are now first-class known Event Gateway events so the reconnect cursor advances over them deterministically.

## Regression coverage

Server coverage includes:

- ordinary Conversation sequence remains unchanged;
- all ten UIAction types;
- monotonic UIAction event sequence;
- 18-digit row IDs remain strings;
- server pagination and previous/next cursors;
- sort/filter allowlist rejection;
- stale cursor/query mismatch rejection;
- interaction event replay/reconnect;
- scope injection rejection;
- P3 mutation confirmation rejection;
- Approval Token absence.

Web coverage includes:

- three-column Workspace;
- all ten UIAction renderers;
- server DataTable controls;
- latest-action reduction after interaction events;
- interaction event recognition;
- query state restoration;
- HTML escaping;
- 18-digit string ID rendering;
- P3 mutation confirmation disabled state.

## Verification limitation

The GitHub connector can write/read the repository but cannot execute npm scripts. An isolated `git clone` attempt also failed because the execution environment could not resolve `github.com`. Therefore `npm run typecheck`, `npm run test:server`, and `npm run test:web` are **not claimed as executed PASS** in this review.

Before merge/release, run:

```bash
npm run typecheck
npm run test:server
npm run test:web
npm run build
```

## P3 close decision

P3 is complete at the implementation + static-review + regression-test-definition level. The next implementation phase is P4 Mutation Center. P4 must preserve the P3 boundary: the browser never receives an Approval Token, confirmation requires digest + explicit confirmation, commit is server-side, and unsafe retry is forbidden.
