# Spec Delta: rust-loop

## Purpose
The loop kernel schedules work: it reads a repository's active changes and asks core's scheduler which may start, as ADR 027 says. It is the watcher of the TypeScript version.

## ADDED Requirements

### Requirement: Code ownership
<!-- source: crates/kernel/loop/** -->
The rust-loop capability SHALL own the `osq-kernel-loop` crate: its
manifest, its source, its tests and their fixtures.

#### Scenario: Loop crate ownership
- **WHEN** file ownership is resolved for the loop kernel
- **THEN** system maps `crates/kernel/loop/**` to rust-loop

### Requirement: Scope files
`scope_files(root, scope)` in `osq-kernel-loop` SHALL resolve the scope
entries of task files against the files under the project root `root`
and return the project-relative POSIX paths they give, without
duplicates, sorted by bytes. Each entry is first normalized as the specs
kernel's `scope_covers_path` normalizes it: trimmed, backslashes turned
to `/`, and leading `./` removed. An entry holding `*` or `?`, or ending
in `/`, is a pattern; any other entry is exact.

- An exact entry gives itself, normalized, whether or not the file exists.
- A pattern gives every regular file, not following symbolic links,
  under its search root that `scope_covers_path` matches with that entry.
  The search root is the directory part of the entry before its first
  `*` or `?`, or the entry without its trailing `/` when it has neither.
- A pattern that matches no file gives itself, normalized, so a change
  that will create files under a locked crate still holds that crate.
- A pattern whose search root starts with `..` or `/` is not walked and
  gives itself, normalized.

#### Scenario: Scope files of the fixture repository
- **WHEN** `scope_files` reads each scope below on `crates/kernel/loop/tests/fixtures/repo/`, which holds the files `src/a.ts`, `src/b.ts`, `crates/kernel/demo/src/lib.rs`, `crates/kernel/demo/src/read.rs` and `crates/kernel/demo/tests/reading.rs`
- **THEN** it returns the row's files, in this order:

| Scope | Files |
|---|---|
| `src/a.ts` | `src/a.ts` |
| `./src/b.ts` | `src/b.ts` |
| `src\b.ts` | `src/b.ts` |
| `src/missing.ts` | `src/missing.ts` |
| `crates/kernel/demo/src/*.rs` | `crates/kernel/demo/src/lib.rs`, `crates/kernel/demo/src/read.rs` |
| `crates/kernel/demo/` | `crates/kernel/demo/src/lib.rs`, `crates/kernel/demo/src/read.rs`, `crates/kernel/demo/tests/reading.rs` |
| `crates/kernel/demo/**/*.rs` | `crates/kernel/demo/src/lib.rs`, `crates/kernel/demo/src/read.rs`, `crates/kernel/demo/tests/reading.rs` |
| `crates/kernel/*/src/lib.rs` | `crates/kernel/demo/src/lib.rs` |
| `src/?.ts` | `src/a.ts`, `src/b.ts` |
| `docs/*.md` | `docs/*.md` |
| `../outside/*.ts` | `../outside/*.ts` |
| `src/b.ts`, `src/a.ts`, `src/a.ts` | `src/a.ts`, `src/b.ts` |
| `src/*.ts`, `src/a.ts` | `src/a.ts`, `src/b.ts` |
| none | none |

### Requirement: Active schedule
`active_schedule(root)` in `osq-kernel-loop` SHALL give every active
change of the project at `root` its state, as ADR 027 says, by building
core's scheduler input from the change folders and calling core's
`schedule`. It reads the changes the storage kernel's `list_changes`
lists, each active one with `read_change`, and for each active change:

- its id is the snapshot's `id`;
- it is running when it is approved and at least one of its tasks is
  `done` or has a `started` count above 0;
- its dependencies are its proposal's `depends_on` ids, read with the
  specs kernel's `read_proposal`, in their order, none when it has no
  `proposal.md`; a dependency is done when an archived change has that
  id or that folder name;
- its files are `scope_files` over the scope entries of all its tasks, in
  task order, when it is approved, and none when it is not.

The running changes, in listing order, are core's `RunningChange`s, and
every other active change, in listing order, is a `QueuedChange`. The
result SHALL be an `ActiveSchedule` holding `changes`, one `ActiveChange`
per active change in listing order with its `id`, its `folder` and its
`state`, and `start`, the ids core's `schedule` starts. A state is an
`ActiveState`: `Running` for a running change, else `Queued` holding the
`ScheduleState` core gave it. `Running` SHALL display as `running`, and
`Queued` as its `ScheduleState`.

An error reading a change SHALL be a `LoopError`: `LoopError::Storage`
holding the storage kernel's error, or `LoopError::Specs` holding the
specs kernel's error for a `proposal.md` that exists but does not read.
Each displays as the error it holds.

#### Scenario: States of the fixture repository
- **WHEN** `active_schedule` reads `crates/kernel/loop/tests/fixtures/repo/`, whose only archived change is `001-landed` and whose active changes are below, each with a `proposal.md` and one `tasks/<n>.md` per task scope listed, and `.run/approved` when approved
- **THEN** each active change has the row's state, displayed as given, in this order, and `start` is `006`, `009`:

| Folder | Approved | Dependencies | Task scopes | Markers | State |
|---|---|---|---|---|---|
| `002-unapproved` | no | none | 1: `src/x.ts` | none | `needs approval` |
| `003-waiting` | yes | `001`, `004` | 1: `src/y.ts` | none | `waiting on 004` |
| `004-running` | yes | none | 1: `src/a.ts`; 2: `src/b.ts` | `.run/done/1` | `running` |
| `005-blocked` | yes | none | 1: `src/a.ts`, `src/b.ts` | none | `blocked by 004: src/a.ts, src/b.ts` |
| `006-glob` | yes | `001` | 1: `crates/kernel/demo/src/*.rs` | none | `ready` |
| `007-crate` | yes | none | 1: `crates/kernel/demo/tests/new.rs` | none | `blocked by 006: crates/kernel/demo` |
| `008-started` | yes | none | 1: `src/c.ts` | a `started` line in `.run/events/1.jsonl` | `running` |
| `009-nothing` | yes | none | 1: `docs/*.md` | none | `ready` |

#### Scenario: Project without changes
- **WHEN** `active_schedule` reads `crates/kernel/loop/tests/fixtures/missing/`, which does not exist
- **THEN** it returns no change and starts none

#### Scenario: Unreadable task file
- **WHEN** `active_schedule` reads `crates/kernel/loop/tests/fixtures/broken/`, whose active change `001-broken` holds a `tasks/1.md` whose frontmatter does not parse
- **THEN** it returns a `LoopError::Storage` whose display names that task file

#### Scenario: Active schedule of this repository
- **WHEN** `active_schedule` reads this repository's root
- **THEN** it succeeds, its changes are the active change folders `list_changes` lists, in that order, and every started id is a change whose state is `ready`
