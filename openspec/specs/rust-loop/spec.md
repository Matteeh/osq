# rust-loop Specification

## Purpose
The loop kernel schedules work: it reads a repository's active changes and asks core's scheduler which may start, as ADR 027 says. It is the watcher of the TypeScript version.

## Requirements

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

### Requirement: Command entry point
`run_command(features: &[Box<dyn Feature>], invocation: &Invocation) ->
CommandRun` in `osq-kernel-loop` SHALL be the one way an app runs a
command, as ADR 030 says. It calls `run` on the first feature whose
`commands()` lists the invocation's command, or gives
`FeatureError::unknown_command` with the command and calls no `run`. Then,
whatever the result, it delivers events for the invocation's `root` as
rust-loop "Event delivery" says. `CommandRun` SHALL be public, derive
`Debug`, `Clone`, `PartialEq` and `Eq`, and hold
`result: Result<Output, FeatureError>`,
`failures: Vec<ReactionFailure>`, the delivery failures in the order they
happened, and `warnings: Vec<String>`, the delivery warnings in the order
they happened.

#### Scenario: Commands through the entry point
- **WHEN** `run_command` runs the row's invocation with the test features `make`, which lists `make` and `fail`, and `other`, which also lists `make`, on a scratch root with no `openspec/` folder
- **THEN** it gives the row's result, no failures, no warnings, and calls only the row's `run`:

| Command | Result | Called |
|---|---|---|
| `make` | `make`'s `Output` | `make`'s `run` |
| `fail` | `make`'s `Failed` error | `make`'s `run` |
| `nope` | `UnknownCommand` error displayed `unknown command: nope` | none |

### Requirement: Delivered changes
Delivery SHALL read nothing when every feature's `reacts_to` is empty.
Otherwise it delivers to
each active change of the root, in listing order: with the root's rust-config
`load_config` refusing the file, to none; with `vcs.enabled` and a rust-vcs
`project_git_root`, to the active entries of rust-storage
`list_tree_changes` over `change_trees` built from the `worktree_list` of a
`GitVcs` at the root with the config's `timeouts` and no stacked folders;
otherwise to the active entries of `list_changes`. A failing worktree
listing SHALL give one `ReactionFailure` for the feature `delivery` and the
change `*`, with the `VcsError`'s display, and deliver nothing.

#### Scenario: Changes delivered to
- **WHEN** a test runs `run_command` with a feature listing `noop`, which writes nothing, and a feature `seen` reacting to `rejected` and recording each change it is called for, on a root holding active `001-a` and `002-b` and archived `000-z`, each holding `.run/events/change.jsonl` with one `rejected` line
- **THEN** `seen` is called for `001-a` then `002-b`, and never for `000-z`, and with no `seen` feature no `.run/delivered/` folder is made

### Requirement: Event delivery
For each delivered change, delivery SHALL take the change's lock, as
rust-loop "Delivery lock" says, then for each feature with a non-empty
`reacts_to`, in the order given, and each file of the change's
`.run/events/` whose name ends in `.jsonl`, in byte order of the names:

1. take the file's offset from the feature's cursor, or 0;
2. pass over the file when its size equals the offset, and give a failure
   `event file <name> is shorter than its cursor` when it is smaller, or
   `cursor of <name> is not at a line start` when the offset is above 0
   and the byte before it is not `\n`, delivering nothing more from that
   file;
3. read the bytes from the offset and take only up to the last `\n`; a
   last line with no `\n` is left for a later delivery;
4. for each complete line in order: pass over a line that rust-core
   `parse_event_line` refuses, adding the warning
   `<feature> passed over byte <offset> of <name> in <change>: <error>`,
   where `<offset>` is the line's first byte and `<error>` the
   `EventError`'s display; pass over a line whose event's kind the feature
   does not list, with no warning; otherwise call `react` with a
   `Reaction` of the root, the change
   folder and the envelope. On `Ok`, move the offset past the line and
   write the cursor. On `Err`, give a failure and stop delivering to this
   feature for this change, leaving the offset before the line;
5. at the end of the file, write the cursor when its offset moved.

Delivery makes one pass: an event a reaction appends is delivered by a
later call. A failure for one feature or change does not stop delivery to
the others.

#### Scenario: Delivery cases
- **WHEN** a test runs delivery for a feature `seen`, reacting to `rejected` and recording each event it is called with, on a scratch active change `001-a` whose `.run/events/` holds the row's files, where `R<n>` is a complete `rejected` line whose reason is `<n>` followed by `\n`
- **THEN** `seen` is called with the row's reasons in order, and the row's outcome holds:

