---
title: Rust osq sync syncs an active change and recertifies its done tasks
depends_on: ["328"]
verify: sh scripts/verify-rust.sh
features:
  reads: [rust-core, rust-specs, rust-config, rust-vcs, rust-harnesses]
---
## Goal

Rust `osq sync <id>` (304) syncs only an archived change and refuses an
active one. TypeScript also syncs an active change in its worktree. It
merges the default branch into `osq/<folder>`, reruns each done task's
verify on the merged tree, and recertifies any done task whose scope the
merge changed. This change ports that. It also ports the refusals
TypeScript makes for both kinds of change: while a watcher runs and while
a task runs.

The scope hash, done-marker rewrite and frontmatter writer that 297 built
live in the retry crate, and the land feature cannot depend on another
feature. They move to the storage kernel, and retry uses them from there.

## Verify

`sh scripts/verify-rust.sh` runs the format check, clippy and every Rust
test. The land crate's sync tests compare Rust's output, branch tip,
worktree status, event lines and done marker with goldens that
TypeScript's built `dist` printed: ten archived rows, one watcher row and
eleven active rows. The storage crate's new tests check the moved scope
hash, done-marker reader and rewrite row by row against TypeScript's
`computeTaskScopeHash`, `readDoneMarker`, `findDifferingPaths` and
`refreshRecertifiedDoneMarker`. Retry's existing recertification tests
still pass unchanged.

## Non-goals

- Stacked changes. Rust still refuses them, now for active changes too.
- A bridge commit for stacked dependents, which TypeScript's sync makes.
- `OSQ_DIFF` in the sync's verify runs. Rust retry passes none either.
- The watcher's own sync before an attempt.
- A change that exists only in the checkout, outside any osq worktree.

## Surface

- Changed: `osq sync <id>` (Rust) syncs an approved active change in its osq worktree
- Changed: `osq sync <id>` (Rust) refuses while a watcher runs or a task runs, with TypeScript's messages
- Removed: the Rust refusal `<folder> has not archived; Rust sync does not sync an active change yet`

## Decisions

- ADR 022: the land feature does not call the retry feature. The shared scope hash and done-marker rewrite move to the storage kernel, which both features use.
- ADR 023: the moved code keeps its small named functions. The active sync adds pure task picking and event building, with thin orchestrators doing the IO.
- ADR 024: every new public item names its requirement, and every test names its scenario.
- ADR 025: the active sync writes today's `.run/done/<n>`, `.run/events/*.jsonl` and log files byte for byte as TypeScript does.
- ADR 026: delta capabilities and task files are read through the specs kernel. An active sync applies no delta.
- ADR 027: the two tasks run one after the other; task 2 uses what task 1 adds to storage.
- ADR 028: `sync` stays one command of the land feature.
- ADR 029: `sync` reads `timeouts.verifyTimeoutSeconds` and the `limits` it already reads from the config kernel, and no new key.

## Assumptions

- TypeScript would also match an active change that lives only in the checkout. Rust looks only in osq worktrees, as its archived sync does, and gives `No change "<id>" runs in an osq worktree` instead.
- The task verifies run with `OSQ_CHANGE` set to the active folder and no `OSQ_DIFF`. That matches TypeScript's `runVerificationCommand` call and Rust retry.
- The goldens' watcher rows write a `watcher.json` whose pid is the printing process's own. The Rust tests write their own pid and compare with `<pid>` replaced.
- An active stop appends a `sync_stopped` event that stays uncommitted, as in TypeScript. So the worktree's status shows the events file after an active stop.

## Contract

### Requirement: Active sync
`sync` SHALL merge the default branch into an approved active change's
branch, rerun its done tasks' verifies and recertify the done tasks whose
scope the merge changed, as TypeScript does.

#### Scenario: A main commit inside a done task's scope
- **WHEN** a human runs `sync 1` after `main` gained a file inside done task 1's scope
- **THEN** the branch gets the sync commit, task 1's done marker holds the merged scope hash, and its stream ends with an automatic `recertification` event

## Human steps

### Before approval

None

### After landing

None

## Delta

- `specs/rust-storage/spec.md`: ADDED "Task scope hash", "Done marker scope" and "Done marker refresh". Task 1.
- `specs/rust-retry/spec.md`: MODIFIED "Recertified done marker", keeping its two scenarios. Task 1.
- `specs/rust-land/spec.md`: MODIFIED "Sync command", ADDED "Active sync", "Active sync verify" and "Active sync recertification". Task 2.
- `golden/` holds TypeScript's `sync.json` and `message.json`, and `golden/print-sync-message-goldens.mjs.txt` is the script that printed them. Copy the script to a `.mjs` file before running it. Its archived rows and `message.json` equal the land crate's current goldens. Task 2 copies the script and `sync.json` into the land crate's `tests/fixtures/sync-message-golden/`.

No file is shared between the tasks.
