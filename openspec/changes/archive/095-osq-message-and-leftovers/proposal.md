---
title: osq message, leftover drafts, and traceability through files
depends_on: ["094"]
verify: pnpm verify
features:
  reads:
    - cli-foundation
    - spec-lint-and-approve
    - status-inspection
    - traceability
    - version-control
    - watcher-and-harness
---
## Goal

A change landed by hand keeps its trailers. `osq message <id>` prints the
squash commit message of a change archived on its `osq/<folder>` branch,
with the trailer block ADR 003 decision 1 describes, and says which branch
to squash. It writes nothing. For a stacked change whose dependency has not
landed, it names that dependency instead. After a hand landing, `osq status`
flags the checkout's leftover copy of the draft when its hash still matches
the approved one, and prints the command that removes it. Tests run by hand
inside an osq worktree find their change from the worktree's branch, by
reading files only. This completes stage 1 of ADR 003.

## Verify

`pnpm verify`

The typechecks, build, full suite, and lint pass. New tests prove each part
through its real entry point. `lookupScenario` runs in temporary trees that
have hand-written `.git` and `HEAD` files and no git process. `messageCommand`
runs on a temporary repository where `runWatcherOnce` has run a change to its
archive commit in a worktree. That test also lands the change with
`git merge --squash` and `git commit -F -` and parses the result with
`git interpret-trailers --parse`. `statusCommand` runs on a checkout after a
hand landing.

## Non-goals

- `osq land`. That is stage 2.
- Removing the leftover copy. Status prints the command, and the human runs it.
- Removing the worktree or branch after a hand landing.
- Refusing `osq message` for a change that has already landed. It prints the
  message again.
- Reading an archived change whose worktree was removed. `osq message` needs
  the worktree that holds the archive.
- Flagging leftovers with `vcs.enabled` off. With the flag off, archive moves
  the folder in the checkout, so no copy is left behind.

## Surface

- Added: `osq message <id>` (command). It prints the squash message on stdout, and `Branch: osq/<folder>` and `Land: git merge --squash osq/<folder> && osq message <id> | git commit -F -` on stderr
- Added: squash commit format `osq: <id> <folder words>` with the trailers `Osq-Change`, `Osq-Base`, `Osq-Head`, `Osq-Approved`, `Osq-Approved-By`, `Osq-Model`, and `Osq-Version` (commit format)
- Added: `osq status` section `Leftover drafts:` with one `  <folder>: landed; remove the checkout copy with rm -r <path>` line per leftover (command output)
- Changed: the scenario test helper finds the change from an `osq/<folder>` worktree branch when `OSQ_CHANGE` is unset (testing entry point behaviour)

## Decisions

- ADR 001: `osq message` loads its config with `loadConfig` like every other command, and adds no loader.
- ADR 002: `osq message` reads the archive exactly as the archiver wrote it, and applies no delta.
- ADR 004: `osq message` and status's leftover check run no validator.
- ADR 005: unchanged; nothing here checks the validator range.

## Background

ADR 003 decisions 1, 2, 7, and 11. This is change 7 of stage 1. The brief is
`brief.md`.

After archive, the watcher leaves the change's worktree in place, on
`osq/<folder>`, with the folder under the worktree's archive directory. The
resolver lists it as an archived change in that worktree's tree. So
`osq message` reads the proposal, `tasks.md`, the task events, and
`.run/base`, `.run/approved`, and `.run/approver` from there, and takes
`Osq-Head` from that worktree's head in `worktreeList`. `readCommitTrailers`
already reads each task's model and version from its last `started` event.
`awaitedDependencies` in `src/core/spec/stack-dependencies.ts` already
returns the `depends_on` entries that are approved or archived but not
landed.

A hand landing with `git merge --squash` leaves the checkout's copy of the
folder behind. `git merge --squash` does not refuse over it, because the
branch only adds the archive folder (tested on 2026-09-26). While the
worktree exists, the resolver hides that copy, because the worktree names
the folder. Once the worktree is removed, the copy shows up as a draft. The
leftover check therefore reads the checkout's changes directory directly,
from the first `changeTrees` tree, and status leaves a leftover out of
`Active specs:`. A change counts as landed when the default branch holds
`<archive>/<folder>/.run/approved`, which is the test `readDependencyState`
already uses.

The outcome line of each task in the squash body is
`[verified] task <n>: <title>`, or `[manual] task <n>: <title>` for a task
done with `osq done --manual`. The elapsed time in a task commit's outcome
line comes from the watcher's run and is not stored in any file, so the
squash body does not repeat it. `Osq-Version` repeats once per osq version
used, as `Osq-Model` does per model. ADR 003 decision 1's trailer block
includes it, although the brief's list leaves it out.

README.md no longer has a "Not yet" section, so the brief's README item
already holds. It lost the worktree and `scope_violation` entries during
stage 1, and the sandbox caveat stays in the harness sections. Task 3 adds
`osq message` and the hand landing to README.md.

`src/core/trace/scenario-lookup.ts` has 247 lines, so task 1 moves the
openspec root search into a new module. `src/cli/index.ts` has 242 lines, so
task 2 registers the command from its own file, as `registerApproveCommand`
does. `src/core/status/status.ts` has 218 lines, so the leftover reads go in
a new module.

## Contract

### Requirement: Flag off unchanged
With `vcs.enabled` off, `osq status` SHALL print exactly what it printed
before this change. Outside an osq worktree, scenario lookup SHALL resolve
exactly as before.

#### Scenario: Existing suite
- **WHEN** the existing status and traceability tests run
- **THEN** every one passes unchanged

## Human steps

### Before approval

None

### After landing

None

## Delta

- `specs/traceability/spec.md`: modifies "Effective scenario lookup".
- `specs/watcher-and-harness/spec.md`: adds "Squash commit message".
- `specs/cli-foundation/spec.md`: adds "Message command".
- `specs/status-inspection/spec.md`: adds "Leftover draft in status".

Three tasks, and no two share a file. Task 1 changes the lookup. Task 2 adds
the squash message and its command. Task 3 adds the leftover check to status
and documents the hand landing in README.md.