| Files and cursor | Reasons | Outcome |
|---|---|---|
| `change.jsonl` holding `R1`, `R2`; no cursor | `1`, `2` | the cursor holds the file's size for `change.jsonl` |
| the same, then delivery runs again | `1`, `2` once in all | the second run calls nothing |
| `change.jsonl` holding `R1` and `R2` without its `\n` | `1` | the cursor holds the length of `R1`; after `\n` is appended, a second run gives `2` |
| `change.jsonl` holding `not json\n`, a `dead` line, `R3` | `3` | no failure, and the one warning `seen passed over byte 0 of change.jsonl in 001-a: line is not one JSON object` |
| `change.jsonl` holding `R1`, `R2`; the cursor set back to 0 after a first run | `1`, `2`, `1`, `2` | at least once: the rewound cursor delivers again |
| `1.jsonl` holding `R4`, `change.jsonl` holding `R5` | `4`, `5` | files in byte order of their names |
| `change.jsonl` holding `R1`; the cursor holds 999 for it | none | one failure whose message is `event file change.jsonl is shorter than its cursor` |
| `change.jsonl` holding `R1`, `R2`; the cursor holds 3 for it | none | one failure whose message is `cursor of change.jsonl is not at a line start`, and the cursor still holds 3 |

#### Scenario: One pass
- **WHEN** a feature reacting to `rejected` appends a `rejected` line to the change's `change.jsonl` each time it is called, and delivery runs once on a change holding one `rejected` line
- **THEN** the feature is called once, and a second delivery calls it once more

### Requirement: Delivery cursor
A feature's cursor for a change SHALL be the file
`.run/delivered/<feature name>` in the change folder: one JSON object
mapping each event file's name to its byte offset, keys in sorted order,
written compact and followed by `\n` through rust-storage `write_durable`,
creating `.run/delivered/` when it is missing. A missing cursor file is an
empty object. A cursor file that is not such an object SHALL give a failure
`cursor <path relative to the change folder> is not valid` and deliver
nothing to that feature for that change.

#### Scenario: Cursor files
- **WHEN** delivery of the feature `seen` to `001-a` finds the row's cursor file
- **THEN** the row's outcome holds:

| Cursor file | Outcome |
|---|---|
| none, after delivering 12 bytes of `change.jsonl` | `.run/delivered/seen` holds `{"change.jsonl":12}\n` |
| `{"change.jsonl":12,"1.jsonl":0}\n` | it is read, and rewritten with sorted keys when an offset moves |
| `[1]\n` | one failure `cursor .run/delivered/seen is not valid`, and `seen` is not called |

### Requirement: Delivery lock
Delivery to a change SHALL first open `.run/delivery.lock` in the change
folder, creating `.run/` and an empty file when missing and never deleting
it, and take an exclusive lock on it with std `File::try_lock`. It SHALL
hold the lock until delivery to that change ends, and take it once per
change. A lock held by another open handle, `TryLockError::WouldBlock`,
SHALL deliver nothing to that change and give no failure and no warning,
since the holder delivers. Any other error opening or locking the file
SHALL give one failure for the feature `delivery` whose message is
`delivery lock of <change folder> could not be taken: <error>`, with the
error's display, and deliver nothing to that change.

#### Scenario: Held lock
- **WHEN** a test holds an exclusive lock on `001-a`'s `.run/delivery.lock` through its own handle and runs delivery with a feature reacting to `rejected`
- **THEN** it gives no failure and no warning, calls no `react`, and writes no cursor; after the test drops its handle, a second delivery calls `react`

#### Scenario: Lock error
- **WHEN** `001-a`'s `.run/delivery.lock` is a folder and delivery runs with a feature reacting to `rejected`
- **THEN** it gives one failure for the feature `delivery` and the change `001-a` whose message starts with `delivery lock of 001-a could not be taken: `, and calls no `react`

### Requirement: Reaction failures
`ReactionFailure` SHALL be public, derive `Debug`, `Clone`, `PartialEq` and
`Eq`, and hold `feature`, `event`, `change` and `message`, all `String`:
the feature's name, the event's type or empty for a failure that no event
caused, the change folder's name, and the message, which for a `react`
error is the `FeatureError`'s display. It SHALL display as
`<feature> could not handle <event> for <change>: <message>`, or
`<feature> could not deliver to <change>: <message>` when `event` is empty.

#### Scenario: Failure texts
- **WHEN** the failure in the row is displayed
- **THEN** it reads the row's text:

| Feature | Event | Change | Message | Text |
|---|---|---|---|---|
| `retry` | `rejected` | `001-a` | `retry failed: no` | `retry could not handle rejected for 001-a: retry failed: no` |
| `delivery` | empty | `001-a` | `delivery lock of 001-a could not be taken: no` | `delivery could not deliver to 001-a: delivery lock of 001-a could not be taken: no` |
