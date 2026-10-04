---
title: The dashboard shows a change's full plan with an Approve button
depends_on: ["146", "147"]
verify: pnpm verify
features:
  reads: [status-inspection, spec-lint-and-approve, cli-foundation, metrics-and-reporting, watcher-and-harness]
---
## Goal

A reviewer can approve a change from the dashboard on a phone without opening
a shell or the change folder. For an active change without `.run/approved`,
the web change document gains a `review`: the proposal's goal, non-goals,
surface, decisions, human steps and contract, each delta requirement next to
the living requirement text it replaces, and the approval digest with its
flags. The change view shows those in that order, then the tasks, the digest,
and the actions, with every fired flag and its excerpt beside the Approve
button. An approved, archived or rejected change looks exactly as it does
today. This is M2 item 2.

## Verify

`pnpm verify`

It runs the CLI and UI typechecks, the build, every test, and lint. The new
`tests/web-data-review.test.ts` builds unapproved changes with every delta
operation against a living spec and checks the `review` document, and that
approved, archived and rejected changes get `review: null`. The new
`tests/ui-review.test.tsx` renders the review in order, the flags beside the
Approve button, the unchanged view of a change without a review, the
narrow-width CSS rules, and a view built from a real `getWebChange` document.

## Non-goals

- A rendered text diff inside a requirement; the living and proposed texts
  side by side are enough.
- Rendering Markdown. Proposal and requirement text shows as preformatted,
  wrapped plain text, as the brief does today.
- The land view (M2 item 3).
- Editing the plan in the browser.
- Changing the actions endpoint, which buttons apply, or what a tap runs.
- Changing `osq show`, `osq show --json` or `SpecDetails`.

## Surface

- Added: `review` field on the web change document (`GET /api/changes/<id>` and the static export's change documents).
- Added: the change view's review sections (`Goal`, `Non-goals`, `Surface`, `Decisions`, `Human steps`, `Contract`, `Deltas`, `Approval digest`) for an unapproved change, and the approval flags beside the `Approve` button.

## Decisions

- ADR 009: unaffected; the Approve and Reject buttons still post through the existing loopback actions endpoint, and this change adds no write path or request.

## Contract

### Requirement: Approve review document

For an active change without `.run/approved`, `WebChange.review` SHALL carry
the proposal's sections, every delta requirement with the living text it
replaces, and the approval digest with its flags; for every other change it
SHALL be null.

#### Scenario: Modified requirement carries its living text
- **WHEN** an unapproved change's delta modifies a living requirement
- **THEN** its review entry holds the proposed block and the living block `osq spec` prints

#### Scenario: Approved change has no review
- **WHEN** the change has `.run/approved`, or is archived or rejected
- **THEN** `review` is null

### Requirement: Approve review view

The change view SHALL show an unapproved change's review in order, then the
tasks, the digest and the actions, with each flag's label and excerpt beside
the Approve button, readable at phone width.

#### Scenario: Flag beside Approve
- **WHEN** the actions hold `approve` and the review digest has a flag
- **THEN** the flag's label and excerpt render inside the Approve button's item

## Human steps

### Before approval

None

### After landing

- Run `pnpm build` in this checkout, because the globally linked `osq` serves `dist/` and `ui/dist`.

## Delta

- `specs/web-inspection/spec.md`: adds "Approve review document" and
  "Approve review view".

Two tasks, in order. Task 1 builds the `review` document in `src/core/web/`.
Task 2 renders it in `packages/ui/`. No file is shared between tasks.

## Background

**What already exists.** Since 147, `getSpecDetailsFromFolder`, which
`getWebChange` already calls, returns `goal`, `nonGoals`, `contract`,
`surface`, `decisions`, and `digest` (`buildApprovalDigest`'s digest when
`approvedHash` is null, else null). The digest's `humanSteps` is the whole
`## Human steps` section and `formatApprovalDigest` renders the digest body
the way `osq approve` prints it, without flags. `parseDelta` in
`src/core/spec/delta.ts` gives a delta's added and modified requirements
with their verbatim `raw` block, removed requirement names, and renames as
`from`/`to`. `parseCapabilitySpec` gives a living spec's requirements with
`raw`, the block `lookupRequirement` (`osq spec <capability> <requirement>`)
prints, matched by `normalizeRequirementName`.

**Why `review` is optional in the type.** `tests/ui-change.test.tsx` and
`tests/ui-actions.test.tsx` build `WebChange` literals and are typechecked by
the UI typecheck. A required field would break them, and they are frozen. So
`WebChange` gains `review?: WebReview | null`, and `getWebChange` always sets
it. The view treats a missing and a null `review` alike.

**Why no Markdown renderer.** web-inspection's "Frontend dependency and size
boundaries" allows only React, React DOM and Vite in the UI, and the brief is
already shown as preformatted text. The review does the same with
`white-space: pre-wrap`, so long lines wrap on a phone instead of scrolling
the page. The planner template's HTML comments are stripped from the
section texts so a reviewer sees only what the planner wrote.

**Where the flags go.** The actions load after mount, so a static render, and
a static export, never shows the Approve button. The change view passes the
digest's flags to the actions panel, which shows them beside the Approve
button, or above the buttons when the change has no approve action. Without
an action client, the digest section lists the flags itself, so a static
export still shows them.

**Measured on 2026-10-04** in a scratch worktree at 147 with a rough cut of
task 1 (a `review?` field filled by a new `web-data-review.ts` from
`SpecDetails`, `parseDelta` and `parseCapabilitySpec`): both typechecks
passed, and all 118 tests in `tests/web*`, `tests/serve*`, import-graph,
line-budget and function-budget, and all 104 tests in `tests/ui*.test.tsx`,
passed unchanged. `getWebChange` on this repository gave `review: null` for
147 and a full review for 148. No existing test changes.
