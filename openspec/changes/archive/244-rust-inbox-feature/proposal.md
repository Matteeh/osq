---
title: The inbox feature lists the changes that need the human, from the Rust read model, as osq inbox does
depends_on: ["239", "240"]
verify: sh scripts/verify-rust.sh
features:
  reads: ["rust-core"]
---
## Goal

The inbox is the human's view: which changes wait for an approve, a retry,
a plan or a land. `crates/features/inbox` is a placeholder. This change
makes it the first feature crate on core's `Feature` trait: `InboxFeature`
offers an `inbox` command that prints the three groups TypeScript's
`formatInboxText` prints, Needs you, Running and Landed since last look,
with the same kinds, order and next-step text as `inbox-projection.ts`,
`inbox.ts` and `inbox-text.ts`.

The feature reads only through the storage kernel: `list_changes` and
`read_change` give each change's folded state, and the projection and the
text are pure functions over those snapshots. TypeScript's inbox also reads
halt markers, running locks, the brief and the proposal's human steps, which
the snapshot does not hold yet, so the storage kernel's snapshot gains them
first.

## Verify

`sh scripts/verify-rust.sh`

It runs the format check, clippy with pedantic lints, every Rust test with
the corpus tests, and the mutation check on the lines this change touches.
That covers the storage marker tests, the inbox tests on the needs-you
fixture and on repositories each test builds under `CARGO_TARGET_TMPDIR`,
and the golden test that compares the printed inbox of the golden fixture
with the text TypeScript printed for it.

## Non-goals

- `--follow`, `--json`, sounds, the dispatcher, the usage-limit pause line and paused running items, and CLI wiring.
- Reading another project or `~/.osq`: no last-look cursor, so Landed since last look always shows the newest ten, as TypeScript does without a cursor; no after-land failure item; and no watcher line.
- Anything `osq.config.ts` turns on, since Rust reads no config yet (`osq.toml` comes later): no worktree or stacked trees, so only the project root's `openspec/changes/` is read; no `change-archived` item for archived changes the default branch does not hold and no item for an archived change in a worktree that needs steering, which TypeScript also lists only with `vcs.enabled`; no automatic planner record (`.run/auto-steer.md`).
- The autopilot stop item and a planner that is running for a change.
- Advancing any cursor or writing any file.
- Changing the TypeScript inbox.

## Surface

None

## Decisions

- ADR 022: `osq-feature-inbox` depends only on `osq-core` and `osq-kernel-storage`; it reads change folders only through `list_changes` and `read_change`, and the storage kernel, not the feature, reads the new marker facts.
- ADR 023: the projection and the text are pure private functions over snapshots; `InboxFeature::run` alone does IO, through storage and the process table check.
- ADR 024: every public function's doc ends with `Implements: rust-inbox/<requirement>` or `Implements: rust-storage/<requirement>`, and every test names `Covers: <capability>/<scenario>`.
- ADR 025: storage reads `.run/dead`, `.run/regressed`, `.run/running` and `.run/results` as they are today and writes nothing; with no `osq.toml`, the inbox behaves as TypeScript does under `DEFAULT_CONFIG`.
- ADR 026: storage reads marker and proposal frontmatter only through the specs kernel's `parse_frontmatter`.
- ADR 027: the feature decides nothing about scheduling.
- ADR 028: the crate's one public item is `InboxFeature`, which implements `Feature` with the name `inbox` and one command `inbox`, opens storage inside each `run`, and holds only a fixed clock as plain configuration.

## Assumptions

- Task and change status come from core's fold over the event files, as `read_change` gives them; TypeScript derives them from marker files. They agree whenever the watcher wrote both, as it does, and every fixture holds both.
- An active folder without `proposal.md` contributes nothing. TypeScript still lists the tasks of a legacy `spec.md`-only change; no active change has one.
- A running task's process counts as live when its pid is above 0 and `/proc/<pid>` exists, as on Linux and WSL, where osq runs; TypeScript asks `process.kill(pid, 0)`.
- Rust reads no worktrees, so on this repository, where `vcs.enabled` is on and approved changes run in their own worktrees, the Rust inbox shows only what the checkout holds until worktree trees reach Rust.
- Change 243 (`rust-query-feature`) does not write a `rust-storage` delta. If it does, land takes the two changes one at a time.

## Contract

### Requirement: Marker facts

See `specs/rust-storage/spec.md`.

### Requirement: Planning facts

See `specs/rust-storage/spec.md`.

### Requirement: Inbox command

See `specs/rust-inbox/spec.md`.

### Requirement: Needs-you items

See `specs/rust-inbox/spec.md`.

### Requirement: Running items

See `specs/rust-inbox/spec.md`.

### Requirement: Landed items

See `specs/rust-inbox/spec.md`.

### Requirement: Validator failing item

See `specs/rust-inbox/spec.md`.

### Requirement: TypeScript inbox parity

See `specs/rust-inbox/spec.md`.

## Human steps

### Before approval

None

### After landing

None

## Delta

- `specs/rust-storage/spec.md`: ADDED "Marker facts" and "Planning facts".
- `specs/rust-inbox/spec.md`: ADDED "Inbox command", "Needs-you items", "Running items", "Landed items", "Validator failing item" and "TypeScript inbox parity".

The change folder holds the inputs task 3 copies byte for byte:
`fixture/golden/` is the golden fixture repository and `golden/inbox.txt`
the text TypeScript's `formatInboxText(await readInbox(root, { config:
DEFAULT_CONFIG, home: <empty folder> }))` printed for it, followed by one
newline. Task 2 copies the same fixture without its `archive/` folder.

Tasks 2 and 3 share `crates/features/inbox/src/lib.rs`; task 3 runs after
task 2 and adds its groups there. Task 2 runs after task 1, whose snapshot
fields it reads.
