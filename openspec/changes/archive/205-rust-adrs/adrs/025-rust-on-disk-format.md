---
status: accepted
applies_to: [rust-core]
rule: Rust osq reads and writes today's openspec/ folders, .run markers and event JSONL as they are; osq.config.ts becomes hand-written osq.toml; ~/.osq is rebuilt.
checks:
  - tests/rust-adrs.test.ts
  - crates/core/tests/event_corpus.rs
---
# 025. Rust on-disk format, read today's files as they are

Date: 2026-10-17

## Status

Accepted by Mathias on 2026-10-17, with the config step simplified, numbered
004 on the Notion Rust Rebuild page. Drafted after checking the osq repo at
`048ca0c`.

Scope: this ADR governs the Rust capabilities that `applies_to` lists, not the
TypeScript code under `src/`, which keeps its own ADRs until it is deleted.
The rule above is shortened to fit `limits.maxRuleLength`. The full wording:
Rust osq reads and writes today's `openspec/` folder, change folders, `.run`
markers and event JSONL as they are; only `osq.config.ts` is rewritten by hand
as `osq.toml`, and machine-local state under `~/.osq` is rebuilt.

## Context

ADR 022 makes files and git the source of truth, with SQLite only a
rebuildable read model. The Rust core's `Event` enum, state machines and read
model are shaped by those files, so their format has to be settled before core
is written.

The plan is to build the Rust core with today's osq and then switch osq to run
on itself. During that switch both binaries see the same repository, so the
Rust version has to understand what the TypeScript version wrote, and the
TypeScript version should still understand what the Rust version writes until
it is deleted. The README of the TypeScript version also promised that osq
could be "rewritten in another language later without consumers noticing".

What is on disk today, checked in the osq repo:

- **Living specs:** `openspec/specs/<capability>/spec.md` with an `osq.yml`
  sidecar each, 10 capabilities. `openspec/config.yaml` names the `osq`
  schema in `openspec/schemas/osq`. `openspec/queue.md` holds briefs.
- **Changes:** `openspec/changes/<id>-<slug>/` with `brief.md`, `proposal.md`
  with YAML frontmatter (`title`, `depends_on`, `verify`, `features`),
  `tasks.md`, `tasks/<n>.md` with YAML frontmatter (`title`, `verify`,
  `verify_starts`, `scope`, `entry`, `skills`) and delta specs in
  `specs/<capability>/spec.md`. Archived changes move to
  `openspec/changes/archive/<id>-<slug>/`, 191 of them.
- **Run records** in each change's `.run/`: `approved` (a `sha256:` folder
  hash), `approver`, `base` (a commit), `manifest.json` (hashes of
  instructions, config and touched specs), `plan.jsonl`, `done/<n>`,
  `dead/<n>.<attempt>.md` with `<n>.patch`, `results/<n>.md`, `regressed`,
  `stacked-on`, `paused.md`, `rejected.md`, `auto-steer.md`, `running`,
  `requirements-base`, `validator/` and `logs/`.
- **Events:** `.run/events/<task>.jsonl`, `change.jsonl` and
  `validator.jsonl`, one JSON object per line with the envelope
  `{"type", "timestamp", "data"}`. The archive holds 76,060 lines of 25 types,
  and every line parses. The types are `tool`, `tokens`, `text`,
  `verify_ran`, `file_changed`, `measures`, `started`, `exited`, `done`,
  `archived`, `format_ran`, `baseline_ran`, `retry`, `dead`, `regressed`,
  `instructions_changed`, `validator_ran`, `recertification`,
  `scope_violation`, `synced`, `result_written`, `stuck`, `harness_retry`,
  `verification_recorded` and `dependencies_added`, plus newer ones such as
  `usage_limit` and `paused` from change 193.
- **Config:** `osq.config.ts`, loaded with jiti per ADR 001.
- **Machine-local state** under `~/.osq/`: `watch/`, `inbox/`, `last-look/`,
  `remote/` and `worktrees/`. None of it is committed.
- **Derived index:** the SQLite read index of ADR 008, which is already a
  cache.

## Decision

### 1. Read and write the committed files as they are

Rust osq reads and writes `openspec/`, change folders, `.run/` markers and
event JSONL in exactly today's layout and syntax. No import step, no new
folder names and no rewrite of the archive. The 191 archived changes stay
readable by the report, query, replay and metaloop features.

