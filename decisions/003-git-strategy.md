---
status: accepted
applies_to: all
rule: Agents never run git. osq alone writes to git, never rewrites history, and never writes the human's checkout or main except through osq land.
---
# 003. Git strategy

Date: 2026-09-18. Revised: 2026-09-26.

Supersedes nothing. Retires the worktree and `scope_violation` entries under "Not yet" in README.md.

## What the revision changed

The first version was written against `e389210`, before osq moved to OpenSpec's layout and before the traceability design. The revision keeps the shape of every decision and changes these things:

- Paths follow OpenSpec. Change folders are `openspec/changes/<id>/`, living specs are `openspec/specs/<capability>/spec.md`, and the archive is wherever osq archives changes today. Living specs take the place of feature docs in decisions 5, 6 and 9.
- Approval no longer deletes the draft from the checkout, and it commits the draft on the change's branch, so the checkout needs no spec commit. Decision 2.
- A sync stops instead of re-applying a delta over a requirement main has changed since the branch was cut. Decision 5.
- The git violation check compares HEAD, its branch, the index and stash entries, scoped to the task's own tree. Decision 4.
- `vcs_violation` and `scope_violation` are recorded in stage 0 and kill the task from stage 1, once the tree is osq's alone. Decision 4.
- The clean-tree rule binds osq's own post-task steps, such as focused test runs and mutation checks. Decision 3.
- One resolver answers which changes are active, for every reader including traceability. Decision 11.
- A Stages section maps the decisions onto the briefs `4.1-git-stage-0.md` and `4.2-git-stage-1-parent.md`, and adds `osq message` to stage 1.
- The ADR has frontmatter, so its rule reaches every agent through the generated block in AGENTS.md.
- The `Vcs` port lives in `src/core/vcs/`, owned by a `version-control` capability, following the capability-folder rule in AGENTS.md. Decision 10.
- Stages 2 to 4 are provisional until their briefs are written. Stages.

A second pass the same day, after stage 0 had landed, settled stage 1's design:

- A worktree per change stays, over one shared osq workspace. A dependent approved before its dependency lands is stacked on the dependency's archive commit. Decisions 2, 3 and 5.
- Clean means clean outside the active change's `.run/`, and `status` warns not to edit a worktree while a task runs. Decision 3.
- Commit hooks run, and a failed commit halts the change. Decision 8.
- The resolver answers only which changes are running or archived but not landed. Readers of drafts keep reading the checkout. Decision 11.
- The worktree location is settled as `~/.osq/worktrees/<repo>/<folder>`, and `brief.md` already lives in the change folder. Open questions 1 and 2.

The revision was written against those briefs and the traceability design, not a fresh read of the code. Recheck paths and function names against main before planning.

## Context

osq does not run git today. The watcher edits whatever working tree it is started in, the human commits the result by hand as one commit per change with the subject `osq: 011 observability fixes`, and `.run/` travels into the archive inside that commit. That works for one developer at a terminal. It stops working the moment osq runs headless, because every git action the human does today has to be osq's, or nobody's.

Two modes have to share one design.

Mode A, today. A developer runs `osq watch` in a checkout next to their editor and lands changes themselves.

Mode B, next. osq runs headless. Briefs arrive from GitHub Issues, later Jira. Approval may be a label. Nobody is watching a terminal, and a change must travel from approved to pull request opened without a human touching anything.

After that come concurrency above one using worktrees, and a provenance record complete enough that a different model could regenerate a change from the same specs and be judged against them.

Before writing the first version I read README.md, AGENTS.md, decisions 001 and 002, `src/watcher/loop.ts`, `runner.ts` and `archiver.ts`, `src/core/state.ts`, `hasher.ts`, `approve.ts`, `lock.ts`, `config.ts` and `new.ts`, the archive of 011 end to end including `.run/`, the events of 015, and the history of `main` at `e389210`. PLANNER.md was not in the repository at that commit.

The constraints this design accepts as given. Files remain the only state. Anything git-related osq needs to remember lives under `.run/` or is derivable from git. No new runtime dependency. Git is a binary, and its absence is a `doctor` failure. Nothing requires a human in mode B between approval and PR opened. Nothing lets a change reach `main` without a human in mode A or a merge in mode B. Deterministic over clever.

## What I am pushing back on

Ten things in the brief or the code I would change before, or as part of, this design.

1. **"Files are the only state" needs one clause added.** It is true of osq's own state. Mode B adds a second source of truth osq cannot avoid: the tracker. Whether a PR is open, closed or merged, and whether a label is present, live on GitHub. This design treats those as inputs, like a human typing `osq approve`, never as storage. Every input from the tracker becomes a file under `.run/` or a git ref before osq acts on it. I would put that sentence into AGENTS.md.

2. **Events and markers write absolute machine paths, and the provenance record is about to be committed.** At `e389210`, `specs/archive/015-status-row-fixes/.run/events/1.jsonl` contains `/home/mathias/projects/osq/src/core/logger.ts`. `relativizeToolSummary` only cleans the rendered copy, and its comment says the raw summary is never rewritten. Verify output in `verify_ran` events and in dead and regressed markers carries the same paths. Under this design a raw path would become a worktree path that differs per machine and per change, and it would enter the repository for good. Tool summaries and verify output must be relativized to the root of the tree the task runs in, at write time. Append-only survives; nothing is rewritten afterwards.

