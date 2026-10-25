---
title: Every Rust command resolves a change id strictly through one lookup
depends_on: ["342", "331", "330"]
verify: sh scripts/verify-rust.sh
features:
  reads: []
---
## Goal

On 2026-10-23, `osq land 310]` landed 310. TypeScript's `matchesFolder`,
and each Rust feature crate's copy of it, keep only a query's leading
digits. So `310]`, `310x` and `310-wrong-slug` all name 310, and `31O`
names 031. Rust osq should accept only a real change id and refuse
anything else. One pure function in core, `parse_change_id`, reads every
change id a Rust command takes. Each feature crate matches folders only
through it and keeps no matcher of its own.

## Verify

`sh scripts/verify-rust.sh`: the format check, clippy, every Rust test
including each crate's new change-id tests, and the mutation check on the
lines this change touches.

## Non-goals

- TypeScript's lookup, which keeps its loose matching.
- New not-found texts. A well-formed id that names no change still fails
  with each command's existing not-found text; only an id core refuses gets
  core's message.
- Paths in `show`, which still name a folder directly.
- Display ids, such as the leading digits a report or the inbox prints for
  a folder. These name a folder rather than read an id.

## Surface

- Changed: every Rust command that takes a change id (`land`, `sync`,
  `message`, `approve`, `reject`, `lint`, `run`, `archive`, `retry`, `plan`
  and `show`) accepts only the change's number or its full folder name, and
  `show` also accepts the folder name without its number. Any other id fails
  with `"<input>" is not a change id; give the change's number, such as 7 or 007, or its full folder name`.

## Decisions

ADR 022: `parse_change_id` lives in core and does no IO, so every feature uses it without depending on another feature.
ADR 023: the parser is small named pure functions, and every new item has a doc comment.
ADR 024: new core items end with `Implements: rust-core/change-ids`, and each new test names `Covers:` for its scenario.
ADR 025: change folders are read as they are, and no file format changes.
ADR 026: no OpenSpec parsing changes.
ADR 027: no scheduling changes. Task 2 scopes only land's `find.rs` and `text.rs`, so this change does not overlap the running 345, which owns `land.rs` and `sync_command.rs`.
ADR 028: each feature's commands and errors keep their shape, and a refused id is a `FeatureError::failed` for the command.
ADR 029: no config changes.
ADR 030: no feature events change.

## Assumptions

- The brief asks for "one kernel function", but this plan puts it in `osq-core`. Matching is pure, and every feature crate already depends on core, so no `Cargo.toml` changes.
- A well-formed id that names nothing keeps each command's current not-found text, which names the input, for example `Spec "x" not found in ...`. Only a malformed id, such as `310]`, `31O`, `-2` or an empty id, gets core's message listing the accepted forms.
- Only `show` takes the bare slug, such as `approved` for `002-approved`, since only Rust `show` accepts it today. Its old suffix form, where `alpha` named `x-alpha`, stops working.
- These intended behaviour changes break existing test rows: approve's `012-beta-two` now approves `012-beta-two`, and `x` no longer approves `x-y`. Land's `001-alpha` no longer lands `001-alpha-orders`, and show's edge cases for `alpha` and `-2` change. Archive now accepts `7` for `007-sample`.
- The approve stack's `depends_on` matching, show's dependency readiness and the inbox's autopilot-stop title also go through core. A dependency that is not a change id never counts as met.

## Contract

The deltas below hold the contract: rust-core "Change ids", and each
feature's lookup requirement, which now reads ids through it.

## Human steps

### Before approval

None

### After landing

None

## Delta

- `specs/rust-core/spec.md`: ADDED "Change ids".
- `specs/rust-land/spec.md`: MODIFIED "Land lookup".
- `specs/rust-approve/spec.md`: MODIFIED "Approve lookup".
- `specs/rust-run/spec.md`: MODIFIED "Run refusals".
- `specs/rust-lint/spec.md`: MODIFIED "Lint lookup".
- `specs/rust-archive/spec.md`: MODIFIED "Change lookup".
- `specs/rust-retry/spec.md`: MODIFIED "Retry refusals" and "Archived retry".
- `specs/rust-plan/spec.md`: MODIFIED "Steering lookup".
- `specs/rust-show/spec.md`: MODIFIED "Show lookup" and "Show dependency readiness".
- `specs/rust-inbox/spec.md`: MODIFIED "Autopilot stopped item".

No two tasks share a file.
