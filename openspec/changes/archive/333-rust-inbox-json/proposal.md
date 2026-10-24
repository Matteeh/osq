---
title: Rust osq inbox --json prints TypeScript's inbox JSON and advances the last-look cursor
depends_on: []
verify: sh scripts/verify-rust.sh
features:
  reads: [rust-core, rust-config, rust-vcs, rust-specs]
---
## Goal

The dashboard and scripts read the inbox as JSON, and Rust `osq inbox`
prints only the text view. This change ports the JSON: Rust
`osq inbox --json` prints the same bytes as TypeScript's `osq --json`, the
`needsYou`, `running` and `landed` object whose text the Rust inbox already
prints, for every item kind.

TypeScript reads and advances a per-project last-look cursor on every inbox
run, and lists only changes landed since it. The Rust inbox has no cursor
and always lists the newest ten. This change ports the cursor too, for text
and JSON, so a Rust run leaves the same cursor a TypeScript run does. The
storage kernel's halt marker gains the stuck fingerprint the JSON names.

## Verify

`sh scripts/verify-rust.sh` runs the format check, clippy with pedantic
lints and every Rust test, corpus tests included. The watcher also runs
cargo-mutants on the touched lines. It proves the marker fingerprint in
storage; the cursor path, its read, its write after text and JSON runs and
the Landed filter; and that `inbox --json` equals three TypeScript goldens,
the inbox golden repository with and without a cursor and a records project
with a running task, a pause, an autopilot stop, an after-land failure and
an archived change waiting to land in a worktree, plus that project's text.

## Non-goals

- `--follow`; it needs the loop.
- Bare `osq --json`: the Rust CLI sends a first argument `--json` to no feature, so it stays an unknown command.
- TypeScript's `osq inbox` dispatcher queue, which prints weighted cards and has its own `--json`; the Rust inbox ports the attention inbox that TypeScript's bare `osq` prints.
- The auto-steer `autoSteer` member and the archive-commit-failed item, which the Rust text view does not print either.
- The watcher line TypeScript's bare `osq` prints after the text.

## Surface

- Added: Rust `osq inbox --json` (flag).
- Changed: Rust `osq inbox` reads and writes `~/.osq/last-look/<hash>.json` and lists only changes landed since the last look.

## Decisions

- ADR 022: the inbox reads markers only through the storage kernel, which gains the fingerprint; the cursor path reuses storage's `watch_state_dir` hash, and no other feature is called.
- ADR 023: items become plain data built by pure functions, rendered once as text and once as JSON; `run` holds the reads and the cursor write.
- ADR 024: every public item ends its doc with `Implements: <capability>/<requirement>`, and each test names `Covers: <capability>/<scenario>`.
- ADR 025: the cursor file is read and written as TypeScript writes it, and markers are read as they are.
- ADR 026: marker frontmatter is read only through the specs kernel's `parse_frontmatter`, as today.
- ADR 027: no scheduling changes; the storage task's scope makes this change wait for any running change that writes `markers.rs`.
- ADR 028: `InboxFeature` stays one `Feature` with one command, now with the usage `[--json]`, and gains the `with_home` builder.
- ADR 029: the inbox reads `osq.toml` through `load_config` only, and adds no key.

## Assumptions

- The JSON to match is TypeScript's bare `osq --json`, the model the Rust text view already ports, not `osq inbox --json`, which in TypeScript is now the dispatcher queue.
- Every golden was printed by `golden/print-inbox-goldens.mjs.txt` with the built `dist` of this repository on 2026-10-24, through `readInbox` with a fixed time, since the CLI has no clock option.
- Writing the cursor under the real home from tests in other crates, such as rust-cli's binary test, is harmless: those tests compare two runs that each read their own root's cursor.

## Contract

### Requirement: Marker fingerprint

See `specs/rust-storage/spec.md`: MODIFIED "Marker facts", adding the
scenario "Marker fingerprint".

### Requirement: Inbox cursor and JSON

See `specs/rust-inbox/spec.md`: MODIFIED "Inbox command" and "Landed
items", ADDED "Last-look cursor" and "Inbox JSON".

## Human steps

### Before approval

None

### After landing

None

## Delta

- `specs/rust-storage/spec.md`: MODIFIED "Marker facts" for `fingerprint`, its two scenarios kept and "Marker fingerprint" added.
- `specs/rust-inbox/spec.md`: MODIFIED "Inbox command" for `--json`, `with_home` and the cursor, its scenarios kept with the refused rows and usage updated; MODIFIED "Landed items", keeping "Newest ten landed changes" and adding "Landed after the cursor"; ADDED "Last-look cursor" and "Inbox JSON".
- Shared files: tasks 2 and 3 both scope `crates/features/inbox/src/**`, and both change `crates/features/inbox/tests/inbox_command.rs`. Task 3 extends task 2's files; the watcher recertifies task 2 by its verify.