### 2. The event envelope is the contract

- The core `Event` enum maps one to one onto the JSONL envelope with serde,
  tagged by `type`, with the payload under `data` and the `timestamp` kept as
  written.
- Every type found in the archive gets a typed variant, including the
  high-volume harness stream types `tool`, `tokens`, `text` and
  `file_changed`.
- A line with an unknown `type` is a read error that names the file and line.
  It is never skipped silently.
- **Evolution is additive.** A new event is a new `type`. A new field in
  `data` is optional with a default. Changing the meaning or shape of an
  existing field needs a new `type` and an ADR, so old logs keep folding to
  the same state.

### 3. The approval seal stays byte-compatible

The folder hash in `.run/approved` and the hashes in `manifest.json` are
computed exactly as `src/core/spec/hasher.ts` does today: the same excluded
segments (`.run`, `.git`, `.DS_Store`), the same root-only transient files
(`plan-prompt.md`), CRLF turned into LF, `tasks.md` checkboxes reset to
unchecked, files sorted by relative path in JavaScript string order, each
entry hashed as path, NUL, content, NUL, and the `sha256:` prefix. Path order
must match JavaScript's UTF-16 sort, not Rust's byte sort, for non-ASCII
names. A change approved by TypeScript osq still verifies under Rust osq.

### 4. Config is rewritten once by hand

Rust can't execute `osq.config.ts`, and there is no migration tooling for it.
`osq.toml` is written once, by hand or by an agent translating
`osq.config.ts`, in the change that switches osq to Rust, and `osq.config.ts`
is deleted with the rest of the TypeScript code. The rule that every limit and
timeout comes from config carries over.

### 5. Machine-local state is rebuilt, not migrated

`~/.osq/` holds per-machine supervision records, inbox cursors, remote
settings and worktrees. Rust osq uses the same root but owns its own layout
under it. On first start it rebuilds what it can from the repository, such as
worktrees from `osq/*` branches, and resets cursors. The SQLite read model is
rebuilt from files as ADR 022 says.

### 6. Changing the format later

A change to any committed format needs its own ADR and ships with a migration
that runs as an ordinary osq change, so the archive is either still readable
as is or converted in one reviewed commit.

## Enforcement

- **Archive replay test.** A fixture snapshot of the osq repo's 191 archived
  changes. The test parses every event line into `Event`, every marker, every
  proposal and task frontmatter, and fails on any error. It then folds each
  change and checks the final state matches its markers, such as `done/<n>`
  for every done task and `archived` as the last change event.
- **Round-trip test.** Every parsed event serializes back to a JSON value
  equal to the original line.
- **Event schema snapshot.** An `insta` snapshot of the serde schema of
  `Event`. Adding a variant updates the snapshot. Changing an existing
  variant's fields fails review unless the change names this ADR.
- **Seal golden test.** Fixture change folders with the hashes TypeScript osq
  produced for them, including checkbox edits and transient files. Rust must
  produce the same hashes.
- **Differential read test during the switch.** While both versions exist, CI
  runs TypeScript `osq query` and the Rust read model on the same archive and
  compares `task_outcomes`, `dead_attempts` and `pauses`.

## Consequences

- No project data is lost and no import step blocks the switch. The archive is
  the first test corpus for the Rust core.
- TypeScript and Rust osq can read the same repository during the switch, as
  long as only one watcher runs at a time.
- The Rust event types inherit some names and fields that a clean design might
  have chosen differently. That is the price of keeping 191 changes of history
  readable.
- The seal hash can never be "cleaned up" without an ADR, since it would
  invalidate every recorded approval.
- Config is the one file written by hand at the switch, with no legacy tooling
  to maintain.

## Rejected

- **A new format with a one-time import.** Cleaner types, but every archived
  change would need converting, the switch would need a freeze, and the import
  itself would be code nobody runs twice.
- **Skipping unknown event types.** It would let a format drift go unnoticed,
  which is how silent failures start.
- **Reading `osq.config.ts` by embedding a JS runtime.** It would add a second
  runtime to a Rust binary for one file.
- **Migrating `~/.osq/`.** It is per machine, uncommitted and cheap to
  rebuild.
