# Planning a change for osq

<!-- OSQ:START -->
## Planning a change

You write the change folder; a cheaper executor runs it one task at a time,
sees only what you wrote, and reads it literally.

### Interactive planning

When a human is in the session:

1. Read `AGENTS.md`, the capability specs this change touches, and one recent
   archived change end to end.
2. Write the change folder. Stop after the task list only when the human asks to
   review it first; then reply with the parent spec, the task list (titles only),
   the capability specs this change will write, and any `## Human steps`, and say
   the change folder is not written yet.

### Working from the handoff

When `osq plan` started you, `plan-prompt.md` in the selected change folder is
your complete prompt; read it and follow it exactly.

### Either way

- Write only inside that change folder.
- Run `osq lint <slug>` and fix every finding before you finish.
- Never run `osq approve`; a human owns that gate.
- Finish by telling the human, in chat, the task titles, that the change folder
  is written and `osq lint` passes, and the exact `osq approve <id>` to run. The
  human should not approve before that message.
- Grep for what already exists; verify every version, flag, or API before use.
- Write files with the file tool, never through a shell echo.

### Tasks

- One task per coherent unit. Title is "When X, Y".
- Every task names its `scope` and `verify` (no TTY, no network). A task that changes a preexisting
  test sets `tests.modify: true` and lists that test in `scope`; every other preexisting test is
  frozen. `osq lint` enforces the configured limits on scope patterns and acceptance lines.
- `osq init` and `osq new` seed `verify: node -e "process.exit(0)"` as a
  planning sentinel, not trusted coverage. `osq lint` rejects it; replace it
  before approval with a command that verifies the completed change's final tree.
- Every task's `verify` exercises its slice through the real entry point, wiring included. If closing
  the loop requires a file outside the task's `scope`, the scope is wrong; widen it or merge the task.
  An executor result that says the work is outside its scope is a planning failure.
- Every task's `verify` must stay re-runnable against the final tree of the
  completed change, because the watcher and archive recertification run it there after
  later tasks land. A command that passes only mid-change is a planning failure.
- By default the watcher also runs the change-level `verify` after each task, and
  a red result kills that task. Every task must leave it green; tasks that pass
  only together are one task.
- The watcher runs each task's `verify` once before the first attempt and expects
  it to fail. A task whose `verify` should already pass before any change, such as
  a refactor, declares `verify_starts: green`. A task whose `verify` names a test
  the task creates declares `verify_starts: red`; a new test file may share that
  verify with existing tests. `any` is only for a task that can honestly start
  either way.
- A file belongs to one task. Before each later task, the watcher re-hashes the
  resolved `scope` of every done task. When a later task must extend a file,
  order that later task after the owner, put the file in its `scope` too, and
  name the shared file in the proposal; the watcher then recertifies the owner
  by itself when the owner's `verify` still passes. Any other change to a done
  task's files halts the change until a human runs `osq retry`. Globs resolve again
  at every audit, so a broad glob also captures files that later tasks create.
- Task bodies carry acceptance lines and the names of existing code to reuse,
  without signature blocks, numbered implementation steps, or line numbers. Write
  full signatures only for ports.
- Refer to functions and files by name, never by line number.

### Parent spec

- `## Goal`, then the change-level `verify` every proposal declares as the first
  thing written after the goal, then `## Non-goals` and the contract as
  requirements with scenarios.
- `## Surface` follows `## Non-goals` and lists the user-facing names the change
  adds, changes, or removes: commands, flags, config keys, frontmatter fields,
  document sections, dead reasons, and event types. Write `None` when there are
  none; `osq lint` rejects a proposal without the section.
- `## Decisions` follows `## Surface`. Give one line per accepted ADR that
  governs a capability the change writes, saying what it means for this
  change, such as `ADR 009: the adapter is the only module that imports
  dockerode.` Name a system-wide ADR only to depart from it; AGENTS.md already
  carries its rule. A departure line starts `Departs from ADR <n>:` and gives
  the reason; a needed departure is a reason for a new ADR. Write `None` when
  no ADR governs the change. Repeat a rule in a task only when that task
  touches the area.
- The delta is the exact text the capability spec will contain after the change,
  never an instruction to update something.
- Anything a task must not do itself goes under `## Human steps`, which never
  includes `osq approve`.