3. **Neither the model nor the osq version is recorded anywhere in `.run/`.** The `started` event carries `pid` and `timeoutSeconds`. Trailers need harness, model and version, and so does regeneration. Add `harness`, `model` and `osqVersion` to the `started` event's data. Every trailer is then derived from a file, as the constraint requires.

4. **Nothing stops the coding agent from running git.** `osq-coder.md` allows `bash` without restriction. An agent that runs `git stash`, `git checkout` or `git commit` breaks every invariant below. This ADR's rule reaches agents through the generated block in AGENTS.md, and the executor prompt repeats it. The runner enforces it by comparing a snapshot before spawn and after exit, and treating any difference as a dead task. HEAD alone is not enough, because `git stash` leaves HEAD where it was. Decision 4 says what the snapshot holds.

5. **The brief says the runner already hashes `scope` before spawning.** At `e389210` it hashes the change folder and nothing else. If that landed locally since, it is not needed. Once a task starts from a commit, git is the snapshot and the pre-task state is `HEAD`.

6. **Living specs are generated files, and the merge hazard has a non-git fix.** Archive merges a change's deltas into `openspec/specs/<capability>/spec.md`. Two changes that write the same capability produce two edits to the same file, and a human resolving a conflict there by hand produces a spec no delta ever specified. The fix is to never let git merge a living spec. When a branch integrates `main`, osq takes `main`'s copy and re-applies the change's own deltas. The first version called that deterministic, and it is, but under OpenSpec a MODIFIED requirement replaces the whole block. If `main` modified the same requirement after the branch was cut, re-applying would silently undo that edit. So re-applying runs only when every requirement the deltas modify, remove or rename is unchanged on `main` since `Osq-Base`. Otherwise the sync stops. Decision 5.

7. **A verified task is not a green tree.** The result for 011 task 1 records that its verify passed while four suites outside its scope were red. That is by design, since `verify` is scoped, but it means a per-task commit is a checkpoint and not a releasable state. CI cannot gate per task, and the design does not ask it to. Decision 9.

8. **Number allocation scans one checkout.** At `e389210`, `getNextSpecNumber` scanned `specs/` and `specs/archive/` in one checkout. Once approved changes live on branches, a number allocated in the checkout can collide with one on an unmerged branch. Committed drafts narrow this in mode A. Mode B intake must still include `osq/*` branches in the scan, and branch creation failing on an existing name is the tiebreak.

9. **"Archived" needs two meanings, and the brief is right to ask.** On a branch, archived means every task verified and the deltas merged into the living specs. On `main`, archived means shipped. Only the second is what "always true of main" in README.md refers to. A rejected PR leaves nothing on `main`, and that is correct.

10. **The one-commit-per-change convention on `main` stays.** Eight of the first fifteen archives landed under an `osq: NNN` subject; the others under `feat(...)`, `spec(...)` and `test(...)`. The convention is younger than the repository. It is still the right shape for `main`, because a change is the unit that leaves `main` green, so this design keeps it and makes it automatic.

## Decisions

Each decision says what osq does, what I rejected and why, and what it costs in each mode.

### 1. A commit per verified task on the branch, one squash commit per change on main

Every commit osq makes on a change branch records either a state the watcher itself verified or a records-only change under `.run/`. There are five kinds, all with the subject prefix `osq: <id>`.

| Event | Subject | Contents |
|---|---|---|
| approval | `osq: 012 approved` | the draft folder, `.run/approved`, `.run/base`, `.run/approver` |
| task verified | `osq: 012 task 3 verified` | scope edits, `.run/done/3`, `results/3.md`, `events/3.jsonl`, the tick in `tasks.md` |
| task dead | `osq: 012 task 3 dead, reason verify_red` | `.run/dead/3.md`, `.run/dead/3.patch`, `events/3.jsonl`. No code. |
| sync | `osq: 012 sync main` | a merge commit from `main`, living specs re-derived |
| archive | `osq: 012 archived` | folder moved to the archive, living specs with the deltas merged |

The body of a task commit is the task title and the outcome line from `formatTaskOutcomeLine` in word form, for example `[verified] task 3 verified (elapsed: 147s)`. Trailers follow, in the form `git interpret-trailers` reads.

```
Osq-Change: 012-observability-fixes
Osq-Task: 3
Osq-Model: opencode deepseek/deepseek-flash
Osq-Version: 0.1.0
```

Landing on `main` is one squash commit with today's subject, `osq: 012 observability fixes`, built from the folder name. Its body is the spec's `## Goal`, one outcome line per task, and the trailer block. This is the commit that survives, so it carries everything needed to find the rest.

```
Osq-Change: 012-observability-fixes
Osq-Base: 8463d9c...        the commit the branch was cut from
Osq-Head: 3fa1b2c...        the archive commit on the branch
Osq-Approved: sha256:2606...
Osq-Approved-By: Mathias <mathias@example.org>
Osq-Model: opencode deepseek/deepseek-flash
Osq-Version: 0.1.0
```

`Osq-Base` and `Osq-Head` are the two hashes a squash would otherwise lose. `Osq-Base` is also written to `.run/base` at approval, because regeneration by a different model needs the starting tree and must not depend on a ref surviving. When tasks used different models, `Osq-Model` repeats once per model; the per-task mapping is in `events/`. In mode B the body also carries `Closes #123` as a plain line, the form GitHub's keyword matching recognises.

