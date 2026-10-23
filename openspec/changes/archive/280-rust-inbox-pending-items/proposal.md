---
title: The Rust inbox lists paused tasks, after-land failures and autopilot stops
depends_on: ["270"]
verify: sh scripts/verify-rust.sh
features:
  reads: [rust-specs, rust-config]
---
## Goal

The Rust inbox still leaves out three cards TypeScript shows: a task paused
by a usage limit, a failed after-land command, and an autopilot stop. Each
comes from a record another part of osq writes: `.run/paused.md` in a change
folder, `after-land.json` under the project's watch state folder in the
home, and `openspec/.run/autopilot-stop.md`. A stop before a change also
needs its queue item's title from `openspec/queue.md`. ADR 022 says a
feature reads only through the storage read model, so this change first
gives the storage kernel typed readers for the three records and the queue
titles, then has the inbox print the three cards with TypeScript's text, in
TypeScript's order, and none when no record exists.

## Verify

`sh scripts/verify-rust.sh` runs the format check, clippy with pedantic lints
and every Rust test, the corpus link gates included. It proves the new
storage readers match TypeScript's readers on each record shape, that the
inbox prints TypeScript's lines for each card, and that every existing
storage and inbox test, the inbox's TypeScript golden included, still
passes.

## Non-goals

- Acting on the cards: `osq land`, `osq queue approve` and resuming a pause are other features.
- Writing any of the records; the run, land and autopilot features own that.
- Moving the plan feature onto the storage queue reader; the plan feature keeps its own parser.
- Auto-steer outcomes on steering lines.

## Surface

None

## Decisions

- ADR 022: the inbox reads the three records and the queue titles only through new typed storage readers, never by opening another feature's files itself.
- ADR 023: the storage readers never fail, and the inbox's new lines are pure functions of the snapshots and records; only the inbox's `run` reads files and `HOME`.
- ADR 024: every public item ends its doc with `Implements: rust-storage/<requirement>` or `Implements: rust-inbox/<requirement>`, and each test names `Covers: <capability>/<scenario>`.
- ADR 025: the readers read today's files as TypeScript writes them; nothing on disk changes.
- ADR 026: frontmatter splits only through rust-specs `parse_frontmatter`, as rust-storage "One frontmatter reader" requires.
- ADR 027: no scheduling changes.
- ADR 028: `InboxFeature` keeps its one command and refusals.
- ADR 029: no new config keys; the inbox still loads `osq.toml` only for the vcs block.

## Assumptions

- A pause's `until` is always in osq's fixed `YYYY-MM-DDTHH:MM:SS.mmmZ` form, as both TypeScript and Rust write it. Rust reads any other form as no pause, where TypeScript's `Date.parse` would accept some.
- An after-land exit code is always a whole number. Rust reads a fractional `exitCode` as no record, where TypeScript would keep it.
- The after-land record is found under `$HOME`, as TypeScript's `os.homedir()` finds it, and the inbox shows no after-land card when `HOME` is unset. The inbox test writes its record under the real `~/.osq/watch/<hash>` of its own scratch root and removes it, as 279's land tests do.
- The expected lines in the scenarios were printed by TypeScript's `dist` (`readInbox` and `formatInboxText`, and `parseQueue` for the queue table) over scratch projects built as each scenario says.

## Contract

### Requirement: Pending records

See `specs/rust-storage/spec.md`, with "Usage pause record", "Autopilot
stop record", "After-land failure record" and "Queue item titles", and
`specs/rust-inbox/spec.md`, with "Paused items", "After-land failed item",
"Autopilot stopped item" and "Needs-you order".

## Human steps

### Before approval

None

### After landing

None

## Delta

- `specs/rust-storage/spec.md`: ADDED "Usage pause record", "Autopilot stop record", "After-land failure record" and "Queue item titles".
- `specs/rust-inbox/spec.md`: MODIFIED "Inbox command", "Needs-you items" and "Running items"; ADDED "Paused items", "After-land failed item", "Autopilot stopped item" and "Needs-you order".

No file is shared between tasks.