- Split `## Human steps` into `### Before approval` and `### After landing`, and
  write `None` under one with no steps. A step during the run, such as an
  expected `osq retry`, goes under Before approval. After-landing steps, or
  `check: <command>` in the proposal frontmatter, keep the change verification
  pending after it lands, and its dependents wait, until a human runs
  `osq verified <id> --passed` or `--failed`.
- Guidance a task needs about another capability's code, such as how to test
  against it, goes into that capability's spec through a delta, not only into the
  task.
- Replacing a requirement's behavior is a REMOVED requirement plus an ADDED one.
  A MODIFIED requirement must keep every scenario it already has; `osq lint` and
  archive refuse one that drops any.
<!-- OSQ:END -->

# Change: 096 - A worktree names a change only when it holds it
Change ID: 096
Change Folder: 096-worktree-holds-change
Landed dependencies:
- openspec/changes/archive/094-stacking

## Capability Specs

All living specs. Read the ones this change writes or whose code it uses.

- openspec/specs/cli-foundation/spec.md
- openspec/specs/metrics-and-reporting/spec.md
- openspec/specs/spec-lint-and-approve/spec.md
- openspec/specs/status-inspection/spec.md
- openspec/specs/traceability/spec.md
- openspec/specs/version-control/spec.md
- openspec/specs/watcher-and-harness/spec.md
- openspec/specs/web-inspection/spec.md

## Architecture Decisions

Read in full every ADR that applies to all, and every ADR that applies to a capability this change writes. Name each governing capability ADR in the proposal's ## Decisions section.

- ADR 001: Use jiti for Runtime Config Loading. Applies to: cli-foundation. Rule: Load osq.config.ts, .js and .mjs with jiti; add no other TypeScript loader. Path: decisions/001-use-jiti-for-runtime-config-loading.md
- ADR 002: Feature Doc Delta Application Strategy. Applies to: watcher-and-harness. Rule: Archive merges approved deltas into living specs deterministically, without a model. Path: decisions/002-feature-doc-delta-application.md
- ADR 003: Git strategy. Applies to: all. Rule: Agents never run git. osq alone writes to git, never rewrites history, and never writes the human's checkout or main except through osq land. Path: decisions/003-git-strategy.md
- ADR 004: Pinned OpenSpec Validator. Applies to: spec-lint-and-approve, cli-foundation. Rule: Run the local OpenSpec validator with OPENSPEC_TELEMETRY=0, --strict, --json and --no-interactive. Path: decisions/004-pinned-openspec-validator.md
- ADR 005: OpenSpec Validator Peer Range. Applies to: spec-lint-and-approve, cli-foundation. Rule: An OpenSpec version inside the peer range passes with a warning; one outside it fails. Path: decisions/005-openspec-validator-peer-range.md

## Brief

---
queue_item: worktree-holds-change
queue_hash: sha256:48bbfaaff6e22f1c06393e0436702f36a8cacf11838663c9a39efbc8dd7694f7
planner: null
date: 2026-09-26
---

### Goal

A worktree on `osq/<folder>` that holds no change folder no longer hides that change's stacked approval, so a failed stacked cut can keep the worktree it added and the retry reuses it, as change 094's "Stacked cut" first intended.

### Context

- `changeTrees` in `src/core/status/change-locations.ts` names a folder by a worktree's branch alone, and then drops the stacked tree for the same folder.
- Change 094's task 4 worked around this: a failed cut removes the worktree it added and prunes git's record before it rethrows, keeping the branch and the stacked approval. Reported in its result's `## Deviated`.

### Requirements

- A worktree tree names its folder, and hides the checkout's copy and any stacked tree of that folder, only when the worktree holds that change folder in its changes, archive, or rejected directory.
- A stacked cut that fails keeps the branch, the worktree it added, and the stacked approval. After `osq retry <id> change`, the next cycle reuses both.

### Non-goals

- Any other change to stacking.

### Notes for planning

- `tests/stack-run.test.ts` pins the current removal in its "Cut fails and resumes" case, and `tests/change-locations-stacked.test.ts` pins "Stacked folder with a worktree". Measure the fallout before scoping.
- `stack-dependencies.ts` copies `findChange`'s unexported `matchesFolder`; exporting it from `change-locations.ts` removes the copy.

## This repository's record