Commits a human makes on the branch are allowed in mode A. The squash body lists their subjects under `Manual commits`, and `osq check` reports them, so the record says what happened.

Rejected. One commit per change only, made at archive. It throws away the one thing git is good at here, which is putting a dead task's edits back, and everything in decision 4 gets harder without a commit per verified state.

Rejected. Merge commits or rebase-merge onto `main` so task commits survive there. It changes the shape of `main` from one commit per change to six, `git bisect` lands on trees where out-of-scope suites are red, and task-level diffs on `main` are worth little because regeneration needs specs and the final tree, not the original patches. Task commits stay reachable on the branch for as long as the branch or the PR exists, and osq never deletes either.

Mode A. `git log` on the branch is the task-by-task record while the change runs. `main` looks exactly as it does today. The human never types a commit message for osq's work again.

Mode B. Every push is a verified checkpoint, so the PR can be read mid-run, and a crash never loses more than the task in flight.

### 2. One branch per change, cut from a commit, holding the draft from its first commit

The branch is `osq/<folder name>`, so `osq/012-observability-fixes`. The prefix lets branch protection and cleanup rules target every osq branch at once, and the rest is derivable from the folder name, so nothing needs remembering. The branch is cut from a commit, never from a working tree. In mode A that is `HEAD` of the checkout where `osq approve` runs, or a dependency's archive commit, as stacking below says. In mode B it is `origin/main` after a fetch.

`osq approve 012` is the moment the folder changes owner. Approve lints and hashes the draft in the checkout as today, whether it is committed or not. It cuts the branch, creates the worktree, and copies the folder into it. It then writes `.run/approved`, `.run/base` and `.run/approver` in the worktree, and commits the folder and those files as the branch's first commit. It writes nothing to the checkout and deletes nothing.

The checkout keeps its copy of the folder. From approval on, that copy is a record of what was approved, not the live spec. The resolver in decision 11 reports the change as running and prints its worktree path, so `osq status` never calls a running change a draft. When the checkout's copy stops matching the approved hash, status warns that edits there never reach the run. Spec edits during a run happen in the worktree, under decision 4's `spec_conflict` path.

A hand landing leaves that copy behind. `git merge --squash` does not refuse over it, because the branch adds the folder and later moves it into the archive, so the squash touches only the archive path. After the change lands, `osq status` flags a leftover copy whose hash matches the approved one and prints the command that removes it. `osq land` removes it itself.

Approve refuses when the checkout's `HEAD` is not on the default branch, because the squash in decision 7 would carry that branch's own commits into `main`. `--base-ok` overrides it for the times that is meant.

If uncommitted changes in the checkout intersect any task's `scope`, approve refuses and names the files, because the spec was written against a tree the agent will not see. `--ignore-dirty` overrides that. Whether the WIP matters is judgement, and judgement belongs to the human.

Stacking. A change whose `depends_on` names a change that is approved but has not landed waits until that dependency's archive commit exists, and its branch is then cut from that commit. Its worktree holds the dependency's archive, so `deriveSpecState` sees the dependency done without any change. A chain approved at once runs without a human, as it does today. A stacked dependent lands after its dependency; decision 7's landing refuses it before. Its squash repeats changes `main` already has from the dependency's squash, and git merges identical changes without conflict. When the dependency changes or is rejected before it lands, the dependent halts, and the human approves it again on the new base.

`.run/approver` is one line: the committer identity from `git config` in mode A, the tracker actor such as `github:matteeh` in mode B.

In mode B the branch is cut at intake instead, because osq creates the folder in the first place and no other tree exists. Approval by label then commits `.run/approved` onto the existing branch. Same branch, same first-commit contents, different clock.

Rejected. Requiring the draft to be committed in the checkout before approval, the first revision of this decision. It gave `main` a spec commit per change as a record that the plan came first, at the price of one more step in every approval. The branch's first commit is the same record, and the squash carries the spec.

Rejected. Deleting the draft from the checkout at approval, the first version of this decision. It avoided two copies of the folder, but it was the one write to the human's checkout outside `osq land`, and "osq never writes the checkout" is easier to trust without an exception. The resolver handles the second copy instead.

Rejected. Approval refusing a dependent until its dependency lands. It is the simplest rule, but it turns every chain into approve, run, land, approve, where today a chain runs unattended.

Rejected. Branching at draft time, with `osq new` creating the branch. Drafts are cheap and often abandoned, and mode A drafting happens in the editor next to the checkout, where the smart-model conversation is. Approval is the point of commitment, so it is the point of branching.

Rejected. Naming branches by issue number, date or model. None of those are derivable from the folder, and the folder name is already unique.

Mode A. The developer's dirty checkout is irrelevant to what the agent sees, which is the point. The price is a copy of the folder that no longer drives anything, and a leftover to remove after a hand landing.

Mode B. There is no developer checkout, so the "dirty checkout" question has no subject. The clone osq runs in is osq's alone.

### 3. The watcher always runs in a worktree

