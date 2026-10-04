---
title: osq show's change detail is one model the CLI and the browser render
depends_on: []
verify: pnpm verify
features:
  reads: [spec-lint-and-approve, web-inspection, cli-foundation, metrics-and-reporting, traceability, watcher-and-harness]
---
## Goal

`src/core/status/show.ts` is 1,172 lines and mixes reading a change folder
with printing it. After this change, model modules build `SpecDetails` from
the change folder, renderer modules turn it into text and read no files, and
`show.ts` is only the facade every caller already imports. The model also
carries what an approve view needs and `osq show` does not print: the
proposal's `## Surface` and `## Decisions`, its `### Before approval` steps,
and the approval digest of an unapproved change, computed in core instead of
in `src/cli/show.ts`. `osq show` and the dashboard then read one model, and
`approve-view` can render the digest without asking the CLI. `osq show <id>`
and `osq show <id> --json` print exactly what they print today. This is
refactoring candidate 2 on the Notion roadmap.

## Verify

`pnpm verify`

It runs the CLI and UI typechecks, the build, every test, and lint. The line
budget test proves `show.ts` left the allow list, the function budget test
proves `buildSpecDetails` and `formatSpecDetails` left the grandfather list,
and every existing show test passes unchanged. Each task's verify also runs
`identity/compare.ts` in this change folder, which renders every change in
the repository and in `fixture/inbox` with a frozen copy of today's show code
and with the current `showCommand`, in both modes, and fails on any byte of
difference.

## Non-goals

- Changing anything `osq show` or `osq show --json` prints.
- Changing the web change document (`WebChange`); `approve-view` does that.
- Giving `getSpecDetailsFromFolder` the next step, after-landing notes or
  verification history it leaves out today.
- Refactoring candidates 1 and 3 (the shared change model across planning and
  inspection).
- Splitting `src/core/spec/digest.ts` or changing what the digest holds.

## Surface

None

## Decisions

None. No accepted ADR governs status-inspection.

## Contract

### Requirement: Change detail model

Model modules SHALL build `SpecDetails` and renderer modules that read no
files SHALL print it, with `show.ts` only the facade. The model SHALL carry
the proposal's Surface, Decisions and Before approval text, and the approval
digest for a change without `.run/approved`, from both `getSpecDetails` and
`getSpecDetailsFromFolder`.

#### Scenario: Unapproved change carries its approve view
- **WHEN** `getSpecDetails` reads an unapproved change whose proposal has a Surface line, a Decisions line and a Before approval step
- **THEN** `surface`, `decisions` and `beforeApproval` hold those texts and `digest` equals `buildApprovalDigest` for the folder

### Requirement: Show output from the model

`osq show` and `osq show --json` SHALL print through `formatShowText` and
`formatShowJson` and print what they printed before.

#### Scenario: Output is unchanged
- **WHEN** `osq show <id> --json` runs on an unapproved change
- **THEN** the JSON has no `surface`, `decisions` or `beforeApproval` key and `digest` is its last key

## Human steps

### Before approval

None

### After landing

None

## Delta

- `specs/status-inspection/spec.md`: adds "Change detail model" and "Show
  output from the model".

Two tasks, in order. Task 1 moves the types and the text renderer out of
`show.ts`. Task 2 moves the model out, adds the new fields, and makes the CLI
only render. Shared files, owned by task 1 and extended by task 2:
`src/core/status/show.ts`, `src/core/status/show-types.ts` and
`tests/function-budget.test.ts`. Task 2's `src/core/status/show*.ts` glob
also covers task 1's renderer files, which it does not need to change.

## Background

**The byte-identity proof.** `identity/legacy-show.ts` is `show.ts` copied
before this change, with its imports pointed back at `src/`, and
`identity/compare.ts` renders every change `listChanges` finds, in the
repository and in `fixture/inbox`, through that copy plus the old CLI
composition and through the current `showCommand`. It compares the printed
text of both modes, and an error's message, byte for byte, skipping only its
own change folder because the watcher appends to that folder's events while
it runs. It compares live, not against stored hashes, because `osq land`
appends `verify_ran` and `synced` events to archived changes, so stored output
would go stale. Test files named as its arguments run first, and a missing
or failing one stops it, so each task's verify is one command that starts
red until the task's new test exists. It takes about three and a half
minutes for 162 changes. It
is a task verify only, never the change-level verify or a `check`, because
those run again after archive, when this folder has moved.

**Why `show.ts` stays.** Ten test files and three source files import
`getSpecDetails`, `getSpecDetailsFromFolder`, `formatSpecDetails` or
`formatShowOutput` from `show.js`. Keeping `show.ts` as a facade of
re-exports, as `src/core/queue.ts` is for the queue, keeps every one of them
unchanged. `tests/show-test-path.test.ts` reads `show.ts`'s source for an
`isTestPath` import, so task 2, which moves the scope code out, points that
test at the module holding `attachTaskScenarios`.

**Why the JSON leaves the new fields out.** `osq show --json` prints
`{ ...details, digest }` today. With the digest and the three proposal
sections in the model, `formatShowJson` drops `surface`, `decisions` and
`beforeApproval` and puts `digest` last, so the printed object keeps its keys
and their order. The dashboard reads the model through
`getSpecDetailsFromFolder` and maps fields one by one, so `WebChange` is
unchanged.

**Measured on 2026-10-04** in a scratch worktree at 146: adding the four
fields in `buildSpecDetails` (digest from `buildApprovalDigest` when
`approvedHash` is null) and dropping them from the JSON in `src/cli/show.ts`
kept both typechecks green, passed all 129 tests in `tests/show*`,
`focused-show`, `mutation-report`, `trace-report`, `dependencies-report`,
`instructions-drift`, `proposal-writes-schema`, `web-data*`, `serve`,
`command-inputs-views`, `command-error` and `cli-no-direct-output`, and
`identity/compare.ts` reported 324 identical renderings. Printing the model
with the new fields made it fail. No test builds a `SpecDetails` literal, so
new required fields break no typecheck. The only tests that name `show.ts`
by path are the two budget tests and `tests/show-test-path.test.ts`.
