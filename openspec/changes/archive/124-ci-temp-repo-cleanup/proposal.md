---
title: CI never fails because a test's temp repository is still being written when it is removed
depends_on: []
verify: pnpm verify
features:
  reads:
    - version-control
---
## Goal

`pnpm verify` on the GitHub Actions runner passes whenever it passes locally.
No test fails in its cleanup because a process is still writing into the temp
git repository the test is removing.

After this change, every git process started during `pnpm test` runs with
`maintenance.auto=false`. The test run turns it on through a preload module
that `node --test` imports before any test file. No test repository then
starts background git work, so nothing is left writing when `afterEach`
removes the temp root.

## Verify

`pnpm verify`

The typechecks, build, full suite, and lint pass. A new test commits in a temp
repository with git's trace2 event log on. Under the test environment the commit
starts no `git maintenance` child. The same commit without it starts one. The
test also checks that both `node --test` invocations in the `test` script load
the preload.

## Non-goals

- Changing the git settings osq uses in a user's repository. The writer is
  git's own auto maintenance, not a child osq leaves running, so `src/` does not
  change.
- Retrying `fs.rm` on `ENOTEMPTY` or `EBUSY` in the 54 git-using test files.
  Once maintenance is off, nothing writes in the background. The human chose to
  drop the retries rather than edit every preexisting test.
- Rewriting cleanup in any test file.

## Surface

None

## Decisions

- ADR 001: unchanged; no config loading moves.
- ADR 004: unchanged; no validator call moves.
- ADR 005: unchanged; no validator call moves.

## Background

**The writer.** Every `git commit` (and `merge`, `rebase`, `am`) runs
`run_auto_maintenance`, which starts `git maintenance run --auto`. A trace2 run of
`tests/worktree-run.test.ts` on 2026-09-30 recorded 45 such children across 46
commits. Since git 2.47 that child detaches (`maintenance.autoDetach`, default
true) and keeps working after the parent `git commit` returns. It takes
`.git/objects/maintenance.lock` and, depending on the maintenance strategy,
writes packs, commit-graphs, and midx files under `.git/objects`. The runner's
git is newer than 2.47. Local git 2.34.1 runs the child in the foreground, and
the commit waits for it. That is why the suite passes locally and fails on CI
with `ENOTEMPTY ... rmdir '<root>/repo/.git/objects/pack'`, a different test
each run.

**The switch.** `maintenance.auto=false` makes git skip starting the child at
all. It was checked with git 2.34.1: a commit with the three `GIT_CONFIG_*`
variables below starts no maintenance child. `GIT_CONFIG_COUNT`,
`GIT_CONFIG_KEY_<n>`, and `GIT_CONFIG_VALUE_<n>` exist since git 2.31 and reach
every git child through the environment.

**Who inherits it.** `node --test` runs each test file in a child process with
the parent's environment and `--import` flags, so a preload module that sets
the variables on `process.env` reaches every test file. `childGitEnv` in
`src/core/vcs/git-vcs.ts` copies `process.env` and removes only `GIT_DIR`,
`GIT_INDEX_FILE`, and `GIT_WORK_TREE`, so osq's own git calls keep the
variables. Tests' own `execFile('git', ...)` calls pass `process.env` or a copy
of it. `buildRoleEnv` drops them for verify and agent processes, but no fixture
verify or mock harness runs git.

**Measured fallout.** No test pins the text of the `test` script in
`package.json`.

## Contract

### Requirement: Tests start no background git work
Every git process started during `pnpm test` SHALL run with
`maintenance.auto=false`, so nothing writes to a test's repository after the
git command that started the write has returned.

#### Scenario: A test commits
- **WHEN** a test commits in its temp repository under the test run's environment
- **THEN** git starts no `git maintenance` child

## Human steps

### Before approval

None

### After landing

- Push `main` and let the `CI` workflow's `verify` job pass three times in a
  row, rerunning it with `gh run rerun <run-id>`. Then run
  `osq verified 124 --passed`, or `--failed` if any run fails in a temp-root
  cleanup.

## Delta

- `specs/cli-foundation/spec.md`: adds "Tests start no background git work".

One task. No file is shared.