Even at concurrency one. A design that touches the live tree at one and a worktree at two is two designs, and the three hazards at the top of the brief all live in the live tree. Each active change has one worktree at `~/.osq/worktrees/<repo>/<folder>`, configurable as `vcs.worktreeRoot`. It sits outside the repository so nothing that walks the tree sees it, whether `tsc`, `biome`, the test runner or `rg`, and outside the parent directory so it does not litter. `~/.osq/` is already the location README.md reserves for derived osq data. `osq status` prints the path so the human can open it in an editor.

`git worktree add` does not bring `node_modules`, so a task's verify would fail in a fresh worktree. `vcs.prepare` is a command osq runs once after creating a worktree, `pnpm install --frozen-lockfile` here. Measured in this repository, it takes about a second, because pnpm links files from its store. It is optional. `doctor` warns when the repository has a lockfile and no prepare command. Ignored files such as `node_modules/` and `dist/` persist in the worktree across tasks because osq never runs `git clean -x`.

Before every spawn the worktree must be clean outside the active change's `.run/`, meaning `git status --porcelain` shows nothing else that is not ignored, and it must be on its branch. The watcher appends events under `.run/` throughout a task, and those files are committed with the task, so they cannot count as dirt. Anything else stops the change with a message naming the files. There is one exception, the crash case in decision 4.

The worktree is osq's while a task runs. `osq status` prints its path with a warning not to edit it until the task ends, because an edit there during a task is a `scope_violation` and dies with it. Nothing is lost when that happens: every dead path writes the patch before it discards anything, so the edit comes back with `git apply`.

The clean-tree rule binds osq as well as the agent. Anything osq runs in the worktree after the agent exits, whether verify, a focused test run or a mutation check, writes only under `.run/` or to ignored paths. A step that leaves other files behind is a configuration bug, and the next spawn stops on it by name. `OSQ_CHANGE` in every verify environment points at the change folder inside the worktree.

What mode A loses. The agent's edits do not appear in the checkout the editor has open; the developer opens the worktree instead, or reads the branch. Uncommitted human work is never the agent's starting point, which is a loss only if you wanted it to be. A worktree costs a dependency install, about a second here, and disk per change. Landing is a merge instead of a commit in place. I think all four are acceptable, and the first two are the reason to do this at all. Verify also gets stricter for free, because it can no longer pass thanks to a file the human happened to have uncommitted.

Rejected. Live tree at concurrency one, worktrees later. See above.

Rejected. One osq workspace, a single worktree on one branch that runs every change in approval order. It needs one install and a simpler resolver, but a single branch cannot give each change a contiguous range of commits unless it runs strictly one after another. A dead change would then stall every independent change behind it, where today they keep running. Every later change would also depend on every earlier one: landing out of order silently squashes the earlier changes in too, and rejecting a change affects everything after it. The workspace would go stale against `main` until a sync exists. Its path to a PR per change needs stacked PRs, which need rebasing after each squash merge, and decision 8 forbids that. Stacking in decision 2 gives the same lanes with a branch per change.

Rejected. Stashing the human's changes around each task. It writes to the human's state, it races with the editor, and `git stash` can fail half way.

Rejected. Copying the repository instead of a worktree. It loses the object store, so every commit and diff below would need reinventing.

Rejected. A container or sandbox instead of a worktree. Orthogonal. A sandbox still needs a worktree inside it, and README.md already lists confinement separately.

Mode B. There is no other tree, so the worktree is where the change lives. Concurrency above one later is a scheduler change and nothing else.

### 4. A dead task leaves the branch at the last verified state

When a task dies for any reason, osq first captures the working tree's diff against `HEAD`, untracked files included, into `.run/dead/<n>.patch`. It builds the patch through a temporary index, so the real index is never touched. Only then does it discard every change outside the change folder and commit the dead record. The branch tip is again a state the watcher verified, or the approval state. The patch is the inspection copy; `git apply` restores it in seconds. `dead/<n>.md` keeps its reason and diagnostics as today.

`spec_conflict` follows the same path with one difference. The edits to the change folder that caused it are the human's, not the agent's, so osq does not discard them. It records the dead task, commits `.run/` only, and leaves the folder edits uncommitted. The next cycle finds a dirty worktree not explained by a running task and stops with "spec edited after approval, re-approve or discard". Re-approval is `osq approve 012` run against the worktree, and it commits the edits with the new hash exactly as the first approval did. In mode B the folder can only change through someone pushing to the branch, and the remote check in decision 8 stops the change before any task runs.

Two new dead reasons fall out of having a snapshot.

`vcs_violation` means the agent ran git. Before spawn and after exit the runner records HEAD's commit and the branch it points to, a digest of the index, and the stash entries made on the worktree's branch. Any difference is a violation. HEAD alone misses `git stash`, which moves nothing but can make the agent's work vanish before verify. The snapshot is scoped to the task's own tree on purpose. Refs are shared across worktrees, so the human committing on `main`, stashing in their checkout, or an editor fetching in the background all move refs that are not the task's, and none of them is a violation. `git checkout -- <file>` changes no ref; it is an edit like any other and falls under the scope check.

`scope_violation` means `git status` after the agent exits lists a file changed during the task outside `scope` and outside `.run/results/<n>.md`. README.md lists this reason as needing a sandbox; detection needs only git, enforcement still needs the sandbox.

Both are dead tasks, both get the patch, and neither passes even if verify would have been green, because a tree produced by protocol violations is not what was approved.

