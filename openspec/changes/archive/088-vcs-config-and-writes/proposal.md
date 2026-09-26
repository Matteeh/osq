---
title: Version control config and git write operations
depends_on: []
verify: pnpm verify
features:
  reads:
    - cli-foundation
    - status-inspection
    - version-control
    - watcher-and-harness
---
## Goal

osq can configure version control and perform every git write that stage 1
needs, but nothing calls those writes yet. `osq.config.ts` gains a `vcs` block
with `enabled`, off by default, and `author`, `worktreeRoot`, and `prepare`,
plus `timeouts.gitCommitSeconds`. The `Vcs` port gains the writes that stage 1
of ADR 003 uses: branches, worktrees, a commit that runs hooks, a patch of
every change including untracked files, and a discard that runs only inside an
osq worktree. None of them can express anything on decision 8's list of
things osq never does. With `vcs.enabled`, doctor warns about a lockfile with
no prepare command, about commit hooks, and about `commit.gpgsign`.

## Verify

`pnpm verify`

The typechecks, build, full suite, and lint pass. New tests against temporary
repositories prove every write operation, the discard's two assertions, the
commit's hook and timeout behaviour, and that the port has no way to force,
rewrite, reset, delete a branch, stash, or clean ignored files. New tests prove
the `vcs` block's validation and the three doctor warnings.

## Non-goals

- Calling any write operation from approve, the watcher, or the dead path.
  Those are later changes of stage 1.
- Remote operations.
- Expanding `~` in `worktreeRoot` or building worktree paths. The change that
  creates worktrees does that.
- Comparing the committed tree with the verified one to catch a formatting
  hook.

## Surface

- Added: `vcs.enabled`, `vcs.author`, `vcs.worktreeRoot`, and `vcs.prepare` in `osq.config.ts` (config keys)
- Added: `timeouts.gitCommitSeconds` in `osq.config.ts` (config key)
- Added: the `vcs-prepare`, `git-hooks`, and `git-signing` lines of `osq doctor`, only with `vcs.enabled` (command output)
- Added: the `VcsConfig` type exported from the package (public type)

## Decisions

- ADR 001: the `vcs` block loads through the existing jiti config path.
- ADR 002: archive is unchanged.
- ADR 004: the change adds no validator call.
- ADR 005: no version check moves.

## Background

ADR 003 decisions 3, 8 and 10. Decision 10 lists the port's write operations;
this change adds the ones stage 1 uses and no others. `diff`, `show`, `merge`,
`isAncestor`, and `log` wait for stages 2 and 3.

`src/core/foundation/config.ts` has 249 of 250 lines. A trial on `e420833`
moved the `AgyConfig` and `OpencodeConfig` interfaces into a new
`config-agents.ts`, re-exported them from `config.ts`, wired `vcs` and
`gitCommitSeconds` in, and exported `VcsConfig` from `src/index.ts`. That left
`config.ts` at 243 lines, and the typechecks, build, and all 2196 tests
passed. The same trial added a method to the `Vcs` port. No test implements
the port by hand, so that broke nothing either.

`runGit` in `git-vcs.ts` keeps only stdout today. A commit that fails must
report git's output, so `GitResult` gains stderr. The patch needs a temporary
index, which means setting `GIT_INDEX_FILE` for that one call, although the
child environment otherwise removes it.

## Contract

### Requirement: Writes are not wired
No existing command SHALL call a `Vcs` write operation in this change.

#### Scenario: Approve unchanged
- **WHEN** a change is approved and run with this change landed
- **THEN** no branch, worktree, or commit is created, with `vcs.enabled` off or on

## Human steps

### Before approval

None

### After landing

None

## Delta

- `specs/cli-foundation/spec.md`: adds "Version control configuration" and
  "Doctor version control warnings".
- `specs/version-control/spec.md`: modifies "Vcs port", and adds "Vcs write
  operations" and "Operations osq never runs".

Three tasks, and no file is shared. Task 1 owns the config, which task 2's
commit timeout and task 3's warnings read. Task 2 owns the port, including
the hook and config reads that task 3 calls.
