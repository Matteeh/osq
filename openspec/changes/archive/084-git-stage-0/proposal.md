---
title: Git stage 0, read only
depends_on: []
verify: pnpm verify
features:
  reads:
    - cli-foundation
    - spec-lint-and-approve
    - status-inspection
    - watcher-and-harness
---
## Goal

osq reads git state without writing to git. When a task's agent runs git, or
edits a file outside its scope, the watcher records it and warns. In stage 0
nothing is killed for either, because the watcher still runs in the checkout
the human edits and uses git in. Verify output and the `archived` event's
`archivePath` are written relative to the project root, because stage 1 commits
`.run/` to a branch. Doctor reports git, and warns when `GIT_DIR`,
`GIT_INDEX_FILE` or `GIT_WORK_TREE` is set. The executor prompt tells agents
never to run git.

## Verify

`pnpm verify`

The typechecks, build, full suite, and lint pass. New tests against temporary
git repositories prove that:

- a commit, a stash, a checkout of another branch, and a staged file each
  record `vcs_violation` with the values before and after, and the task still
  lands
- a file changed outside scope records `scope_violation`, and the task still
  lands
- a file dirty before spawn that the agent leaves alone is no violation, and
  one the agent then edits is
- `GIT_DIR` set in the environment does not redirect osq's git reads, and
  doctor warns about it
- verify output and `archivePath` are written relative to the project root
- outside git, and in a folder below a repository's root, no git event is
  recorded, and doctor reports why git checks are off

## Non-goals

- Any git write: no branches, worktrees, commits, discards, or index changes.
- Changing where the watcher runs.
- Killing a task for `vcs_violation` or `scope_violation`. That is stage 1.
- `Vcs` operations later stages need, such as diff, isAncestor, log, and merge.
- Git checks for a project whose root is below its repository's root, such as
  a package in a monorepo. Stage 0 treats it as outside git.
- Rewriting paths in existing events or archives.
- A budget on all-scoped ADR rules; `limits.maxProjectRules` and
  `limits.maxRuleLength` already bound them.

## Surface

- Added: `timeouts.gitSeconds` in `osq.config.ts` (config key)
- Added: the `vcs_violation` event (event type)
- Added: the `scope_violation` event (event type)
- Added: the `git` and `git-env` lines of `osq doctor` (command output)
- Changed: the `archived` event's `archivePath` is relative to the project root (event field)
- Changed: verify output in `verify_ran` events and in dead and regressed markers is relative to the project root (event field)
- Changed: the executor prompt's closing line forbids running git (prompt text)

## Decisions

- ADR 001: `timeouts.gitSeconds` loads through the existing jiti config path.
- ADR 002: archive still merges deltas without a model; only the `archived`
  event's path changes.
- ADR 004: the change adds no validator call.
- ADR 005: no version check moves.

## Background

Measured on a scratch worktree of `8b53ca1` with rough versions of the
changes, against a green baseline of 2132 tests:

- A new doctor line breaks the check-name lists pinned in `tests/doctor.test.ts`,
  `tests/pi/doctor.test.ts`, and `tests/codex/adapter.test.ts`.
- Relative verify output breaks `tests/focused-tests.test.ts` and
  `tests/osq-change-env.test.ts`, which print `OSQ_CHANGE` and compare it with
  the absolute change folder. A relative `archivePath` breaks
  `tests/archiver.test.ts` and `tests/verification-record.test.ts`.
- The prompt line changes the golden prompts in `tests/fixtures/prompts/`.
- `src/core/foundation/config.ts` has room for exactly one more line, and
  `src/core/foundation/doctor.ts` for two.
- Git checks turn on only when the project root is the repository's top
  level. Tests that run the watcher against folders inside this repository's
  `fixture/` therefore see no git events, while the suite runs in parallel and
  edits other files.

## Contract

### Requirement: Violations are observe only in stage 0
A `vcs_violation` or `scope_violation` SHALL never fail, retry, or halt a task.

#### Scenario: Agent commits and verify passes
- **WHEN** the agent commits its edit and the task's verify passes
- **THEN** a `vcs_violation` event is recorded and the task is done

## Human steps

### Before approval

- Add `decisions/003-git-strategy.md` with `status: accepted` and
  `applies_to: all`, the plain string rather than a list. Decision 10 should
  place the `Vcs` port in `src/core/vcs/`, owned by the `version-control`
  capability, and stages 2 to 4 should be marked provisional until their
  briefs. Run `osq init` so AGENTS.md gains the project rules block, and commit
  both.

### After landing

None

## Delta

- `specs/version-control/spec.md`: a new capability with "Code ownership",
  "Vcs port", and "Vcs selection".
- `specs/cli-foundation/spec.md`: adds "Git read timeout" and "Doctor git
  check".
- `specs/watcher-and-harness/spec.md`: adds "Git state recording", "Scope
  violation recording", and "Relative verify output and archive path", and
  modifies "Shared executor prompt".

Five tasks, and no file is shared. Task 1 owns the port and selection, which
tasks 2 and 3 call. Task 3 owns `src/harness/types.ts` and both event types.
Task 4 owns `ArchivedEventData` in `src/watcher/archiver.ts`.