Stage 0 runs these checks in the live tree the human is editing, so they behave differently there. Both are recorded as events with a warning and neither kills the task. The `vcs_violation` warning says what moved and how to put it back, because the human committing, staging or stashing in that checkout during a task trips it as surely as the agent does. `scope_violation` would trip whenever a human saves a file in the editor. Both kill from stage 1, when the tree is osq's alone.

A crash mid-task is already a dead task today. `reapStaleLocks` writes `dead/<n>.md` with `crashed` or `timeout`, and the git dead path runs from that call site as well as from the runner. A watcher restart therefore finds a dirty worktree, sees a dead marker with no commit for it, records the patch, discards, commits, and proceeds. That is the one case where dirt is discarded without a human, and the patch still holds all of it.

Rejected. Leaving the edits in the worktree for inspection. Mode B has nobody to inspect, the next task cannot start on a dirty tree, and the state is not derivable from files.

Rejected. Committing the failed attempt on the branch as a marked WIP, or as a commit followed by a revert. The squash hides it anyway, the patch under `.run/` is the same information in the provenance record where it belongs, and "every commit on an osq branch is a verified state" is worth keeping simple.

Rejected. Pushing failed attempts to a side ref such as `refs/osq/dead/012/3`. Invisible to file-based state and to every human tool.

Rejected. Snapshotting every ref. It would catch an agent creating a branch, but it would also kill tasks whenever the human commits or an editor fetches, because refs are shared across worktrees.

Mode A. `osq show 012` gets a patch to display next to the dead marker.

Mode B. The PR shows the dead record and the change halts. Nothing is lost, and nothing needs a human to make the branch sane again.

### 5. Integrating main is a merge into the branch, and living specs are re-derived rather than merged

osq never rebases and never rewrites a commit it has made. When a branch has to take in `main`, osq merges `main` into the branch as a new commit, `osq: 012 sync main`. It does this at three points: before the first task, so the agent starts from current code, except for a stacked dependent whose dependency has not landed, which starts from its dependency's archive commit; before archive, so the archive's living specs are computed against current `main`; and on request, which is `osq sync 012` in mode A and a PR reported as not mergeable in mode B. A sync is a no-op when `main` is already an ancestor of the branch tip. A blocked change is re-derived after a sync, which is how a dependency that landed on `main` unblocks it.

Living specs are outputs, not sources. During a sync, osq never keeps git's merge of a file under `openspec/specs/`, conflicted or not. It takes `main`'s version and re-applies this change's own deltas with the same merge archive uses, so the result is what archive would have produced against current `main`. Before re-applying, osq compares every requirement the deltas modify, remove or rename between `Osq-Base` and `main`. If `main` changed any of them, the sync stops and names them. Re-applying there would replace `main`'s version of a requirement with one written against the old version, which is a lost update, not a merge. Added requirements need no check. A conflict in any file outside `openspec/specs/` stops the sync too. osq aborts the merge, leaves the branch exactly as it was, and reports the conflicting paths. Code conflicts need judgement.

After a clean sync osq re-runs the verify command of every task already done, in the worktree, before committing the merge. Verify passed on the old base; nobody has verified the merged tree. If any verify fails, osq aborts the merge and stops. This is the only place osq runs verify more than once per task, and it is bounded by the number of done tasks.

Concurrency above one adds prevention. osq does not start a task whose `scope` intersects the `scope` of a task running in another worktree, and queues the change instead. Two branches with disjoint scopes cannot textually conflict except through generated files, and generated files are handled above. The violation snapshot in decision 4 already ignores refs that are not the task's, so other changes' commits never trip it. Verify runs that share ports, a database or temp files would collide, so osq hands each worktree its own through environment variables, the way it sets `OSQ_CHANGE`, and `vcs.prepare` sets them up.

What osq refuses to do automatically. Resolve any conflict outside `openspec/specs/`. Re-apply a delta over a requirement `main` has changed. Rebase. Force-push. Merge into `main` in mode B. Land a branch whose squash conflicts, in mode A. Continue after a failed re-verify.

Rejected. Rebasing the branch onto `main`. It rewrites pushed commits, invalidates `Osq-Base` in every trailer, and a rebased branch is no longer the tree the watcher verified at each step.

Rejected. Letting git merge living specs and fixing the result in the archive commit. The intermediate conflict still needs a human, and a spec merged by hand is a spec no delta specified.

Stacking is decision 2's. A stacked dependent needs no sync of its own while its dependency is unlanded. Once the dependency lands, the dependent's next sync takes a `main` that holds the dependency's squash, and git merges the identical changes cleanly. The first revision rejected stacking because a worktree cut from `main` never sees an unlanded dependency done. Cutting from the dependency's archive commit removes that objection.

Mode A. `main` is the developer's local `main`; the watcher does not fetch. A conflict or a changed requirement is a message and a stopped change.

Mode B. `main` is `origin/main` after a fetch by the headless driver. A stopped sync is a comment on the PR and a label, and the change waits.

### 6. Delivery in mode B is one PR per change, opened as a draft when the plan is ready for review

