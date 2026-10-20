---
status: accepted
applies_to: [group:rust]
rule: A feature is one crate on the kernel; features never call each other, they append typed events to files and read only through the storage read model.
checks:
  - tests/rust-adrs.test.ts
  - crates/core/tests/no_io.rs
---
# 022. Rust feature crates, events and the read model

Date: 2026-10-17

## Status

Accepted by Mathias on 2026-10-17 in the project thread. This is the first ADR
of the Rust version of osq, numbered 001 on the Notion Rust Rebuild page. It
carries ADR 016, capability slices, over to Rust, together with ADR 008's rule
that SQLite is only a derived index.

Scope: this ADR governs every capability in group `rust`, the Rust crates, not the
TypeScript code under `src/`, which keeps its own ADRs until it is deleted.

## Context

The Rust design has a pure core and adapter crates for version control,
storage, specs, the linter, runners, harnesses and agents, with a watcher, a
CLI and a server on top. If features live inside those layer crates, one
feature such as land is spread over core, git, the watcher, the CLI and the
server.

ADR 016 measured the cost of that shape. Of 30 changes, 22 wrote
cli-foundation and 14 wrote watcher-and-harness, so unrelated changes edited
the same files, conflicted at sync and had to stack. osq means to run many
agent changes in parallel, which makes collisions the main limit on scale.
ADR 016 was accepted but barely carried out in TypeScript, since only `docs`
and `languages` moved, so the rewrite is the cheap moment to adopt it.

Code is cheap when AI writes it, so extra crates and registration code cost
little. What matters is that each change has a small, clear scope and that the
boundaries hold without a human checking them.

## Decision

### 1. Four layers, and Cargo enforces the direction

```
apps      cli, server, integrations   parse, dispatch, print
features  plan, approve, run, archive, land, inbox, report, metaloop
kernel    vcs, storage, specs, linter, runners, harnesses, agents, loop
core      types, state machines, traits, no IO
```

A crate depends only on layers below it. Kernel crates never depend on a
feature crate, and core depends on nothing in the workspace. Cargo refuses
anything else, so no test is needed to check it.

```
crates/core/
crates/kernel/{vcs,storage,specs,linter,runners,harnesses,agents,loop}/
crates/features/{plan,approve,run,archive,land,inbox,report,metaloop}/
crates/apps/{cli,server,integrations}/
ui/  agents/  openspec/  decisions/  fixtures/
```

### 2. A feature is one crate and one capability

A feature crate holds everything the feature needs: its logic, its CLI
subcommand, its server routes and the loop hooks it reacts to. It exposes one
implementation of the core `Feature` trait, and everything else is private to
the crate. The apps only register features. The watcher becomes `loop` in the
kernel, which schedules work and calls the hooks the features register.

Each feature folder is one capability. `openspec/specs/land/spec.md` owns
`crates/features/land/**`, so ownership follows from the path. A small feature
joins the nearest feature crate until it grows.

### 3. Features never call each other

Features communicate only through events and the read model.

- **Events are one enum in core.** `enum Event` holds every event as a typed
  variant, serialized with serde to append-only JSONL. Because every `match`
  on it must be exhaustive, a new event makes the compiler list each place
  that has to handle it.
- **The log is the bus.** A feature appends events to files, and those files
  are the truth that survives a restart. An in-process broadcast channel only
  signals that something new arrived, to wake the loop, the read model and the
  server's live updates.
- **State is a pure fold.** Core holds `apply(state, &Event) -> State` with no
  IO. A change's state is the fold over its events, so every reader gets the
  same answer.
- **Gates are types where possible.** For example, `run_task` accepts only a
  `Change<Approved>`, and only approve, after the hash check, can create one.

### 4. Files and git are the truth, and SQLite is the read model

Event files, markers and change folders, committed through git as ADR 003
describes, are the source of truth. The storage kernel builds a read model
from them, such as `changes`, `tasks`, `attempts`, `gates`, `costs` and
`links`. It caches the model in SQLite, which may be deleted at any time and
is rebuilt from the files.

Features, the UI, the server and the metaloop read only through typed queries
on that model, such as `changes_needing_you()` or
`task_outcomes(capability)`. They never read another feature's files.
`report` is the feature that displays the model, through `osq report`,
`osq query` and the dashboard. It is not the owner of the queries.

## Enforcement

- Cargo enforces the layer direction: a kernel crate can't depend on a feature
  crate, and core depends on nothing in the workspace.
- An osq lint gate reads every crate's `Cargo.toml` and refuses a feature
  crate that depends on another feature crate, and an app that depends on
  anything but features, kernel and core.
- An osq lint gate on core: no IO in its dependencies or code, such as
  `std::fs`, `std::process`, `tokio` or `reqwest`.
- An osq lint gate that each feature crate exposes exactly one public item,
  its `Feature` implementation.
- An osq lint gate that no feature reads another feature's files: paths a
  feature opens must be its own or go through the storage read model.
- A replay test in storage: delete the SQLite cache, rebuild from the files,
  and compare the read model with the one before.
- A `proptest` suite on `apply` that checks the fold is deterministic over any
  event sequence.

## Consequences

- Changes to different features touch different crates, so they can run side
  by side and rarely conflict.
- An executor's scope is usually one feature crate, which gives it a short
  context and verify needs only that crate's tests.
- The `capability-slices` test of the TypeScript version is replaced by
  Cargo's dependency rules.
- Adding an event is a core change, which is visible in review and checked by
  the compiler.
- The kernel stays small only if feature logic is kept out of it. That is a
  review and lint rule, not something the compiler can see.
- Workspace-level dependency versions and `[lints]` keep the crates
  consistent.
- Verification tools that fit this layout: `cargo-nextest` with JUnit XML per
  ADR 017, `proptest` for the fold, `insta` for event stream snapshots,
  `cargo-mutants` for mutation checks, `cargo-deny` and strict `clippy`.

## Rejected

- **Layer crates holding feature logic**, the first diagram. It is simpler to
  draw, but every feature spans four or five crates, and it brings back the
  collisions ADR 016 measured.
- **Features calling each other through traits.** Boundaries slowly turn back
  into layers, and the call graph becomes the coupling.
- **Read queries owned by the `report` feature.** Every feature would then
  depend on `report`, which is a feature-to-feature dependency.
- **SQLite as the source of truth.** Git could not merge, sync or land it, and
  the watcher would lose the ability to rebuild from files after a restart.
- **An in-memory event bus as the truth.** State would be lost on a crash. The
  channel only signals, and the files decide.
