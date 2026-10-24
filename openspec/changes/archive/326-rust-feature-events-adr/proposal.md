---
title: Rust features react to events through one delivery entry point
depends_on: []
verify: sh scripts/verify-rust.sh
check: node --import tsx --import ./tests/git-test-env.ts --test tests/rust-adrs.test.ts
features:
  reads: [rust-config, rust-vcs, rust-storage, cli-foundation, spec-lint-and-approve]
---
## Goal

ADR 022 says features never call each other and talk through event files,
and ADR 028 left "the events a feature reacts to" for later. Steered
approval is the first place that needs them: after a human approves a
revised plan, retry's code must clear the steering triggers, and approve may
not call the retry crate.

This change adds that mechanism. A feature lists the event kinds it reacts
to and handles one event at a time. One entry point in the loop kernel runs
each command and then delivers new events to those features, at least once,
from a durable byte cursor per feature and change, under a lock per change.
A failed reaction is shown on stderr and exits 1, and the next command tries
again. The CLI runs commands only through that entry point, and the server
and the loop will too.

ADR 030, Rust feature events, records the design the human settled in a
design session on 2026-10-24. Its text is in this change folder as
`adr/030-rust-feature-events.md`, so the human reviews the decision itself
at approve; task 5 copies it into `decisions/`.

## Verify

`sh scripts/verify-rust.sh`

It runs the format check, clippy with pedantic lints, every Rust test and
the mutation check on the touched lines. That covers core's trait defaults,
event kinds and `Reaction`; the storage kernel's durable write; the loop
kernel's entry point, delivered changes, delivery cases, cursor files, held
lock and failure texts; and the CLI's reaction failure. The `check` runs
`tests/rust-adrs.test.ts`, which proves ADR 030 is accepted for group
`rust`, names its checks, which exist, and is linked from the index once.

## Non-goals

- The `approved` event and steered approval. Change 325, `rust-approve-steered`, adds them next, with retry reacting.
- Any feature that reacts to anything. No feature's `reacts_to` changes, so no command writes a cursor yet.
- A shared event appender, and durable writes for existing marker renames. Both are roadmap rows.
- The server app and the loop's watcher pass. They call `run_command` when they are built.
- Changing TypeScript. It never reads `.run/delivered/` or `.run/delivery.lock`.

## Surface

- Added: ADR 030, Rust feature events (`decisions/030-rust-feature-events.md`), and its line in `decisions/README.md`.
- Added: `.run/delivered/<feature>` cursor files and the empty `.run/delivery.lock` in a change folder, written only once a feature reacts to an event.
- Added: the stderr line `<feature> could not handle <event> for <change>: <message>` on any Rust command whose events a feature fails to handle, with exit code 1 even when the change is not the command's own.
- Added: the stderr warning `<feature> passed over byte <offset> of <file> in <change>: <error>` for an event line the parser refuses, with the exit code unchanged.
- A delivery lock held by another process skips that change quietly; only a lock that cannot be taken fails.

## Decisions

- ADR 022: features still never call each other; the loop kernel delivers events from the files, which stay the truth.
- ADR 023: the delivery steps are small named functions; `run_command` and the per-change delivery are the thin orchestrators holding the IO.
- ADR 024: every public item names its requirement and every test its scenario; ADR 030 names its check files.
- ADR 025: event files are read as they are, unlocked appends included; the new files live in `.run/`.
- ADR 026: no OpenSpec parsing is involved.
- ADR 027: the change locks the core, storage, loop and CLI crates, `Cargo.toml`, `decisions/` and the 35 files task 3 rewrites for clippy, so it runs alone against changes in those files.
- ADR 028: the trait gains `reacts_to` and `react` with defaults, so no feature crate changes; `Reaction` is `#[non_exhaustive]` and built through `Reaction::new`.
- ADR 029: delivery reads `vcs.enabled` and the git timeouts through `load_config`.

## Assumptions

- Approving this change accepts ADR 030 as written in `adr/030-rust-feature-events.md`, dated 2026-10-24. Edit that file before approving if any decision should read differently.
- `rust-version` moves from 1.85 to 1.89 for `File::try_lock`; the pinned toolchain is 1.99.1. `Cargo.lock` changes only by the loop's new dependency edges.
- The 1.89 `rust-version` makes clippy flag 43 `collapsible_if` and `manual_is_multiple_of` sites in 35 files across the workspace, measured again on main after 331 landed on 2026-10-24. Task 3 applies clippy's own fixes; a mutation run over that rewrite on a scratch copy of main found no missed mutant. Its scope globs over `crates/kernel/**` and `crates/features/**` because scope takes at most 8 patterns.
- Every Rust and TypeScript appender writes a whole event line, ending in `\n`, in one call, which was checked on 2026-10-24. Delivery relies on that to treat a line without `\n` as unfinished.
- The lock file is not git-ignored. It is empty and never changes, so it is committed with the change's other `.run/` files, as the cursors are. This differs from the queue item, which said git-ignored.
- A held delivery lock is skipped quietly, not refused loudly as the brief says. The human agreed after review on 2026-10-24, since the loop and a CLI command overlapping is normal and a failure would stop autopilot.
- With no reacting feature, a command does exactly what it does today: delivery reads no file, so every existing CLI test passes unchanged.
- Since 334 landed, main's `Output` carries its own exit code, and since 331 landed, `sync.rs` holds the active sync and storage exports the done-scope readers. Merging main conflicted only on task 3's clippy rewrite in `sync.rs` and task 2's `pub mod write;` in storage's `lib.rs`; approving this revision restarts `osq/326` from main, so every task runs again on the current code.
- An earlier approve of this revision timed out in `git worktree remove` on a 3.2 GB `target/` folder; the worktree was rebuilt from `osq/326-rust-feature-events-adr` with no build output, so its removal fits the default git timeout.

## Contract

### Requirement: Feature events
Rust features SHALL react to the events they list, delivered at least once
by one entry point after each command.

#### Scenario: Reaction failure through the CLI
- **WHEN** a command appends an event that a feature fails to handle
- **THEN** the command's output is printed, the failure is on stderr, and the exit code is 1

## Human steps

None

## Delta

- `specs/rust-core/spec.md`: MODIFIED "Feature trait" and "Rust rebuild decisions"; ADDED "Event kinds" and "Reaction". Tasks 1 and 5.
- `specs/rust-storage/spec.md`: ADDED "Durable write". Task 2.
- `specs/rust-loop/spec.md`: ADDED "Command entry point", "Delivered changes", "Event delivery", "Delivery cursor", "Delivery lock" and "Reaction failures". Task 3.
- `specs/rust-cli/spec.md`: MODIFIED "Command dispatch". Task 4. Since 334 landed, an `Output` carries its own exit `code`; the dispatch keeps that code through `run_command`, and the scenario "Output code through run_cli" stays.
- `adr/030-rust-feature-events.md`: the ADR text task 5 copies.

Shared files: `crates/apps/cli/src/lib.rs` gets clippy's rewrite in task 3, and task 4 extends it. Task 3's `crates/kernel/**` glob also covers task 2's `crates/kernel/storage/src/lib.rs`, `crates/kernel/storage/src/write.rs` and `crates/kernel/storage/tests/durable_write.rs`, which task 3 leaves unchanged.