The PR is the review surface, so it exists before approval. When the planner has written the folder and pushed the branch, osq opens a draft PR whose title is the squash subject and whose body is generated from `brief.md`, the spec's `## Goal`, and a link to the folder on the branch. Approval by label lands on the PR or on the issue; which one is the tracker adapter's concern. Every later commit is pushed as it is made, and osq regenerates the body after each, appending the outcome lines. Rejection is closing the PR. osq reacts by removing the worktree and doing nothing else; the branch stays until a human or a repository policy deletes it. When osq sees the PR merged, it removes the worktree too.

Archive happens on the branch before merge, as the last commit. It has to, because osq never writes `main`, and because the reviewer and CI need to see the living specs the deltas produce. When the archive commit exists and CI is green on it, osq marks the PR ready for review. A human merges through the platform with squash, or the organisation's auto-merge policy does when its conditions hold. osq does not merge, and does not care which of the two happened.

The body is built only from `brief.md`, the `## Goal` section, the outcome lines, the change id and the model and version trailers, and it ends with the trailer block. That last part matters: a repository whose squash message defaults to the PR title and description carries the trailers into the squash commit with no osq code on `main`'s side, and I would set that default. The body never includes tool summaries, `results/`, `events/`, verify output or paths. Those are all in the repository for anyone with access, but a PR body is notified, indexed and quoted, and it is the one surface the brief called public.

Rejected. Opening the PR at completion. Then the plan needs another place to be read and approved, and a change that halts has no visible artifact at all.

Rejected. Archiving after merge. It requires a commit to `main` by osq, and it puts the living-spec changes outside the reviewed diff.

Rejected. osq merging when CI is green and the label is present. The constraint says a merge, meaning a human or the platform's policy, and an osq that merges is one bug away from writing `main` on its own.

Mode A. No PR is opened. The developer pushes and opens one if they want CI and review, or lands locally under decision 7. `osq message 012` prints the squash message so the trailers survive either way.

Mode B. The PR is where a human meets the change, three times at most: plan approval, a halt, and merge.

### 7. Landing in mode A is a human command

`osq land 012` runs `git merge --squash osq/012-observability-fixes` in the checkout, commits with the generated message, and removes the worktree. It refuses if the checkout has uncommitted changes, if the branch has not archived, if the change is stacked on a dependency that has not landed, or if the squash conflicts, in which case it says to run `osq sync 012` first. It removes the checkout's leftover copy of the draft when its hash matches the approved one. It does not push. It exists so that the trailers land in the trailer block of the surviving commit. A hand-run squash puts them into a "Squashed commit of the following" body where `git interpret-trailers` cannot see them.

`osq message 012` ships first, in stage 1. It prints the squash message with its trailer block and the branch to squash, and writes nothing. For a stacked change whose dependency has not landed, it names the dependency to land first. Until `osq land` exists, a change lands by hand with `git merge --squash osq/012-observability-fixes` followed by `git commit` using that message, and keeps its trailers.

Rejected. Landing automatically when the branch archives. The constraint forbids it, and the human wants to read the diff.

### 8. Identity, signing, and the list of things that never happen

Commits osq makes are authored by a configured bot identity, `vcs.author`, and committed by whoever runs osq: the developer's git identity in mode A, the service account's in mode B. That is what author and committer mean in git, who wrote it and who applied it. The approver is recorded as `Osq-Approved-By`, a trailer with exact semantics, rather than as author or `Co-authored-by`, both of which claim authorship of code the approver did not write. `git blame` therefore says osq, and the trailers on that line's commit lead to the change id, the archive folder, the brief and the issue, which is a better answer to "who do I ask" than a name.

osq never signs and never disables signing. If the environment has `commit.gpgsign` set, the committer's key signs osq's commits. In mode B a signing setup that cannot run unattended is a `doctor` failure. Squash commits made through GitHub's merge button are signed by GitHub.

The same goes for hooks. osq runs the repository's commit hooks and never passes `--no-verify`, because skipping them bypasses the repository's own policy the way disabling signing would. A commit that fails, whether from a hook, signing, or anything else, halts the change with git's output and is not retried. Commits have their own timeout, `timeouts.gitCommitSeconds`, longer than the one for reads, because hooks and signing are slow. With `vcs.enabled`, `doctor` warns when the repository has commit hooks or sets `commit.gpgsign`. A hook that reformats files could make the committed tree differ from the verified one. Comparing the two waits until a repository with such a hook needs it.

Things osq never does, in any mode, and the `Vcs` interface cannot express:

- force-push, with or without lease
- rebase, amend, reset of a pushed commit, `filter-branch`, or any other rewrite
- write to `main`, except `osq land` run by a human in mode A
- push to a branch whose remote tip is not the local tip; if the remote moved, stop and report
- modify anything in the archive, except adding a new folder in an archive commit
- delete a branch, a tag, or a worktree that has uncommitted work
- `git clean -x`, `git stash`, or any write to the human's checkout other than `osq land`

`osq check` fails when an archive folder's contents no longer match its `.run/approved` hash, which catches edits in the archive in CI whether osq or a human made them.

### 9. CI is the second gate, and it gates delivery rather than archive

In mode B the branch CI runs the project's full verify, `pnpm verify` here, plus `osq check`. `osq check` verifies what the watcher cannot see about itself: every archive folder still matches its approved hash, the branch's archive commit reproduces its living specs from the parent's specs plus the deltas, `.run/done/` and `tasks.md` agree, and it reports commits on the branch that carry no osq trailers and are not sync merges. The independence comes from a different machine, the full suite instead of scoped verifies, and a checker that reads the record instead of writing it.