First-attempt passes: 82/84
Largest first-attempt pass: 079-architecture-decisions/4 "When osq new, an OpenSpec-aware agent, or the planner starts a proposal, every entry point asks for a Decisions section" (scope files: 22, acceptance lines: 6) [resolver 2 scope]
Median task duration: 4m 44s
Dead outcomes:
- 092-opencode-v2-adapter, When the opencode harness runs a task or a planning session, it uses opencode v2's flags and records the final step's usage, blocked
- 084-git-stage-0, When osq reads git state, one Vcs port answers through GitVcs or NoVcs, blocked
- 084-git-stage-0, When osq reads git state, one Vcs port answers through GitVcs or NoVcs, blocked

## Recent executor disclosures

Executor claims from result files, not verified facts. Check them against the code before relying on them.

094-stacking task 2, missing context:
> Nothing blocking. The placeholder folder name passed to `stackedPath` only serves to take its parent; the task's Details explicitly asked for the parent of `stackedPath(vcs config, repo root, any folder name)`.

094-stacking task 3, deviated:
> Moved the preexisting `writeProvenance` helper into
> `stack-dependencies.ts` rather than duplicating it, because `approve-worktree.ts`
> grew past the 250-line budget once the stacked branch was added. The move also
> keeps the "approver line" logic in one place.

094-stacking task 3, missing context:
> None blocking. The `depends_on` folder resolver had to replicate
> `findChange`'s unexported `matchesFolder` because `change-locations.ts` is not
> in this task's scope and does not export it.

094-stacking task 3, outside scope:
> The background note says `tests/worktree-lifecycle.test.ts`'s reject case will
> break once task 5 commits the rejected move before removing the worktree. That
> file is task 5's scope, so it was left alone.

094-stacking task 4, deviated:
> A failed cut removes the worktree it added (and prunes git's record) before it
> rethrows, keeping the branch and the stacked approval. The delta says the next
> cycle "reuses the branch and worktree that exist", but `changeTrees` prefers
> any worktree whose branch is `osq/<folder>` over the stacked directory even
> when that worktree holds no change folder. Leaving the failed worktree would
> hide the stacked tree, so neither the next cycle nor `retrySpec` could find the
> change. Removing the worktree keeps the branch and lets the next cycle re-add
> it; the failed cut's test passes with the branch reused.

094-stacking task 4, missing context:
> The planner may want task 2's "Change locations" to suppress a worktree tree
> only when that worktree actually holds the change folder it names; then the
> failed-cut worktree could stay. As written, it suppresses on branch name alone,
> which is why the cut cleans up its own failed worktree.

094-stacking task 5, deviated:
> The task Details say to build the reject message with `formatCommitMessage`
> and `readCommitTrailers`. `readCommitTrailers` always adds an `Osq-Task`
> trailer and needs a task number, while the delta's "Rejection under version
> control" names only the `Osq-Change: <folder>` trailer for a change-level
> commit. I used `formatCommitMessage` alone with that single trailer, matching
> the delta and the proposal's Surface entry.

093-run-in-worktree task 1, deviated:
> - Kept the `gitGuard.check()` call where it was (before the spawn-failure return) and placed only the kill statement after that return, so events keep being recorded when a spawn already failed while the task still keeps its spawn failure.
> - The worktree commit scenario asserts the dead marker contains `formatVcsViolationWarning(moved)` for the moved fields the event recorded, rather than a fixed `['head']`, because a commit also moves the index digest.

093-run-in-worktree task 2, deviated:
> - The "Off its branch" scenario is exercised by calling `checkWorktree` and `haltWorktreeChange` directly with a located change after switching the worktree branch, instead of through `runWatcherCycle`. `changeTrees` only reports worktrees whose branch starts with `osq/`, so once the branch is switched the resolver drops the tree and the cycle never reaches the check. The check remains in the loop and fires for a branch moved between resolution and the check or archive.
> - `commitPendingVerifiedTasks` treats a done marker as pending when status lists it untracked (`??`) or newly staged (`A `). `vcs.commit` stages its paths before `git commit` runs the hook, so a rejected commit leaves `.run/done/<n>` staged; detecting only `??` would leave the verified task uncommitted forever after `osq retry <id> change`.
> - Pending verified commits run before the worktree clean check (both precede the spawn). The delta does not fix the order between the two, and this order is w[truncated]