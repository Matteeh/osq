---
title: A shared file changed by several later tasks is credited to the latest one whose hash matches
depends_on: []
verify: pnpm verify
features:
  reads:
    - spec-lint-and-approve
    - status-inspection
---
## Goal

A done task's file that two or more later tasks changed is attributed
`ambiguous`, and when three tasks share one file the owner halts for a human
`osq retry` even though its own verify passes (204-rust-core, task 1). Plans
work around that by giving every file one owner plus at most one later task.
That pushed 274-rust-show into placeholder sections no later task could wire
in, and its task 2 died `blocked`.

Planning found two causes, and this change fixes both:

- **The halt.** Automatic recertification follows the file through the later
  tasks' `measures` end segments and requires the first segment to start at
  the owner's recorded hash. After task 2 the owner is recertified, which moves
  its recorded hash to task 2's result. Before task 4 the audit runs again, but
  the first segment is still task 2's, which starts at the old hash, so the
  chain breaks and the owner halts. In 204, `crates/core/src/lib.rs` went
  `aec7…` to `c62f…` in task 2, task 1 was recertified at `c62f…`, then task 3
  went `c62f…` onward, and the audit refused because the chain started at
  `aec7…`. A prototype that starts the chain at the first segment whose
  `before` equals the recorded hash lets that owner recertify again, and a
  three-task test that halts under today's code passes.
- **The label.** With several candidates the attribution is always
  `ambiguous`. The path is now credited to the highest-numbered candidate whose
  done marker records the path with the current hash, and stays `ambiguous`
  only when none does.

## Verify

`pnpm verify`

It runs both typechecks, the build, every test and lint on the final tree,
including the reworked "Two later tasks measured the path" cases in
`tests/scope-credit.test.ts`, the new `tests/scope-latest-credit.test.ts`, and
the new `tests/auto-recertify-repeat.test.ts`, which runs a change whose first
three tasks share one file through `runWatcherCycle`.

## Non-goals

- Changing how `file_changed` events or `measures` segments are recorded.
- A lint warning for files claimed by three or more tasks; this change makes it unnecessary.
- The Rust scope audit (`audit_scope` in core), which does not attribute recertification yet.
- Recertifying automatically on attribution alone. The `measures` chain stays the gate; attribution only labels the path.

## Surface

None

## Decisions

- ADR 002: archive and delta application are not touched.
- ADR 010: the validator is not touched.
- ADR 012: the credit and the chain come from done markers and event files, so both survive a watcher restart.
- ADR 018: a passing scope regression is no steering trigger today; fewer of them halt, and no trigger changes.
- ADR 019: a tapped planner is not touched.
- ADR 021: autopilot stops on fewer shared-file halts with no change of its own.

## Assumptions

- In 204 the halt came from the chain check in `pathCarriedWithoutGap`, not from the `ambiguous` label: `autoRecertify` never reads attribution. A prototype on a scratch copy confirmed it: today's code halts a three-task shared file before task 4, and the chain fix alone ends the halt.
- Skipping the segments before the one that starts at the recorded hash is safe: those segments end at or before a hash some earlier recertification, by a human or automatically, already accepted. A human edit after that hash still leaves a gap and halts, as "Human edit breaks the chain" requires.
- A done marker's `scope_files` holds hashes only for its own resolved scope, so a candidate whose scope did not cover the path never matches and the result falls back to `ambiguous`. `tests/scope-recertification.test.ts` "records ambiguous when more than one later task named the path" relies on that and passes unchanged.
- Measured on the prototype of the whole change: only `tests/scope-credit.test.ts` "records ambiguous when two later tasks measured the path" fails, so task 1 sets `tests.modify` for that file alone.
- `src/core/run/scope-hash.ts` is at 235 of the 250 lines `tests/line-budget.test.ts` allows, so `attributeScopePaths` moves into a new `src/core/run/scope-attribution.ts`, and `scope-hash.ts` re-exports it so `src/watcher/regression.ts` keeps its import.

## Contract

### Requirement: Scope recertification audit

See `specs/watcher-and-harness/spec.md`.

### Requirement: Automatic scope recertification

See `specs/watcher-and-harness/spec.md`.

## Human steps

### Before approval

None

### After landing

None

## Delta

- `specs/watcher-and-harness/spec.md`: MODIFIED "Scope recertification audit". Several candidates credit the latest one whose completion hash matches the tree. "Two later tasks measured the path" becomes a two-case table, and "Two later tasks named the path" is added.
- `specs/watcher-and-harness/spec.md`: MODIFIED "Automatic scope recertification". The chain starts at the first segment whose `before` equals the recorded hash. Every scenario is kept and "A third task extends the file again" is added.

The two tasks share no file. Task 2's test checks the attribution task 1 adds, so task 2 runs after task 1.