Green CI on the archive commit is the precondition for marking the PR ready. It is not a precondition for the archive commit itself. Archive stays what it is today, a consequence of every task having a `done` marker, derived from files. Making it depend on a remote check would put remote state into state derivation.

Per-task CI results are informational. Pushback item 7 explains why: a verified task is not a green tree. The workflow may skip draft PRs on `osq/*` branches to save runners, or run and be ignored. When CI is red on the archive commit, osq does not retry, does not spawn an agent to fix it, and does not archive again. It comments and stops. Red CI after green verify means the verify commands are incomplete or the environment differs, and both are spec problems for a human.

Rejected. Waiting for CI after each task before starting the next. It couples the watcher to remote latency and gates on a signal that is expected to be red mid-change.

Rejected. CI as a precondition for archive. See above.

Rejected. Re-running the task verifies in CI instead of the full suite. The full suite subsumes them and is what "leaves main green" means.

Mode A. CI is whatever the repository does when the developer pushes. osq does not wait for it.

Mode B. The PR is ready when CI says the tree is green and `osq check` says the record is intact.

### 10. Where the code lives

`src/core/vcs/` holds a `Vcs` interface, a `GitVcs` that spawns the `git` binary with `child_process` and a fixed `cwd`, and a `NoVcs`. It is owned by the `version-control` capability, following the capability-folder rule in AGENTS.md. The rest of `src/core/` and `src/watcher/` depend on the interface only; one selection function in `src/core/vcs/` is the only module that imports `GitVcs` or `NoVcs`. It wires `GitVcs` when `vcs.enabled` is true and `doctor` finds git, else `NoVcs`. Stage 0 selects `GitVcs` for its read-only checks whenever git runs and the project root is the repository's top level, because those checks write nothing. Network operations are a separate interface, `Remote`, that only the headless driver depends on, so "core never touches the network" stays true by construction rather than by review. PR and label operations are not git and live in `src/tracker/`, also headless-only.

The full `Vcs`, nineteen local operations and three remote ones. Each stage adds only the operations it uses, and stage 0 has only the reads its checks need.

```ts
interface Vcs {
  root(cwd): Promise<string>;                 // rev-parse --show-toplevel
  head(cwd): Promise<{ sha: string; branch: string | null }>; // rev-parse HEAD, symbolic-ref
  indexDigest(cwd): Promise<string>;          // a hash of ls-files --stage
  stashList(cwd): Promise<Stash[]>;           // stash list, with the branch each was made on
  defaultBranch(): Promise<string>;           // origin/HEAD, else vcs.defaultBranch
  status(cwd, paths?): Promise<Entry[]>;      // status --porcelain -z, untracked in, ignored out
  listBranches(prefix): Promise<string[]>;
  createBranch(name, base): Promise<void>;    // fails if it exists
  worktreeAdd(path, branch): Promise<void>;
  worktreeRemove(path): Promise<void>;        // refuses when dirty
  worktreeList(): Promise<Worktree[]>;
  commit(cwd, paths, message, author): Promise<string>;   // add + commit, returns the sha
  discard(cwd, paths): Promise<void>;         // checkout HEAD -- paths; clean -fd -- paths
  diff(cwd, from, to?, paths?): Promise<string>;
  show(ref, path): Promise<string>;           // one file at one ref, for check and sync
  merge(cwd, ref, squash?): Promise<{ status: 'clean' | 'conflict'; conflicts: string[] }>;
  mergeAbort(cwd): Promise<void>;
  isAncestor(a, b): Promise<boolean>;
  log(cwd, range, paths?): Promise<Commit[]>; // subjects and trailers
}

interface Remote {
  fetch(remote, ref): Promise<void>;
  push(remote, branch): Promise<void>;        // fast-forward only; there is no force parameter
  remoteHead(remote, branch): Promise<string>;// ls-remote
}
```

None of these can rewrite history. `NoVcs` makes approve write `.run/approved` in place, runs tasks in the live tree, and turns every other operation into a no-op that says so. It is today's behaviour, kept for repositories without git and for the test fixture, and it keeps today's hazards. `doctor` refuses mode B without git.

Rejected. A git library such as isomorphic-git or nodegit. A new runtime dependency, and the binary is on every machine that has a repository.

Rejected. Putting `push` on `Vcs`. Then the watcher can push, and the network constraint becomes a code review question instead of a type.

Rejected. A top-level `src/vcs/` beside `src/harness/`, the first version of this decision. It would be a second exception to the capability-folder rule, and later stages' sync, land and check fit a capability of their own better than an adapter folder.

### 11. State derivation across worktrees

One resolver answers which changes are running, or archived but not landed, and where each one's folder is. The readers of that state ask it: the watcher loop, status and its next step, inbox, show, report and recent disclosures, the queue, serve, doctor, the baseline search, and the lifecycle commands `approve`, `retry`, `reject`, `done` and `verified`, which write their markers where the change runs. Readers of drafts keep reading the checkout on purpose, because drafts live there: `new`, `lint`, `plan` and `migrate`. Under `GitVcs` with `vcs.enabled`, the running changes are the osq worktrees from `git worktree list`. Under `NoVcs` they are what they are today. The resolver lands first, with today's behaviour, so switching to worktrees later changes one module instead of every reader.

