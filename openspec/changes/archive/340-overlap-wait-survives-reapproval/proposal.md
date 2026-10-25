---
title: A change keeps waiting for an overlapping change after that change is re-approved
depends_on: []
verify: pnpm verify
features:
  reads: [version-control, cli-foundation, metrics-and-reporting, traceability]
---
## Goal

When approve finds that a change rewrites a capability an approved change
also rewrites, it writes an overlap line to `.run/stacked-on`, and the
change waits for that one to land. Each line records the hash the other
change was approved under. `awaitedDependencies` and `decideStackCut` drop
an overlap line once the other change carries another hash, so a
re-approval of the awaited change silently ends the wait. Both changes then
run on their own, and whichever lands second finds its requirements changed
on main.

On 2026-10-24, 326 was re-approved at 12:04 and again at 13:52:04. 334 was
approved at 13:52:14 with an overlap line holding the 12:04 hash. The cut
dropped the line, 334 ran from main, landed at 15:32 and rewrote rust-cli
"Command dispatch". 326, which rewrites the same requirement, then
regressed with `requirement_changed` and needed a steer.

After this change an overlap line keeps its change waiting while the other
change reads approved or archived, whatever hash the line records. Only
landing or rejection ends the wait. A re-approval is still visible: the
entry carries `reapproved`, `osq show` and the change page say
`approved again since`, and the inbox holds an `overlap-reapproved` item,
so a human can check that the overlap still holds.

## Verify

`pnpm verify` runs both typechecks, the build, every test and lint. It
proves, on scratch repositories, that a stacked change whose overlapped
change is steered and re-approved waits through watcher cycles and is cut
from main only once that change lands; that `awaitedDependencies` keeps the
re-approved line and marks it; that `osq show`, the change page and the
inbox name the re-approval; and that every earlier stacking, show and inbox
test still holds.

## Non-goals

- Recomputing an overlap's capabilities after a re-approval.
- Declared `depends_on` lines, which still halt with `dependency_changed` on a new hash.
- Approve recording a hash that lags the dependency's latest approval; the hash now only decides the `reapproved` mark.
- The Rust code: Rust approve refuses to stack and Rust land reads only the folder names of `.run/stacked-on`, so neither compares the hash. The Rust inbox gains no `overlap-reapproved` item here.
- A way to dismiss the inbox item; it goes when the overlapped change lands or is rejected, or when the waiting change is approved again while stacked.

## Surface

- Added: `reapproved` key on an `osq show --json` `runsAfter` entry and on the web change's `runsAfter` entry, present only as `true`.
- Changed: the `Runs after:` line of `osq show` ends an overlap entry with `; approved again since` inside its parentheses when `reapproved` is set.
- Added: inbox needs-you kind `overlap-reapproved`, with its `overlapReapproved` key, text row, and dashboard label `overlap approved again`.

## Decisions

- ADR 002: archive's delta merge is unchanged.
- ADR 003: nothing here writes git; the cut still creates branches only as today, and only later.
- ADR 004: the OpenSpec validator run is unchanged.
- ADR 005: the validator peer range is unchanged.
- ADR 008: the inbox item is derived from `.run/stacked-on` and the dependency's approval files on each read; nothing is stored.
- ADR 010: the validator role is unchanged.
- ADR 012: the cut runs inside the watcher's own cycle as today, so the supervisor's restart rule is unchanged.
- ADR 013: the dashboard only shows the new label and suffix; no write path changes.
- ADR 020: the change page's suffix and the home view's label sit in the components' existing pure label functions.
- ADR 018: a re-approved overlap gives no steering trigger, so auto-steer is unchanged.
- ADR 019: tapped planners are unchanged.
- ADR 021: autopilot recovery sees no new halt; a stacked change now waits where it used to be cut.

## Assumptions

- A re-approved dependency usually still overlaps, so waiting is the safe default; a human who sees the inbox item and knows the overlap is gone can re-approve the waiting change while it is still stacked, which records fresh overlaps.
- A change cut into its worktree before this change lands, with a dropped line, keeps running; only cycles after the build see the new rule.
- A rough version of this change, measured on 2026-10-25, broke only `tests/approve-overlap.test.ts` and `tests/stack-overlap-cut.test.ts`, the two rows that pinned the drop, both in task 1's scope, and the line budget, which task 1's details plan around.

## Contract

### Requirement: Awaited dependencies

See `specs/spec-lint-and-approve/spec.md`: an overlap line stays awaited
under any recorded hash, marked `reapproved` when the hash differs.

### Requirement: Stacked cut

See `specs/watcher-and-harness/spec.md`: an overlap line whose change
carries another hash is kept, so the change waits; the new scenario
"Overlapped change approved again before it lands" replays the 334 case.

### Requirement: Runs after in show

See `specs/status-inspection/spec.md`: the `reapproved` mark and the
`approved again since` suffix.

### Requirement: Overlap approved again in the inbox

See `specs/status-inspection/spec.md`.

### Requirement: Runs after in the change view

See `specs/web-inspection/spec.md`.

### Requirement: Overlap approved again on the home view

See `specs/web-inspection/spec.md`.

## Human steps

### Before approval

None

### After landing

None

## Delta

- `specs/spec-lint-and-approve/spec.md`: MODIFIED "Awaited dependencies"; one table row of "Overlap lines count while their change waits to land" changes, both scenarios kept.
- `specs/watcher-and-harness/spec.md`: MODIFIED "Stacked cut"; one row of "Overlap lines in the cut" changes, and the scenario "Overlapped change approved again before it lands" is added; every other scenario is unchanged.
- `specs/status-inspection/spec.md`: MODIFIED "Runs after in show" with a new scenario; ADDED "Overlap approved again in the inbox".
- `specs/web-inspection/spec.md`: MODIFIED "Runs after in the change view" with a new scenario; ADDED "Overlap approved again on the home view".
- No file is shared by two tasks.