A missing worktree is recreated: `osq watch` recreates the worktree when it finds an `osq/*` branch whose folder has `.run/approved` and lacks a `done` marker for some task. The watcher cycle iterates worktrees instead of change folders and passes the worktree path as `projectRoot`, which `runTask`, the archiver and the adapters already take as a parameter. `deriveSpecState` itself does not change.

The checkout keeps a copy of every running change, so a folder is a draft only when the resolver has no worktree or branch for it. Inside an osq worktree, the active change is the one its branch names, `osq/<folder>`. The traceability helper finds it that way when `OSQ_CHANGE` is unset, as when a developer runs tests by hand in a worktree. It reads the worktree's `.git` file and the `HEAD` file it points to, and never spawns git, because the helper runs inside every test process.

`osq status` in a checkout lists drafts, then running changes with their worktree paths, the don't-edit warning while a task runs, and a warning for any checkout copy edited since approval, then leftover copies of landed changes with the command that removes them.

In mode A, `osq new` allocates the next number from the change folders and the archive, as today. The checkout keeps a copy of every approved change until it lands, so no number an osq branch holds is free there. Mode B has no checkout copies, so its intake also scans every `osq/*` branch, local and remote. If two intakes race to the same number, the second `createBranch` fails and the intake retries with the next.

### 12. Migration

Nothing is rewritten. The existing archives keep their contents and their commits. `osq check` treats an archive folder with no `.run/base` as legacy: it verifies the hash and skips the commit-linkage checks. Every change of stage 1 runs under the old flow with `vcs.enabled` off, in the live tree, and is landed by hand. The flag turns on for the change after the stage, and from then on `main`'s history has the same shape and the branches exist.

Repository changes. A `vcs` block in `osq.config.ts` with `enabled`, `author`, `worktreeRoot`, `prepare` and `defaultBranch`, each added in the stage that first uses it. This ADR's frontmatter, whose rule reaches the generated block in AGENTS.md, and one line in the executor prompt. `.github/workflows/ci.yml` gains `osq check` and a draft-PR condition. README.md's "Not yet" loses the worktree and `scope_violation` entries and keeps the sandbox for enforcement, since detection is now covered. Recheck ADR 002 against OpenSpec's delta semantics; decision 5 assumes a MODIFIED requirement replaces the whole block.

## Stages

The decisions land in stages, and each stage runs on real changes before the next brief is written. Stages 2 to 4 are provisional: what they say here is the current intent, and each is settled only when its brief is written against the code the earlier stages left behind.

- **Stage 0, read-only.** Brief `4.1-git-stage-0.md`. The read operations of `Vcs`, `GitVcs` and `NoVcs`, git in `doctor`, this ADR's rule reaching agents, `vcs_violation` and `scope_violation` recorded without killing, verify output and the `archived` event's path relativized at write time. Pushback items 2 and 4, and the detection half of decision 4. Tool summaries and the `started` event's `harness`, `model` and `osqVersion` had already landed before stage 0, which closes pushback item 3.
- **Stage 1, a worktree per change.** Brief `4.2-git-stage-1-parent.md`, behind `vcs.enabled`. The resolver first, then decisions 1 on the branch side, 2 with stacking, 3, 4 and 11, the write operations of decision 10, the hook rule of decision 8, `vcs_violation` and `scope_violation` killing the task, and `osq message` from decision 7.
- **Stage 2, integration. Provisional.** Decision 5's sync with its requirement check, and `osq land`.
- **Stage 3, concurrency above one. Provisional.** Decision 5's scope prevention and per-worktree resources, scheduled by the watcher.
- **Stage 4, mode B. Provisional.** Decisions 6 and 9, `Remote`, and the tracker adapter.

## Consequences

| | Mode A | Mode B |
|---|---|---|
| where the agent works | a worktree under `~/.osq/`, never the checkout | a worktree in osq's own clone |
| who commits on the branch | osq, author `vcs.author`, committer the developer | osq, committer the service account |
| who touches `main` | the human, via `osq land` or their own merge | the platform's merge, human or policy |
| the draft in the checkout | stays as a record; status shows the change running, warns if the copy is edited, and flags a leftover copy after a hand landing | not applicable |
| what a dead task leaves | a clean branch tip and `.run/dead/<n>.patch` | the same, plus a PR comment |
| conflicts with `main` | `osq sync` re-derives living specs, stops on code or on a requirement `main` changed | automatic sync on "not mergeable", with the same stops |
| what the human loses | live edits in the editor's checkout, dirty-tree starts | not applicable |
| what the human gains | no hand commits, dead tasks put back, a verify that cannot be fooled by uncommitted files | a change goes from label to PR with nobody present |
| network | none; the watcher uses local `main` | fetch, push and the tracker API, all outside core |

## Open questions

1. Settled: the worktree location is `~/.osq/worktrees/<repo>/<folder>`, configurable as `vcs.worktreeRoot`.
2. Settled: `osq plan --brief` keeps the brief in the change folder as `brief.md`, and approve hashes it, so decision 6's PR body has one.
3. Whether re-approval after a dead task should clear the dead marker. Today the runner unlinks it on the next success and nothing else does, so decision 4 describes re-approval as "commit whatever `.run/` files changed" without settling that.
