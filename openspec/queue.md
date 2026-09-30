# osq queue

The remaining work on osq itself, as an osq brief queue.

Each item's body becomes that change's `brief.md` word for word. Drive the run with `osq plan --next`, then plan the change in a Claude Code session, review it, and `osq approve`.

Stage 1 of `decisions/003-git-strategy.md` is complete, and change 100 turned `vcs.enabled` on for this repository. From change 101, osq's changes run in worktrees and are approved on `main`. From change 107, they land with `osq land <id>`.

Stage 2 was three items, queued on 2026-09-27 after landing 101 and 102 by hand needed a hand-resolved conflict in a living spec. `archived-once` landed as 104 and `osq-land` as 107; `osq-sync` remains.

The inbox dispatcher landed as changes 097 to 101. Capabilities were three items: `capability-relations`, `capability-sidecar` and `capability-graph` landed as 102, 105 and 106. The graph view that draws 106's data is not queued yet.

On 2026-09-28 the Notion roadmap page "osq opus planner roadmap based on current state" set the direction that ADR 006 records: osq is the deterministic core, AI does the judgement inside osq's gates, and a human only steers a planning session or taps a decision. Its first milestone, nothing needs a shell after approval, is queued as `adr-006-deterministic-core`, `deterministic-land`, `osq-sync`, `commands-throw`, `confinement-env`, `approve-owns-draft`, `checks-osq-runs` and `steering-triggers`, plus `docs-digest`, which the second milestone starts from. The later milestones stay in Notion until the first is nearly done, so their briefs are written against the code it leaves behind.

Debt cleanup is three items, queued on 2026-09-28: `test-path-meanings`, `traceability-opt-in-once`, and `retire-source-comments`. None depends on stage 2, and none changes what a user sees except `retire-source-comments`, which removes comments from living specs.

Planning cost is three items, queued on 2026-09-29 after recovering 113 took a planner through a 306 KB regressed report and 250 lint warnings: `lint-own-findings`, `regressed-report-short`, and `planner-reads-requirements`. Each cuts what an agent reads on every change.

`approve-after-halt`, queued on 2026-09-29, fixes three bugs that blocked approving 115 and 116 that day. `stale-build-every-pass`, queued the same day after the third stale-build incident, follows it. Both come before the planning cost items.

`ci-temp-repo-cleanup`, queued on 2026-09-30, is urgent: CI on `main` fails in test cleanup on the runner. It comes right after `approve-owns-draft`.

osq reads only the `## [slug]` items below. Everything above the first item is for people.

## [result-none-sections] A result section that says only None counts as empty, however it is written

Depends on: nothing

### Goal

A result section whose content is "None", written as a bullet, in bold, or followed by a short explanation, counts as empty. A task is never killed as `blocked` by `- None.` under `## Blocked`, and `- None.` under `## Deviated`, `## Missing context`, or `## Outside scope` is never counted as a disclosure.

### Context

- `cleanSection` in `src/core/report/result-sections.ts` treats a section as empty only when its trimmed text is exactly `None`, any case, with an optional period.
- `checkBlocked` in `src/watcher/blocked.ts` fails the task with reason `blocked` when `parseResultSections` returns a non-null `blocked`, and `checkBlockedFirst` runs it before any `verify` (change 078). In a consumer project an executor wrote `- None.` under `## Blocked`, and a task whose tests had all passed died as blocked.
- The same parser feeds `readChangeDisclosures` and `countChangeDisclosures`, so `osq report` and the plan prompt's "Recent executor disclosures" count `- None.` as a real disclosure.
- As of 2026-09-27, osq's own archive holds about 170 one-line result sections: 102 are `None.`, 40 are `- None.`, about 12 are `None` followed by `;` or `.` and an explanation (`None; the task is complete.`), and a few start with `Nothing`. No section is `N/A`.
- The executor protocol already says to leave out empty headings. Executors still write them about a quarter of the time.

### Requirements

- A section counts as empty when, after removing a leading list marker (`-`, `*`, `+`, or `1.`) and surrounding emphasis (`*`, `**`, `_`), its text is the word `None`, any case, alone or followed by `.`, `;`, `,`, or `:` and anything after it.
- `None of the fixtures exist; I need a seed script` stays content: `None` followed by a space and more words is a sentence, not an empty marker.
- This applies to every section `parseResultSections` returns, `Touched` included.
- A task whose `## Blocked` holds `- None.` reaches its `verify` as if the heading were absent.

### Non-goals

- Running `verify` when `## Blocked` holds real content, or finishing a blocked task whose verify passes. `## Blocked` stays the executor's explicit request for a human, checked before verify.
- Other words for nothing (`N/A`, `Nothing`, `Not blocked`). None occurs in the archive's empty sections, and guessing at meaning under `## Blocked` risks swallowing a real need.
- Changing the executor protocol text or the dead marker.

### Notes for planning

- One task: `cleanSection` and its tests in `tests/result-sections.test.ts` or a new test file, plus a `checkBlocked` case through the watcher path that `tests/blocked-exit.test.ts` uses.
- Include the archive's shapes as test cases: `None.`, `- None.`, `* **None**`, `None; the task is complete.`, `None. All acceptance lines are satisfied.`, and the counter-case `None of the fixtures exist; I need a seed script`.
- `osq report`'s disclosure counts for archived changes drop once this lands. Check that no report fixture pins a count that includes a bulleted `None`.

## [archived-once] A landed change counts once, even while its worktree is kept

Depends on: nothing

### Goal

After a change lands by hand, osq counts its archive once. Today the kept worktree still holds the archive, so osq sees two archived changes with the same folder, and `osq queue` fails.

### Context

- On 2026-09-27, after changes 101 and 102 landed by hand on `main` with their worktrees kept under `~/.osq/worktrees/osq/`, `osq queue` failed with `Ambiguous queue association for "inbox-wait-log": multiple archived changes (101-inbox-wait-log, 101-inbox-wait-log)`, from `src/core/status/queue-state.ts`.
- `listChanges` in `src/core/status/change-locations.ts` lists changes from every tree the resolver returns: the checkout and each worktree. A landed change's archive is in both.
- `osq message` reads the archive from the kept worktree (change 095), so the worktree cannot simply be dropped from the resolver.

### Requirements

- When the same archived folder is in the checkout and in a worktree, the resolver lists it once, from the checkout, since the checkout's copy is the landed one.
- `osq queue`, `osq status`, bare `osq`, `osq inbox`, and `osq report` each count such a change once.
- `osq message <id>` still works for a change that has not landed.

### Non-goals

- Removing worktrees. That's `osq-land`.

### Notes for planning

- Reproduce with a real temporary git repo: approve and archive a change in a worktree, squash it onto the default branch by hand, keep the worktree, then read the queue and status.
- Check every caller of `listChanges` and `changeTrees` for its own de-duplication before adding one in the resolver.

## [osq-land] osq land lands an archived change in one command, and living specs never conflict

Depends on: archived-once

### Goal

`osq land <id>` lands a change archived on its `osq/` branch onto the default branch in one command: squash, commit with osq's message, clean up. Two changes that both write the same capability spec land one after the other without a hand-resolved conflict, because osq rebuilds living specs from deltas instead of merging them as text.

### Context

- Today a change lands by hand: `git merge --squash osq/<folder>`, then `osq message <id> | git commit -F -`, then removing the leftover draft `osq status` names. README's "Working with version control on" lists these steps.
- On 2026-09-27, changes 101 and 102 were approved while neither had landed, so both branches were cut from the same `main`. Both appended requirements to `openspec/specs/cli-foundation/spec.md`, and the second squash conflicted. The hand resolution also needed one exact blank line between the two blocks, or `tests/living-specs-delta-equivalence.test.ts` failed.
- Living specs are derived. Archive applies approved deltas deterministically without a model (ADR 002), and a textual merge of a derived file is the wrong tool.
- ADR 003 decision 7 already specifies `osq land`: it squashes, commits with the generated message so the trailers stay in the surviving commit's trailer block, removes the leftover draft when its hash matches the approved one, removes the worktree, never pushes, and refuses when the checkout has uncommitted changes, when the branch has not archived, when the change is stacked on an unlanded dependency, or when the squash conflicts. ADR 003's rule names `osq land` as the only way osq writes `main`.
- `buildSquashMessage` and `osq message` (change 095) build the message.

### Requirements

- `osq land <id>` refuses as ADR 003 decision 7 says, each with a message naming the fix.
- For every living spec the change's archived deltas write, the landed file is the result of applying those deltas, in the change's delta order, to the default branch's current living spec, as archive does. A conflict in such a spec never reaches the human.
- Any other conflict leaves the checkout exactly as it was before `osq land`, never through a history rewrite, and says to run `osq sync <id>`, or to resolve by hand until `osq-sync` lands.
- Before committing, `osq land` runs the change's `verify` on the squashed tree. A red verify leaves the checkout as it was and prints the end of the output.
- The commit's message is what `osq message <id>` prints, trailers intact.
- It removes the leftover draft when its hash matches the approved one, then the worktree. It keeps the branch and does not push.
- README's "Working with version control on" uses `osq land` in place of the hand steps, and keeps the hand steps as the fallback.

### Decide before planning

- Automatic stacking on any unlanded archived change, not only on a `depends_on` change, would also prevent conflicts in code files such as README. ADR 003 rejected one shared workspace because every later change would then depend on every earlier one, and implicit stacking brings that back. Proposed default: no implicit stacking; rebuild specs at land, and let `osq-sync` handle code conflicts.

### Non-goals

- Mode B, pull requests, and pushing.
- Rebasing or rewriting any commit.
- Syncing a branch with `main`. That's `osq-sync`.

### Notes for planning

- Test with real temporary git repos, as `tests/worktree-run.test.ts` does.
- Include the 101 and 102 case as a scenario: two changes cut from the same default branch both add requirements to one capability, and landing both in order gives each living spec what applying both changes' deltas in order gives, with no conflict.
- The command writes the human's checkout, so every refusal is checked before the first write.

## [adr-006-deterministic-core] ADR 006 records that osq is the deterministic core, and its rule reaches every agent

Depends on: nothing

### Goal

`decisions/006-deterministic-core.md` is accepted with the text below. Its rule reaches every planner and executor through the generated rules block in AGENTS.md, and every later brief in this queue can be checked against it.

### Context

As of 2026-09-28:

- The ADR text below was drafted and agreed in a planning session on 2026-09-28. A copy is in Notion, as a child page of "osq opus planner roadmap based on current state".
- `decisions/` holds ADRs 001 to 005. The index in `decisions/README.md` lists 001, 002, 004 and 005, and leaves out 003.
- An accepted ADR whose `applies_to` is `all` reaches agents through the rules block that `writeRulesBlock` in `src/core/foundation/rules-block.ts` writes into AGENTS.md. `osq init` calls it. `checkProjectRules` reports a stale block, and both `osq lint` (through `src/core/spec/decisions-lint.ts`) and `osq doctor` run that check, so adding the ADR without refreshing AGENTS.md fails lint.
- Change 084 added ADR 003 as a human step, and it broke `tests/decisions-read.test.ts`. Adding an ADR belongs in a task, with the tests that pin decisions and the rules block in its scope.

### Requirements

- `decisions/006-deterministic-core.md` holds the text below, with `status: accepted` in place of `proposed` and `Accepted` under `## Status`. Nothing else in it changes.
- AGENTS.md's generated rules block carries ADR 006's rule exactly as `writeRulesBlock` renders it, and `osq lint` and `osq doctor` report no stale block.
- The index in `decisions/README.md` lists 003 and 006.

### Non-goals

- Changing ADR 003. Each later change revises the part of ADR 003 it implements, as ADR 006's "Consequences for ADR 003" says.
- Any code change.

### Notes for planning

- One task. Measure in a scratch worktree which tests pin the decisions folder, its index and the rules block before writing the task's scope. `tests/rules-block.test.ts`, `tests/decisions-lint.test.ts`, `tests/decisions-own.test.ts`, `tests/decisions-read.test.ts` and `tests/init.test.ts` are the first candidates.
- The change probably writes no delta. It names `cli-foundation` in `features.reads`.

### ADR text

```markdown
---
status: proposed
applies_to: all
rule: osq does every deterministic step, AI does judgement inside osq's gates, and a human only steers a planning session or taps a decision; a gate either blocks or is removed.
---
# 006. osq is the deterministic core

Date: 2026-09-28

## Status

Proposed

## Context

osq exists so that AI can build most of an application, and eventually all of a simple one. AI does the large share of the work. osq is the deterministic part of the flow: it holds state, sequences work, runs the gates, and keeps the record. Its strictness is what makes AI's output trustworthy enough to ship.

Today that split leaks in two directions.

- Deterministic work falls on the human. Landing meant typing `git merge --squash osq/<folder> && osq message <id> | git commit -F -`, then removing a leftover draft by hand. Finished worktrees are removed by hand. osq's own `dist` is rebuilt by hand after it lands.
- Judgement work falls on the human at a shell. A stuck task, a blocked task, a code conflict, or a regression each ends in a different set of commands: read a marker, edit the plan in a worktree, approve again, `osq retry`, or merge by hand.

Some human steps also add confidence that is not there. `osq verified --passed` records a human's claim that osq cannot check, and it unblocks dependents. `osq done` marks a task done without the verify gate. Approval flags print and then approve regardless. A warning nobody has to act on is not a gate.

The target is osq on a server, driven from a phone. A step that needs a shell, git, or a build cannot be done from a phone, so every such step is a gap.

## Decision

### 1. Every step has one owner

- **osq** owns every step with one correct result given the files and git: state, sequencing, git, landing, deriving specs, running gates, cleanup, and the record. A human never does these, and neither does a model.
- **AI** owns every step that needs judgement: planning, executing, and later any fixing role. Each AI role has a contract osq checks: what osq gives it, what it may write, and which gates judge its output.
- **The human** owns intent and risk: what to build, and whether it runs, ships, or stops.

When a brief adds a step, it names the step's owner. A deterministic step given to a human is a bug in osq.

### 2. The human steers or taps

The human has two kinds of step, and no others.

- **Steering** is a planning session with the AI planner. Direction, taste, and the hard calls go in here. Simple software needs little of it, and harder software needs more.
- **Tapping** is a single decision: approve, land, reject, or retry. A tap never needs a shell. Before each tap, osq shows the evidence it has: the plan's digest and flags for approve, the gates that ran and what they found for land.

Every human step passes the phone test: it can be done from a phone with what osq shows. The CLI stays, and developers may work in it, but it offers the same decisions and nothing only a shell can do.

### 3. osq records no claim it cannot check

A human's word is never recorded as verification. A check that needs doing after landing is a command osq runs. A check osq cannot run is a note for the human, and nothing waits on it. No command marks a task done without its `verify`.

### 4. A gate blocks, or it goes

A gate either stops the flow when it fails or is removed. A warning is allowed only while its signal is being measured. It becomes blocking once its false positives are known and rare, or it is dropped. Gates are how strictness turns into quality: once AI writes both the code and the tests, osq must tell a real test from one that checks nothing, through the pre-spawn red check, traceability, and mutation checks.

### 5. osq decides when the human steers again

Whether a change needs the human does not depend on someone watching. osq halts a change and asks for steering on a fixed list of triggers:

- a task is stuck, dying twice with the same fingerprint
- an executor reports `blocked`
- a sync finds that a requirement the change rewrites changed on the default branch
- a sync or land hits a code conflict
- archive finds a regression

Every trigger ends the same way. osq records the reason and its evidence, and offers one action: plan it. That opens a planning session with the change, the reason, and the evidence already loaded. The revised plan is linted and comes back as one tap. After approval, the run continues from the last verified state.

A new trigger is added to this list through a spec change. When no trigger fires, the change runs from the approve tap to the land tap with no human in between.

### 6. osq measures how often steering is needed

For simple software most plans should be approved as the planner first proposed them. osq records the change folder's hash when the planner first reports the plan ready and compares it with the approved hash, so the share of plans approved unrevised can be measured.

### 7. The target is a server driven by an app

osq runs on a server that holds its own clone, and the human decides from an app. There is no human checkout there, landing happens on a tap, and GitHub is optional. Server mode gets its own ADR when its brief is written. Local use with a checkout stays supported.

## Consequences for ADR 003

ADR 003 still governs git. These parts of it change, each in the change that implements it:

- Decision 7. Hand landing was a stopgap until `osq land` existed, and it is retired. `osq land` is the only way a change lands, and landing ends complete or leaves nothing changed. The landing change revises decision 7, and decision 8 if the land commit no longer runs commit hooks.
- Decision 2. Keeping the draft in the checkout after approval traded a leftover copy for a simpler trust rule. The copy costs more than expected, so approval may remove it. The rule then reads that osq writes the checkout only through commands the human runs, meaning approve and land.
- Mode B. ADR 003's headless mode assumes GitHub labels and merges. It is one possible server mode, not the only one.

Everything else in ADR 003 stands: agents never run git, osq never rewrites history, living specs are re-derived rather than merged, each change gets its own worktree, and nothing reaches the default branch without a human decision.

## Order of work

1. Deterministic landing: `osq land` builds the land commit from the verified tree and cannot end half-done. The hand path goes.
2. `osq-sync`: branches stay current with the default branch.
3. Remove the unchecked human steps: `osq verified`, `osq done`, and flags that never block.
4. Steering triggers: every trigger in decision 5 ends at "plan it".
5. Stronger gates: reliable signals block.
6. Server mode and the app.

## Rejected

- **Humans confirming what osq cannot check.** It records confidence without evidence, and in this repository it was used twice in 107 changes.
- **Warnings as permanent gates.** A warning needs a human to read it, which defeats the point of a gate.
- **The human noticing when to step in.** It depends on attention, and it does not survive a phone and a server.
- **Headless AI planning now.** Planning is where the human steers. It may come back later, through the app, a tracker, or both, and is not designed here.
- **An AI resolver for every trigger.** A resolver for code conflicts waits until sync data shows conflicts are common and mechanical. Until then, a conflict is a trigger like the others.
```

## [deterministic-land] osq land builds the land commit from the verified tree and cannot end half-done

Depends on: adr-006-deterministic-core

### Goal

`osq land <id>` either lands the change completely or changes nothing. osq builds the land commit from the tree the watcher verified and fast-forwards the default branch to it, so the squash can't conflict in the checkout, a failed commit can't leave a squash staged, and unrelated uncommitted work in the checkout doesn't block a land. The hand-landing path goes, as ADR 006 retires it.

### Context

As of 2026-09-28:

- `landChange` in `src/core/vcs/land.ts` (227 lines, cap 250) runs `git merge --squash` in the checkout through `Vcs.merge(ref, true)`, then `Vcs.commit`. It refuses any modified tracked file (`assertCheckoutClean` in `src/core/vcs/land-checks.ts`), checks again that the default branch hasn't moved (`assertStillLandable`), aborts a squash that conflicts, and when the commit fails it leaves the squash staged and prints `osq message <id> | git commit -F -` or `git reset --merge`.
- When the default branch has moved, `syncWithDefaultBranch` in `src/core/vcs/sync-main.ts` first merges it into the branch in the change's worktree, rebuilds the living specs, and runs verify there. After that the branch contains the default branch, so its tip's tree is exactly the tree to land.
- When the default branch hasn't moved, `landChange` runs the proposal's `verify` again through `runLandVerify`. The archive verification in `src/watcher/archiver.ts` runs every task verify and the change verify before `archiveSpecFolder` applies the deltas, so the spec-merged tree is never verified. That is all the land verify adds today. On 107 it would have been the sixth `pnpm verify`.
- A prototype on 2026-09-28, in a scratch repository: `git commit-tree <branch tip>^{tree} -p <default branch>`, then `git merge --ff-only` in the checkout. It landed with an unrelated modified file and an untracked draft left in place. With a modified file the change also touches, git refused and the default branch didn't move.
- ADR 003 decision 7 describes the squash in the checkout, and decision 8 says osq runs commit hooks. `git commit-tree` runs no hooks.
- README's "Working with version control on" step 5 and the code block above it, the `Land:` line `osq message` prints on stderr, and the staged-squash message all describe landing by hand.

### Requirements

- osq builds the land commit from the branch tip's tree, with the default branch as its only parent, `vcs.author` as its author, and the message `osq message <id>` prints. Building it touches no working tree and no index.
- The checkout moves to the new commit only by a fast-forward. When git refuses because an uncommitted file in the checkout is one the change touches, the default branch stays where it was and osq names the files.
- `osq land` no longer refuses unrelated uncommitted changes in the checkout. It still refuses a checkout that isn't on the default branch.
- If the default branch moves between the sync and the fast-forward, the land stops with the default branch unchanged and says to run `osq land <id>` again.
- The archive runs the change-level `verify` after applying the deltas instead of before, so the archived tree is a verified tree. Task verifies still run before. `osq land` then runs `verify` only when the sync merged new commits.
- The hand-landing path goes: README's step 5 and its code block, the `Land:` line on `osq message`'s stderr, and the staged-squash message. `osq message <id>` still prints the message on stdout.
- ADR 003 decisions 7 and 8 describe the new land: built from the verified tree, fast-forwarded, and the land commit runs no commit hooks.
- While it works, `osq land` says what it is doing. When the default branch has moved, it prints one line before the sync, naming how many commits it is taking in and that it will run the change's `verify`, before it goes quiet.
- The sync and its `verify` leave a record: `osq land` appends events for the sync and for the `verify` it ran, with the command, exit code and duration, to the change's `.run/events/`, as the watcher does for its own verify runs.

### Why the two lines above

Landing 108 on 2026-09-28 took close to a minute and printed nothing. `main` had moved by two commits, so `osq land` merged it into the branch and ran the whole `pnpm verify` on the merged tree before committing, which is right, but it looked stuck. The run left no event either: the timing had to be reconstructed from temporary folders the test suite left in `/tmp`. Once `osq-sync` merges the default branch before archive, and this change skips `verify` when nothing was merged, most lands should be near-instant, and the wait only happens when the default branch moved after archive. When it does happen, it should be visible and recorded.

### Decide before planning

- Whether `git commit-tree` honours `commit.gpgSign` in the git versions osq supports. If it doesn't, osq passes `-S` when the setting is on, because ADR 003 decision 8 says osq never disables signing.
- Whether a red change verify after the delta merge reuses `.run/regressed/change.md` or needs its own reason.

### Non-goals

- Landing without an id, or several changes at once.
- Landing automatically after archive.
- Pushing.
- Removing the leftover-draft handling. `approve-owns-draft` stops creating leftovers.

### Notes for planning

- The squash path, the staged-squash branch and `assertStillLandable` go, so `land.ts` should shrink.
- `tests/vcs-land.test.ts` and `tests/vcs-land-refusals.test.ts` pin the dirty-checkout refusal and the hook message. Measure the fallout in a scratch worktree before writing scope.
- The `Vcs` port gains an operation that builds the commit and one that fast-forwards. Write their signatures in the task, as for any port.
- Change 107 left two duplicates in the code this change rewrites: `outputTail` is defined in both `land-checks.ts` and `sync-main.ts`, and `runLandVerify` in `land-checks.ts` and `runSyncVerify` in `sync-main.ts` are nearly identical. Keep one of each.

## [osq-sync] osq sync and the watcher keep a change's branch current with main

Depends on: deterministic-land

### Goal

A change's branch takes in the default branch before its first task and before archive, and on request with `osq sync <id>`, so its archive is computed against current `main` and its land rarely conflicts.

### Context

- ADR 003 decision 5: osq never rebases; to take in `main`, it merges `main` into the branch as a new commit, `osq: <id> sync main`. It does so before the first task (except a stacked dependent whose dependency has not landed), before archive, and on request. A sync is a no-op when `main` is already an ancestor of the branch tip. A blocked change is re-derived after a sync.
- `osq-land` rebuilds living specs from deltas at land and tells the human to run `osq sync <id>` on any other conflict.
- Change 107 built `syncWithDefaultBranch` in `src/core/vcs/sync-main.ts`, with its requirement check and spec rebuild in `src/core/vcs/sync-specs.ts`. It merges the default branch into the branch in the worktree, stops before re-applying a delta over a requirement the default branch changed, rebuilds living specs with `applyOpenSpecDeltas`, runs `vcs.prepare` and the proposal's `verify`, and commits `osq: <id> sync <default branch>`. Only `osq land` calls it, on an archived change. The watcher's syncs run on active changes.
- `deterministic-land` changes when land and archive verify. Read its archive before planning.

### Requirements

- `osq sync <id>` merges the default branch into the change's branch in its worktree as `osq: <id> sync main`, refusing while a task of the change runs.
- A conflict only in living specs is resolved by rebuilding them from the default branch's specs and the change's deltas, as `osq land` does. Any other conflict aborts the merge, leaves the worktree as it was, and halts the change with a reason that names the conflicting files for a human.
- The watcher syncs before a change's first task and before archive, as ADR 003 decision 5 says.
- `osq status` shows the last sync per change.

### Non-goals

- Mode B.
- Resolving code conflicts automatically.

### Notes for planning

- Test with real temporary git repos, including a stacked dependent whose dependency lands during its run.

## [commands-throw] osq's commands throw a CommandError instead of ending the process

Depends on: nothing

### Goal

Every CLI command reports failure by throwing `CommandError`, with a message and an exit code, and `runCli` prints it and sets the exit code in one place. Any caller can then run a command and carry on: the inbox now, and web actions later. Nothing changes for a person at a terminal.

### Context

As of 2026-09-28:

- 18 `process.exit(` calls sit in 13 files under `src/cli/`: `approve.ts`, `check.ts`, `done.ts`, `inbox.ts`, `new.ts`, `queue.ts`, `reject.ts`, `report.ts`, `retry.ts`, `run.ts`, `show.ts`, `status.ts` and `verified.ts`.
- `approveCommand` relies on exiting for its control flow: with several ids, it moves on to the next only because an error ended the process.
- `runCli` in `src/cli/run.ts` already catches `ConfigLoadError` once, prints it and sets the exit code. `CommandError` follows that pattern.
- Seven tests stub `process.exit`: `approve-confirm`, `plan-approve-next-step`, `verification-record`, `cli-config-errors`, `opencode-v2`, `watcher-preflight` and `watcher-loop-logging`. Not all of them stub it for a command.
- The inbox's card session runs each action as a child process because of these exits (change 099). Each action pays a Node start and a config load, and a card can show only the exit code, not why.
- `landCommand` and `messageCommand` already take injectable `stdout`, `stderr` and `exit`.
- Source: the Notion page "Technical debt 27.09 MUST FIX".

### Requirements

- `src/cli/` exports `CommandError`, which carries a message and an exit code.
- No command under `src/cli/` calls `process.exit`. Each throws `CommandError` where it used to exit, so it stops at the same point.
- `runCli` catches `CommandError`, prints its message to stderr, and sets `process.exitCode`, as it does for `ConfigLoadError`.
- Every command prints the same output and exits with the same code as before.
- Tests that stub `process.exit` for a command expect the thrown error instead.

### Non-goals

- Running inbox actions in the same process. That can follow once each command takes its config and working directory as arguments.
- Changing any command's output or exit codes.

### Notes for planning

- Check which exits in `run.ts` belong to the entry point and stay.
- A refactor: `verify_starts: green` for the command files, and `tests.modify: true` for the tests that stub `process.exit` for a command. Measure the fallout in a scratch worktree first, since other tests may assert on exit behaviour.

## [capability-sidecar] Each capability carries a small osq.yml with its group

Depends on: nothing

### Goal

Each capability can carry a small osq-owned sidecar with metadata the OpenSpec spec format has no place for, starting with `group`. Groups are the outermost level of the graph view, and they group capabilities in `osq report`.

### Context

- Capabilities are folders under `openspec/specs/` with no metadata, and the graph view in `packages/ui` has no grouping.
- At change 049, OpenSpec 1.13.1 validated specs cleanly with an extra YAML file beside `spec.md`, and `openspec list --specs` was unaffected. osq still pins 1.13.1 as of 2026-09-27; recheck.
- `AGENTS.md` states that living capability specs change only when the watcher applies an approved delta.
- `capability-relations` adds `creates` to proposal frontmatter.
- In the inventory ERP, a group maps onto a module, such as an inventory group holding costing, reservations and stock movements.

### Requirements

- `openspec/specs/<capability>/osq.yml` holds `group`, a required string, and `tags`, an optional list. Unknown keys fail lint. A missing sidecar is a lint warning, and so is `group: ungrouped`.
- A capability's description is read from its spec's `## Purpose` and never stored in the sidecar.
- `creates` from `capability-relations` takes a group for each new capability, as `creates: [{ name: <capability>, group: <group> }]`. A bare name is rejected with a message showing the new form. At archive, the archiver writes the new capability's sidecar from that entry, so the sidecar is part of the approved change.
- A change may carry a replacement sidecar at `openspec/changes/<id>/specs/<capability>/osq.yml`, validated at lint and applied at archive.
- `osq migrate` scaffolds a sidecar with `group: ungrouped` for any capability without one, for projects adopting sidecars.
- Only those three paths write sidecars: the archiver for `creates`, the archiver for a replacement in a change, and `osq migrate`.
- The approval manifest records sidecar hashes for touched capabilities.
- `getMetricsReport` reports, under `coverage`, capabilities with and without a sidecar.
- The graph view groups capability lanes by `group`.
- A task in the change writes this repository's sidecars, with the groups below.

### Groups for this repository

| Capability | Group |
|---|---|
| cli-foundation | platform |
| spec-lint-and-approve | planning |
| traceability | planning |
| watcher-and-harness | execution |
| version-control | execution |
| status-inspection | inspection |
| web-inspection | inspection |
| metrics-and-reporting | inspection |

### Surface

- File: `openspec/specs/<capability>/osq.yml`, keys `group` and `tags`.
- Frontmatter: `creates` entries with a group.

### Non-goals

- Statuses, overrides, ownership in the sidecar, or project rule settings.
- Changing the spec or delta format.
- Zoom levels and other graph views. That's `capability-graph`.

### Notes for planning

- Add a test that runs the pinned validator over a fixture with sidecars, so compatibility stays checked across upgrades.
- Tests check behaviour on fixtures and never pin this repository's list of capabilities or groups.

## [capability-graph] The graph view zooms from groups down to functions

Depends on: capability-sidecar

### Goal

The graph view in `packages/ui` shows the whole system as one map you zoom into, and each level shows a different kind of detail: groups and capabilities, then requirements and scenarios, then tests and functions. Every node and edge comes from a link osq already checks, so the map is true. It answers the questions an architect or a new developer asks, such as what an ADR governs or what changing a scenario touches.

### Context

- `packages/ui` has a graph view with capability lanes, grouped by `group` after `capability-sidecar`. `osq serve` serves it. Recheck how the UI receives its data.
- `capability-relations` relates every change to a capability through its deltas and reads, makes creation explicit, and gives one ownership reader.
- `capability-sidecar` gives every capability a `group`.
- `traceability-scenarios` (change 081) gives the scenario index, `buildScenarioIndex` in `src/core/trace/scenario-index.ts`, which maps each scenario to the tests that name it and the functions they cover, and the `@scenario` and `@adr` tags on functions.
- `traceability-mutation` (change 083) records surviving mutants per function when it's turned on.
- The ADR reader gives each ADR's status and scope.
- `buildImportGraph` in `src/core/spec/import-graph.ts` knows which files import which.
- `docs-digest` has not landed as of 2026-09-27. If it has by planning time, its archive reader lists the changes that touched each capability.

### Requirements

#### Graph data

- `osq graph --json` prints the graph as nodes and edges with kinds and stable ids. The UI gets the same data from `osq serve`. The format carries a version.
- Node kinds: group, capability, requirement, scenario, test file, function, ADR and change.
- Edges and where they come from:
  - a group contains a capability, from the sidecar
  - a capability contains a requirement, and a requirement contains a scenario, from the living spec
  - an ADR applies to a capability, from the ADR's scope
  - a test proves a scenario and covers a function, from the scenario index
  - a function follows an ADR, from its `@adr` tag
  - a change writes or reads a capability, from its deltas and reads
  - a capability depends on another when a file one owns imports a file the other owns, from the import graph and Code ownership
- Each node carries what its detail panel needs: a capability its Purpose and gap counts, a scenario its THEN lines and tables, a function its file, tags and surviving mutants.
- Gaps are marked: scenarios no test proves, exported functions in a capability's ownership that no scenario claims, and files no capability owns.
- The graph data is built from the existing readers and indexes, and cached by file hash like the scenario index. The same inputs give identical data.

#### Semantic zoom

- **Level 1, the system.** Groups and their capabilities, the dependency edges between capabilities, the ADRs that apply to `all` around them, and gap counts per capability.
- **Level 2, a capability.** Its requirements and scenarios, the ADRs that apply to it, and its gaps in red.
- **Level 3, a scenario.** Its THEN lines and tables, the tests that prove it, and the functions they cover.
- **Level 4, the code.** A function with its tags, its file, its surviving mutants and the last change that touched it.
- Zooming into a node opens its next level, and zooming out returns. The view draws only the current level and its neighbours, so a project with thousands of scenarios stays fast.
- Every node opens a detail panel. From level 4, the panel links to the file.
- For a capability not opted into traceability, levels 3 and 4 aren't available, and the view says traceability isn't on for it.

#### Views that answer questions

- From an ADR: what it governs, meaning the capabilities it applies to and the functions that follow it.
- From a scenario: its blast radius, meaning the tests that name it and the functions they cover.
- A gaps view: every gap across the system.
- From a capability: the changes that touched it, newest first.
- The URL names the current node and level, so any view can be shared.

### Surface

- CLI: `osq graph --json`.
- The versioned graph data format.
- The graph view's levels, question views and URLs.

### Non-goals

- A time slider that replays the graph through the archives. A later change can add it on `docs-digest`'s reader.
- Editing anything from the graph. It only reads.
- Modules' published and consumed events from the ERP. That comes once modules declare contracts.

### Verify

`pnpm verify`, plus tests:

- `osq graph --json` on a fixture has every node and edge kind, each from the right source, with ids stable across runs
- a function carries its tags and surviving mutants, and a scenario carries its THEN lines and table
- an untested scenario, an unclaimed function and an unowned file are each marked as gaps
- a dependency edge appears when a file owned by one capability imports a file owned by another, and not otherwise
- each level shows only its own node kinds and their neighbours, and zooming in and out moves between them
- the ADR, blast radius, gaps and history views return the right nodes on the fixture
- a URL with a node and a level reopens that view
- a capability not opted into traceability shows levels 1 and 2 only, with the message
- on a synthetic project with 2,000 scenarios, each level opens without drawing nodes outside it
- building the graph data twice gives identical output

### Notes for planning

- Build the graph data in core, in its own module fed by the existing readers. The UI only draws.
- The pricing sample from the traceability vision is a fixture for levels 3 and 4. `osq-traceability-vision.md` is not in this repository; ask the human for it or write an equivalent fixture.
- Pick a graph library that handles large graphs in the browser, such as one that draws with WebGL. It belongs to `packages/ui`, not to the CLI's runtime dependencies.
- If `docs-digest` has landed, reuse its archive reader for change edges and the history view.
- This is likely too large for one change. Consider splitting graph data and `osq graph --json` from the zoomable view.

## [test-path-meanings] Each meaning of "test path" has one function, and the spec says which consumer uses which

Depends on: nothing

### Goal

osq has two meanings of "test path", and the split is deliberate, but nothing says so and each meaning is copied by hand. Each meaning gets one named function, every consumer calls it, and the living spec says which meaning each consumer uses.

### Context

As of 2026-09-28:

- **The frozen-test gate's meaning** is `tests` or any path under `tests/`. The watcher's gate snapshots only that folder: `snapshotTestFiles` in `src/watcher/verify.ts` walks the private constant `TEST_DIR_NAME`. Three private copies of the same check follow it: `isTestFilePath` in `src/core/spec/linter.ts` (the `tests.modify` lint), `isTestPath` in `src/core/spec/test-impact.ts` (the frozen-test impact warning), and `isTestPath` in `src/core/spec/digest.ts` (the approval digest's `existingTests`). The comments on the first two say they mirror the `tests/**` default. The copy in `digest.ts` has no comment.
- **The traceability meaning** also counts any file whose name holds `.test.` or `.spec.`. `isTestPath` in `src/core/trace/test-path.ts` is the shared definition, used by traceability lint, the report's traceability gaps, and the system graph. `showIsTestPath` in `src/core/status/show.ts` is a private copy of it.
- The cli-foundation requirement "Test gating configuration" says the configuration loader defines test file patterns, defaulting to `tests/**`. No such configuration key exists. The gate is hardcoded.
- `src/core/spec/test-impact.ts` already imports from `src/core/run/`, so core code under `run/` can serve both spec lint and the watcher.

### Requirements

- One exported function and one exported folder constant define the frozen-test gate's meaning. The watcher's snapshot, the `tests.modify` lint, the impact lint's frozen-test warning, and the approval digest all use them. No private copy remains.
- `show.ts` uses `isTestPath` from `src/core/trace/test-path.ts`. No private copy remains.
- Output doesn't change: the digest, lint findings, `osq show`, the report and the graph print exactly what they print today.
- The living specs state both meanings, and which consumers use each one. The "Test gating configuration" requirement stops describing a configuration key that doesn't exist.

### Non-goals

- Changing either meaning, for example counting `.test.` files outside `tests/` as frozen.
- Making the gate's folder configurable.

### Notes for planning

- One refactor task with `verify_starts: green` should be enough. The delta carries the spec text.
- The delta will probably replace "Test gating configuration" with a REMOVED requirement and an ADDED one, because its scenario names `osq.config.ts` patterns that don't exist, and a MODIFIED requirement has to keep that scenario.
- `src/core/spec/linter.ts` is on the line-budget allow list and holds grandfathered functions. Check both budget tests if the edit shrinks one.

## [traceability-opt-in-once] "Is this capability opted into traceability" is answered in one place

Depends on: nothing

### Goal

The check for whether a capability is opted into traceability is written once and shared, not copied into each file that needs it.

### Context

As of 2026-09-28:

- `isOptedIn` is copied word for word in `src/core/trace/mutation-pick.ts` and `src/core/run/focused-tests.ts`. `src/core/report/report-mutation.ts` has a third copy that takes the bare `capabilities` value.
- The related question "is anything opted in" is answered twice: by `hasOptedInCapability` in `src/watcher/mutation-check.ts`, and inline in `getMutationScores` in `report-mutation.ts`.
- `TraceabilityConfig` and its validator live in `src/core/foundation/config-traceability.ts`, owned by cli-foundation.
- Two readers expand `'all'` into a set of names, and they differ. `readOptedIn` in `src/core/spec/traceability-lint.ts` adds the change's delta capabilities, but `optedInCapabilities` in `src/core/report/report-traceability.ts` doesn't, because the report has no change.

### Requirements

- `config-traceability.ts` exports one function that answers "is this capability opted in", and one that answers "is anything opted in". The five places above use them, and no private copy remains.
- Behaviour doesn't change for `'all'`, for a list, or for the empty default.

### Non-goals

- Merging the two `'all'` expanders, which differ on purpose.
- Changing the traceability config's shape or its validation.

### Notes for planning

- The change writes no delta. It names `traceability` and `cli-foundation` in `features.reads`.
- One refactor task with `verify_starts: green`, plus a small test of the two exported functions over `'all'`, a list, and `[]`.

## [retire-source-comments] Only Code ownership carries a source comment

Depends on: nothing

### Goal

The `<!-- source: ... -->` comment is removed from every requirement in the living specs except `Code ownership`, and planners stop writing new ones. Nothing reads these comments and nothing checks them, so a planner or an agent that trusts one can be sent to a file that has moved.

### Context

As of 2026-09-28:

- All 428 requirements across the 8 living specs carry a source comment. Only the 8 on `Code ownership` requirements are read: `parseCodeOwnership` in `src/core/spec/parser.ts` reads their globs as the capability's owned files.
- 106 of the other comments name at least one path that matches no file, 159 of 1,534 entries in all. For example, web-inspection's comments still name `src/core/web-data*.ts` and `src/core/report.ts`.
- Planners still add them to new deltas: every archived change from 100 to 106 does. No template asks for them. `templates/proposal.md` shows one only on `Code ownership`. Planners copy the habit from the living specs.
- Living specs change only when the watcher archives a change and applies its deltas. `tests/living-specs-delta-equivalence.test.ts` checks that each living spec equals the deterministic merge of every archived delta, replayed with `mergeDelta` from `src/core/spec/delta.ts`. The test already normalizes one past merge change, with `stripLegacyDeltaReferences`.
- The scenario index gives checked links from scenarios to tests and functions (change 081), so a loose "source" hint per requirement adds nothing for traceability.

### Requirements

- The change's own deltas remove the comments. For every living capability, the delta holds a MODIFIED requirement for each requirement except `Code ownership`, with exactly the living text minus its source comment line.
- After this change archives, no living spec in this repository has a source comment outside `Code ownership`, and every other byte is unchanged.
- `osq lint` warns, and never fails, when a delta requirement other than `Code ownership` carries a source comment. The warning says only `Code ownership` keeps one.
- Archive and `mergeDelta` don't change. They keep applying approved text exactly (ADR 002).
- `parseCodeOwnership` and its fallback to backtick paths don't change.
- The delta-equivalence test passes unchanged, because replaying every archived delta ends at the swept living specs.

### Decision

Decided on 2026-09-28: the change's own MODIFIED deltas do the sweep, and a lint warning stops new comments.

- The watcher that archives a change runs the osq build from the main checkout, not the change's branch. So stripping comments in archive code could not take effect at this change's own archive. MODIFIED deltas work on today's merge, because a MODIFIED requirement replaces its whole block. On 2026-09-28, generated MODIFIED deltas for all 8 capabilities merged with today's `mergeDelta` into exactly each living spec minus its comment lines, leaving the 8 `Code ownership` comments.
- Costs accepted: the deltas are large (about 8,900 generated lines), and a MODIFIED requirement puts back its whole block as it was at plan time. If another change edits one of those requirements between planning and archive, this change reverts that edit.

Alternatives considered:

- Archive strips comments, and a second change sweeps after the first lands and the watcher restarts. Rejected: two changes, the equivalence test has to ignore comments in between, and archive would alter approved text.
- Archive strips comments from each capability it rewrites, with no sweep. Rejected: specs no change touches keep stale comments indefinitely, the equivalence test has to ignore them permanently, and archive would alter approved text.
- Keep the comments and check them. Rejected: the repair costs the same big deltas, and every later file move then needs a spec edit.
- Lint warning only. Rejected: the 106 stale comments stay.
- Edit living specs by hand. Rejected: living specs change only at archive, and replaying the archive brings the comments back.

### Non-goals

- Checking that `Code ownership` globs match files.
- Changing archive, the merge, or the delta or spec format.
- Editing archived deltas. Archives are history.

### Notes for planning

- Generate the deltas with a script, from `parseCapabilitySpec` in `src/core/spec/delta.ts`: each requirement's `raw` without its source comment line. Before finishing, merge them into the living specs with `mergeDelta`, and check the result equals each living spec minus the non-ownership comment lines.
- The new lint requirement goes in the spec-lint-and-approve delta beside that capability's sweep, with no source comment of its own.
- Plan this change right before approving it, with no other approved change that writes specs waiting, and land it before approving the next. Re-generate the deltas if any living spec changed since planning.
- One task: the lint warning and its tests. Measure in a scratch worktree for tests that pin lint warning counts.
- The warning is lint's only new rule. Keep it a warning so that an old habit never costs a retry.

## [approve-after-halt] Approval never races the watcher, a halted change says retry, and a rejected change can be approved again

Depends on: nothing

### Goal

`osq approve` into a worktree finishes before the watcher looks at the change. A change-level halt points the human at `osq retry <id> change`, not at `osq reject`. A change that was approved, rejected, and planned again can be approved again under the same folder name.

### Context

As of 2026-09-29:

- `approveIntoNewWorktree` in `src/core/spec/approve-worktree.ts` creates the branch and worktree, copies the change folder in, writes the seal (`.run/approved`) with `writeApprovalSeal`, and only then commits `osq: <id> approved`.
- The watcher treats a worktree change with `.run/approved` as approved. `checkWorktree` in `src/watcher/worktree-run.ts` runs before a spawn (`src/watcher/loop.ts`, around line 308) and before an archive (around line 212). It halts with `worktree_dirty` when status lists any path outside the change's `.run/` and `tasks.md`.
- On 2026-09-29 the watcher halted 116 with `worktree_dirty` at 18:05:12.067Z, listing only the change's own `proposal.md`, delta spec, and task files. The approval commit landed in the same second. The halt came between the seal and the commit. `osq retry 116 change` cleared it, and 116 then ran and landed.
- For a change-level regression, `readActiveNextStep` in `src/core/status/next-step.ts` returns `osq reject <id> --reason <text>`, so `osq status` printed `next: dead — osq reject 116`. The inbox's `change-regressed` item in `src/core/status/inbox.ts` also carries `osq reject`. The dispatcher's `haltItems` in `src/core/status/dispatch-items.ts` already lists `osq retry <id> change` first.
- `osq reject` removes a worktree change's worktree but keeps its branch `osq/<folder>`, whose tip is the `osq: <id> rejected` commit holding the dead markers and events (`src/core/lifecycle/reject.ts`).
- `refuseExistingBranch` in `approve-worktree.ts` refuses when `osq/<folder>` exists. 115 was approved, died with `spawn E2BIG`, was rejected, and was planned again in the checkout under the same folder. `osq approve 115` then failed with `branch osq/115-retire-source-comments already exists`. The human renamed the branch by hand to `osq/115-retire-source-comments-rejected-1`.

### Requirements

- The watcher neither spawns, archives, nor halts a worktree change whose `.run/approved` is not yet committed at HEAD. It skips that change on this pass, writes no marker or event for it, and picks it up on a later pass once the approval commit exists.
- A change whose approval commit exists is checked exactly as today. A real `worktree_dirty` still halts.
- For a change-level regression with no dead or regressed task, `osq status`, bare `osq`, and `osq inbox` name `osq retry <id> change`.
- When `osq approve` finds `osq/<folder>` and its tip is osq's rejection commit for that change, it renames that branch to `osq/<folder>-rejected-<n>`, with the lowest `n` from 1 that is free, and then approves as usual. It prints one line naming the renamed branch.
- A branch `osq/<folder>` whose tip is anything else still refuses, as today.

### Non-goals

- Changing what `osq reject` does to the branch at rejection time.
- Deleting kept branches.
- Recovering an approval whose commit failed after the seal. `osq approve` already reports that error.

### Notes for planning

- Skipping keeps the watcher filesystem-driven: whether `.run/approved` is committed is read from git status each pass, not remembered.
- Recognize the rejection commit by what `osq reject` writes: its `osq: <id> rejected` subject and `Osq-Change: <folder>` trailer. Check `reject-vcs.ts` for the exact form and reuse it rather than matching a second copy of the text.
- A branch rename needs a `Vcs` write method if none exists. Check `src/core/vcs/git-vcs-write.ts` first.
- `tests/approve-worktree.test.ts` pins the `already exists` refusal. Keep that case for a non-rejection tip.
- Measure in a scratch worktree for tests that pin the `osq reject` hint in status, inbox, or bare `osq` output.

## [stale-build-every-pass] A watcher or land running an old build stops and says to rebuild

Depends on: nothing

### Goal

osq never keeps running a compiled build that is older than its own source. The watcher checks before every spawn and archive, not only when it starts. `osq land` checks before it lands, and after landing a change to osq's own source it tells the human to rebuild and restart the watcher.

### Context

As of 2026-09-29:

- `checkStaleBuild` in `src/watcher/build.ts` compares the newest mtime under the osq package root's `src/` with the newest under `dist/`. When `src/` is newer, it prints `osq build is stale: src/ is newer than dist/. Run 'npm run build' or pass --allow-stale.` and exits 1. It skips an installed package (no `src/`) and a run from TypeScript source.
- `runWatcher` in `src/watcher/loop.ts` calls it once, at start, unless `--allow-stale` or `--dev` is set. `osq land` never calls it.
- `resolveBuildInfo` caches the commit it reads at start. The banner and each done marker's `build_stamp` show that commit, even after later lands.
- Three incidents, each recorded in the Notion page "Why 112 failed to land":
  - 110 to 112 ran on a watcher started before 109 landed, so archive verified before applying deltas, and 113 was the first change to meet the new order.
  - `osq land 112` ran on a `dist/` from before 109.
  - On 2026-09-29, after `osq land 116`, the running watcher still used a `dist/` built before 116. 115 needed 116's smaller executor prompt, and it looped on `spawn E2BIG` until the human ran `pnpm build` and restarted the watcher. The banner said `8d4a454`, one commit behind main, and nothing flagged it.

### Requirements

- Before each spawn and each archive, the watcher runs the same stale check it runs at start, with the same skips and the same `--allow-stale` and `--dev` escapes.
- A stale check during a run starts nothing new. It lets a running task finish and record its outcome, then prints the stale line and exits 1. It writes no marker for any change.
- `osq land` runs the stale check before it touches git, and refuses with the stale line when stale. `osq land --allow-stale` skips it.
- After a successful land whose commit changes files under the running osq package's own `src/`, `osq land` prints one line: `osq's own source changed; run the build and restart the watcher`.
- In a consumer project, where the land commit changes nothing under the running osq package's `src/`, `osq land` prints nothing new.

### Non-goals

- Rebuilding automatically, or restarting the watcher itself.
- Changing what the banner or `build_stamp` report.
- Checking an installed osq package against its registry version.

### Notes for planning

- `checkStaleBuild` calls `process.exit`. The watcher may keep that, since the watcher-and-harness capability owns its exits. `osq land` is a command and must throw a `CommandError` with the same message, per change 111.
- The mtime walk over `src/` and `dist/` runs on every pass. Measure its cost on this repository before deciding whether to cache the newest `dist/` mtime at start and walk only `src/`.
- `tests/watcher-stale-preflight.test.ts` covers the start check. Add new tests rather than changing it unless a pinned line moves.
- "The running osq package's own `src/`" is the package root `build.ts` already resolves. Compare real paths, as `resolveBuildInfo` does, so a linked global `osq` counts as the same package.

## [lint-own-findings] osq lint prints the change's own findings and counts the rest

Depends on: nothing

### Goal

`osq lint <id>` prints the findings for the change it was asked about. Repository findings, which are about other changes and the living specs, print as one count line with the command that lists them.

### Context

- `osq lint 114` on 2026-09-29 printed 250 `repository:` warnings, nearly all "Requirement text is very long (>500 characters)" from the openspec validator on living specs. The change's own findings were 3 lines at the end.
- `REPOSITORY_HEADER` in `src/core/spec/lint-output.ts` already says repository findings don't affect the exit code. They are grouped and deduplicated there, then printed one per line.
- Planners run `osq lint` several times per change, and every run puts all 250 lines into the planner's context.

### Requirements

- Text output for `osq lint <id>` prints the change's own findings as today, then one line: `repository: <n> findings about other changes and living specs; osq lint --repository lists them`. With no repository findings it prints nothing for them.
- `osq lint --repository` prints every repository finding, one per line, as today.
- `--json` still carries every repository finding.
- The exit code is unchanged.

### Non-goals

- Changing which findings exist, or their severity.
- Shortening the living specs to clear the validator warning.

### Notes for planning

- Tests that pin the repository group's text output need `tests.modify`. Measure in a scratch worktree.

## [regressed-report-short] A regressed report holds the failure, not the whole verify log

Depends on: nothing

### Goal

`.run/regressed/<target>.md` holds what a human or planner needs to see why archive verification failed: the failing tests and the end of the output. The full log stays in the `verify_ran` event.

### Context

- 113's `.run/regressed/change.md` on 2026-09-29 was 306 KB: the whole `pnpm verify` output, built by `verifyArchiveStep` in `src/watcher/archive-verify.ts` from the `verify_ran` event's `output`.
- The one failure was in `tests/living-specs-delta-equivalence.test.ts`. Its `assert.equal` of two whole living specs printed both, about 8 KB each, so even a grep for the failure pulled in 16 KB of spec text.
- `node --test` ends its output with a `✖ failing tests:` section that repeats every failure.

### Requirements

- The report body keeps the `✖ failing tests:` section to the end of the output when the output has one. Otherwise it keeps the last lines of the output, a count from config.
- Any single line in the body is cut to a length from config, ending in `… (<n> more characters)`.
- The report says where the full output is: the `verify_ran` event in `.run/events/<target>.jsonl`.
- The same applies to every other writer of a verify log into a `.run/` marker, if any exists; the planner finds them.
- `tests/living-specs-delta-equivalence.test.ts` reports a mismatch as the first differing lines with a few lines of context, not two whole specs.

### Non-goals

- Changing the `verify_ran` event or its `output`.
- Summarizing output with a model.

### Notes for planning

- New config keys go under `DEFAULT_CONFIG` like every limit.
- `osq show` and the dashboard read the regressed body; check what they pin.

## [planner-reads-requirements] Planners and executors read the requirements they need, not whole capability specs

Depends on: nothing

### Goal

The planner and executor instructions ask for the requirements a change touches, and osq prints one requirement on request, so no agent has to read a whole living spec.

### Context

- The living specs total about 600 KB. watcher-and-harness is 153 KB, cli-foundation 130 KB, spec-lint-and-approve 85 KB.
- `PLANNER.md` (managed block from `src/core/foundation/init-blocks.ts`) says "Read `AGENTS.md`, the capability specs this change touches, and one recent archived change end to end." A literal planner reads 200 KB or more for a change touching two capabilities.
- The executor protocol says "Read your task file, its parent `proposal.md`, then only the delta specs and capability specs it names." A task that names cli-foundation sends a cheap executor through 130 KB.
- A careful planner already greps for the requirements it needs. The instructions should say so, and osq should make it one command.
- `parseCapabilitySpec` already splits a living spec into requirements.

### Requirements

- A command prints one requirement of a living capability spec, with its scenarios, by capability and requirement name. With a capability alone it lists the requirement names. An unknown capability or requirement fails naming it. The planner picks the command's name and flags; `osq spec <capability> [requirement]` is one option.
- The planner instructions ask for the requirements the change touches, found with that command, instead of whole capability specs.
- The executor protocol asks for the requirements the task names.
- The `osq plan` prompt says the same.

### Non-goals

- Splitting or shortening the living specs.
- Changing what tasks or proposals must name.

### Notes for planning

- Both managed blocks change. Tests pin their text, and `osq doctor` checks the managed blocks; measure in a scratch worktree.
- `templates/PLANNER.md` and this repository's `PLANNER.md` and `AGENTS.md` carry the blocks.

## [confinement-env] Agents and verify get only the environment they need, and osq init scaffolds a contained harness

Depends on: adr-006-deterministic-core

### Goal

Agent-written code never sees a secret it doesn't need. osq builds each spawned process's environment from an allowlist instead of passing on its own, writes each harness's permission settings as a guardrail, and `osq init` stops scaffolding a harness with its permission checks switched off. ADR 007 records this, and only this: stage 1 of the confinement draft, with no containers yet.

### Context

As of 2026-09-28:

- `runVerificationCommand` in `src/core/run/verification.ts` starts from `{ ...process.env }`. The harness adapters pass `process.env`, or spread it and add `OSQ_TASK_NUMBER` and `OSQ_SPEC_FOLDER`: `claude-exec.ts`, `pi.ts`, `codex.ts`, `agy.ts`, `opencode.ts`, and the default in `src/harness/process.ts`. Every variable in the shell that starts osq reaches the agent and every test it writes.
- `osq init` scaffolds `harness: process.env.OSQ_HARNESS || 'agy'` (`src/core/foundation/init.ts`), its `.env.example` sets `OSQ_HARNESS=agy`, and the agy adapter defaults `dangerouslySkipPermissions` to true.
- `vcs.prepare` runs `pnpm install` through `runPrepare` in `src/core/spec/approve-worktree.ts`, which runs every dependency's install scripts.
- The full confinement design is drafted in Notion under Security, "Confinement ADR". It stays there as direction, not as an ADR. On 2026-09-30 the human chose an ADR per stage: this item writes ADR 007 for stage 1 only, and each later stage gets its own ADR when it's planned. The draft's roles are prepare, agent, verify and planner, and its decision 1 says verify never gets the model API key.
- `decisions/` holds ADRs 001 to 006. None covers confinement. ADR 003 says enforcement needs a sandbox, and ADR 006 decision 7 sets the target as a server driven by an app.
- The old roadmap's "safer defaults" item is folded in here.

### Requirements

- Each role osq spawns (prepare, the agent, and verify with its focused runs and mutation checks) gets an environment built from an allowlist: the variables every process needs, the ones osq sets, and the names the project lists for that role in config. Nothing else is inherited.
- The agent role gets the model API key its harness needs. Verify never does.
- A variable the project's tests need is declared by name in config and passed only to verify.
- Each harness adapter writes that harness's own permission settings for the agent where it has them: deny git, deny network tools, and deny or ask for destructive commands. For a harness without them, `osq doctor` says so.
- `osq init` no longer scaffolds a harness with its permission checks disabled.
- `osq doctor` reports how contained each role is.
- `decisions/007-*.md` is accepted, written by a task in this change. Its rule is close to "Each role osq spawns gets only the environment it declares; verify never gets the model key, and harness permissions are a guardrail." It names the roles and fixes the per-role config block, says what stage 1 does not defend against (files the user can reach, any network host), says how it serves ADR 006, and claims nothing about containers or the network. The rule reaches AGENTS.md's generated block.

### Decide before planning

- The base allowlist, for example `PATH`, `HOME`, `LANG`, `TERM` and `TMPDIR`.
- The per-role config block. It must take stage 2's mounts, network hosts and limits later as new fields beside `env`, for example `confinement.roles.<role>.env: [...]`, never a flat key like `verifyEnv`.
- Which harness `osq init` picks. The old roadmap suggested the most contained harness installed, printing what it chose and why.
- Whether agy runs headless without the bypass flag or stalls waiting for approvals.

### Non-goals

- Containers, the network allowlist, and resource limits. Those are the confinement draft's stages 2 and 3, each with its own ADR later.
- Confining a planner osq runs. That's stage 4.
- Accepting the full confinement draft, or any rule about server mode.

### Notes for planning

- Research each harness's permission settings before writing tasks: Claude Code's settings, Codex's sandbox modes, opencode's agent permissions, pi, and agy.
- Check that this repository's `pnpm verify` still passes with only the allowlist.
- Probably two changes: the ADR, the environment and permission settings first, then the init default and the doctor report.
- The ADR is a task inside the change, never a hand edit, so lint and the watcher check it.

## [approve-owns-draft] Approval moves the draft out of the checkout, and osq done goes

Depends on: deterministic-land, commands-throw

### Goal

After `osq approve`, a change lives in one place: its branch and worktree. The checkout's copy, which looks like the plan but no longer drives anything, is removed at approval. `osq done`, which marks a task done without its verify, is removed, as ADR 006 decision 3 says.

### Context

As of 2026-09-28:

- With `vcs.enabled`, `approveSpec` copies the draft into the new worktree (the `fs.cp` in `src/core/spec/approve-worktree.ts`), commits it there, and leaves the checkout's copy in place. ADR 003 decision 2 chose that so `osq land` would be the only command that writes the checkout.
- The copy has a cost: `findLeftoverDrafts` in `src/core/status/leftover-drafts.ts`, the `Leftover drafts:` section of `osq status`, the "copy edited since approval" warning, the hash matching, and the cleanup in `osq land`. On 2026-09-28 a planning session opened on 107's leftover copy as "uncommitted work".
- A stacked approval copies the folder to `<vcs.worktreeRoot>/<repo>/.stacked/<folder>` instead of a branch. Without `vcs.enabled`, the checkout's folder is the change itself.
- `osq done <id> <task>` writes a done marker with a justification and no verify (`src/core/lifecycle/done.ts`, `src/cli/done.ts`). No archived change used it. AGENTS.md's Principles say a human writes manual `done` through the CLI, and squash outcome lines print `[manual]` for such a task.

### Requirements

- With `vcs.enabled`, `osq approve` removes the checkout's copy of the folder once the approval commit exists on the branch, or once the stacked approval is written. A failed approval leaves the copy.
- Without `vcs.enabled`, approval moves and removes nothing.
- ADR 003 decision 2 and its rule say osq writes the checkout only through commands the human runs: approve and land.
- `osq done` is removed: the command, its core module, and every mention in README, AGENTS.md and the templates. Archives holding a manual done marker still read as they do today.

### Decide before planning

- Whether leftover-draft detection stays as a safety net for drafts left by older approvals and hand landings, or goes.
- Where a human edits a running change's plan once the checkout has no copy. ADR 003 decision 4 says re-approval runs against the worktree. `steering-triggers` builds on the answer.

### Non-goals

- Changing what a stacked approval stores.
- `osq verified`. That's `checks-osq-runs`.

### Notes for planning

- Removing a command removes surface from a published package. Say so in CHANGELOG.
- Tests pin `osq done` and the leftover-draft section. Measure the fallout in a scratch worktree first.

## [ci-temp-repo-cleanup] CI never fails because a test's temp repository is still being written when it is removed

Depends on: nothing

### Goal

`pnpm verify` on the GitHub Actions runner passes whenever it passes locally. No test fails in its cleanup because something is still writing into the temp git repository the test is removing.

### Context

As of 2026-09-30:

- CI on `main` is red. Two runs each failed one test in `tests/worktree-run.test.ts`, and a different one each time: "commits a new test file outside the task scope" and "archives with a commit that leaves the worktree clean". Both failed with `ENOTEMPTY: directory not empty, rmdir '/tmp/osq-worktree-run-<random>/repo/.git/objects/pack'`. Everything else passed: 2836 of 2838, with one skipped.
- The same suite passes locally (WSL2, git 2.34.1).
- The error comes from cleanup, not from an assertion. `afterEach` in `tests/worktree-run.test.ts` runs `fs.rm(dir, { recursive: true, force: true })` over every temp root. `ENOTEMPTY` on `rmdir` means a file appeared in `.git/objects/pack` while `fs.rm` was removing it, so some process was still writing into the repository after the test's last await.
- About 300 test files clean up temp directories the same way, and many of them create git repositories.
- Nothing in `src/` or `tests/` sets `gc.auto` or `maintenance.auto`. `git commit` can start `git gc --auto` or `git maintenance run --auto` in the background, and they write packs. The runner's git is newer than the local one and may have different defaults.
- `runVerificationCommand` in `src/core/run/verification.ts` spawns verify with `detached: true`. A git child that osq times out and kills may also outlive the test.

### Requirements

- The writer is identified and named in the change: which process writes `.git/objects/pack` after a `worktree-run` test ends.
- No test's temp git repository is still being written to when the test's cleanup runs. Test repositories either never start background git work, or the test waits for it to end.
- A temp directory removal in a git-using test retries on `ENOTEMPTY` and `EBUSY` before it fails, for example with `fs.rm`'s `maxRetries`, so a late write cannot fail CI.
- `pnpm verify` passes on the GitHub Actions runner three times in a row.

### Non-goals

- Changing the git settings osq uses in a user's repository, unless the writer turns out to be osq's own code leaving a child running. Then that is a bug to fix in `src/`.
- Rewriting cleanup in test files that create no git repository.

### Notes for planning

- Reproduce first. Try `git -c gc.auto=1 commit` in a temp repository followed by an immediate `fs.rm`, and check `git config --system --list` and the git version on `ubuntu-latest`.
- A shared test helper for temp roots, such as `tests/helpers/`, may be simpler than editing each `afterEach`, but every file it touches is a preexisting test and needs `tests.modify`. Measure how many files create git repositories, and keep each task under the 8-pattern scope limit.
- If test repositories should turn off background git work, `GIT_CONFIG_COUNT`, `GIT_CONFIG_KEY_0` and `GIT_CONFIG_VALUE_0` in the `test` script reach every git child without editing each test. osq's own git calls pass through `childGitEnv`; check that it keeps them.

## [checks-osq-runs] Checks after landing are commands osq runs, and nothing waits on a human's word

Depends on: deterministic-land, commands-throw

### Goal

osq never records a human's claim as verification (ADR 006 decision 3). A proposal's `check:` command runs as part of landing, and its result is what's recorded. "After landing" steps become notes that nothing waits on. `osq verified` goes, and so does the verification-pending state that holds dependents back.

### Context

As of 2026-09-28:

- A proposal with `### After landing` steps or a `check: <command>` in its frontmatter archives as verification pending (`readArchivedVerification` in `src/watcher/archiver.ts`). Its dependents wait, and the queue shows it as `verification-pending`, until a human runs `osq verified <id> --passed` or `--failed`. `osq check <id>` runs the recorded command.
- The state runs through `src/core/status/`: `state.ts`, `dependency-readiness.ts`, `queue-state.ts`, `next-step.ts`, `inbox.ts`, `inbox-projection.ts`, `inbox-text.ts` and `queue-report-detail.ts`. The inbox has a verification item with `p` and `f` keys.
- PLANNER.md and `templates/PLANNER.md` tell planners that after-landing steps keep verification pending until `osq verified`.
- Across 107 archived changes, a verification was recorded twice.
- Approval flags print and then approve anyway, unless `--confirm` is passed (README, "Gates and permissions"). ADR 006 decision 4 says a gate blocks or goes.

### Requirements

- osq runs the proposal's `check:` command as part of `osq land` and records its result in the change's events.
- `### After landing` steps are shown at land and in `osq show` as notes. Nothing waits on them.
- `osq verified`, the verification-pending state, the inbox's verification items and their keys, and the queue's `verification-pending` state are removed. Archives holding a recorded verification still read.
- PLANNER.md and its template describe the new rule.

### Decide before planning

- Where the check runs: in the worktree before the fast-forward, like verify, or in the checkout after it. A server has no checkout.
- Whether a failed check stops the land or blocks dependents, as a failed gate should, and how a human clears it.
- Approval flags: count how often each flag fired across the archive by recomputing each archived change's digest. Then make the ones that caught something real lint errors and drop the rest. That may be a change of its own.

### Non-goals

- Human steps before approval. They stay.

### Notes for planning

- Expect REMOVED requirements in status-inspection and cli-foundation. Measure the fallout first.
- Removing a command needs a CHANGELOG note.

## [steering-triggers] Every way a change gets stuck ends at one action: plan it

Depends on: osq-sync, approve-owns-draft

### Goal

When a change needs a human's judgement, osq decides that, not whoever happens to be watching (ADR 006 decision 5). Each trigger halts the change, records the reason and its evidence, and offers one action: plan it. That opens a planning session with the change, the reason and the evidence loaded. The revised plan comes back for approval, and the run continues from the last verified task. Nothing on this path needs a shell.

### Context

As of 2026-09-28, each trigger ends somewhere different:

- A stuck task, one that died twice with the same fingerprint, waits for `osq retry <id> <n>` after the human finds and fixes the cause.
- A `blocked` task, where the executor says the plan lacks something, waits for the human to edit the plan, approve again and retry.
- A regression at archive writes `.run/regressed/<n>.md` or `change.md` and waits for `osq retry`.
- A code conflict at land stops with the conflicting paths, and the human merges by hand in the worktree.
- After `osq-sync`, a sync that finds a requirement changed on the default branch, or a code conflict, halts the change with a reason.
- A red `verify` at land on an archived change has no way out inside osq. `osq reject` refuses archived changes, and the watcher no longer runs the change. On 2026-09-29, 112 archived under an osq build older than 109. That build ran the change-level `verify` before applying the deltas, and 112's delta removed a requirement that `tests/living-specs-delta-equivalence.test.ts` pins, so `osq land 112` failed. A human fixed it by hand in the worktree.
- `osq plan <id> --session` reopens a planning session on an existing change that has a `brief.md`, and `osq plan` writes `plan-prompt.md` into the change folder.
- ADR 003 decision 4: re-approval runs `osq approve` against the worktree and commits the edits with the new hash.
- Transient deaths such as `verify_red`, `timeout` and `crashed` already retry automatically.

### Requirements

- A fixed list of triggers halts a change for steering: a stuck task, a blocked task, a requirement the change rewrites that changed on the default branch, a code conflict at sync or land, a red `verify` at sync or land, and a regression at archive. An archived change that halts can still be planned and run again. The list lives in a spec, and adding a trigger is a spec change.
- A halted change has one inbox item, "needs steering", naming the trigger, its reason and its evidence: the dead marker, the conflicting paths, or the changed requirement.
- The item's one action plans the change: a planning session on the change's own folder, with the trigger, the reason and the evidence in its prompt.
- After the revised plan is approved, tasks already verified stay done, and the run continues from the first task that isn't.
- Transient deaths keep retrying automatically and raise no item until they are stuck.

### Decide before planning

- The command for the action at the CLI before the UI exists. Probably `osq plan <id>`, reading the halt from the change's `.run/`.
- Which done markers a revised plan keeps when it changes a done task's scope or verify.
- Whether `osq retry` stays for a human who fixed the cause outside osq.

### Non-goals

- The UI action and notifications. Those are later milestones on the roadmap.
- An AI resolver for code conflicts. It waits until sync data shows conflicts are common and mechanical.

### Notes for planning

- Read ADR 006 decision 5 first.
- Research the plan-prompt builder, the dead and regressed markers, and the re-approval path in the worktree before writing tasks.

## [docs-digest] A digest of archived changes, by date or by selection

Depends on: nothing

### Goal

A human can ask osq what happened since a date, or what a handful of changes did, and get an answer in a minute of reading instead of an hour in git history. Every line in the digest comes from a file in an archive, so the digest can't say anything the record doesn't. No model is involved.

### Context

As of 2026-09-28:

- Each archive holds the change folder: the proposal with its `## Goal` section, `tasks.md`, the deltas per capability, and `.run/` with the approval hash, done and dead markers, `results/` and `events/`.
- `src/core/spec/delta.ts` parses deltas into requirements and their scenarios, under ADDED, MODIFIED, REMOVED and RENAMED.
- `src/core/foundation/decisions.ts` reads ADR frontmatter: status, scope and the one-line rule.
- osq records every attempt, failure and cost in the events. Recheck which events carry cost and elapsed time.
- `readLandedAt` in `src/core/web/web-data-lifecycle.ts` reads when a change archived, and change 104 made a landed change count once. On `main`, each land commit carries an `Osq-Change` trailer and the landing date.
- The `started` event has carried `harness`, `model` and `osqVersion` since change 084. Older archives lack them.
- `osq report` and `src/core/report/` exist.
- The dashboard's land view and its "landed since last look" list are meant to read this digest's JSON later, in the roadmap's second milestone.
- Source: the Notion page "Docs Digest" under DOCS FEAT. Its companions, docs-onboarding and docs-narration, aren't queued yet.

### Requirements

#### Selection

- `osq digest --since <date>`, optionally with `--until <date>`, selects the changes archived in that range, inclusive.
- `osq digest <id>...` selects changes by id. The two forms can't be combined.
- An id with no archive is an error that names it. A range with no changes produces an empty digest that says so, and exits zero.

#### What each change contributes

- its id, title and archive date
- its `## Goal` section, verbatim
- per capability, the requirements it added, modified, removed or renamed, by name
- the ADRs its proposal names, with their one-line rules
- its tasks: how many, how many attempts in total, dead attempts with their reasons, and halts that needed a human
- its elapsed time, its cost, and the models it used

#### The period

- A digest for a date range starts with totals: changes, requirements added, modified and removed, the capabilities touched most, ADRs dated inside the range, halts, time and cost.

#### Output

- Markdown by default, JSON with `--json`. The JSON gives every change, requirement and ADR a stable id, and its schema carries a version.
- `--out <file>` writes to a file. Otherwise the digest goes to stdout.
- `--no-cost` leaves out cost and models, for readers outside the team.
- The digest never includes tool summaries, verify output, the bodies of `results/`, event contents beyond the fields above, or file paths. A digest gets forwarded, and those belong in the repository.
- The same archives and arguments produce byte-identical output. Changes are ordered by archive date, then by id.

### Surface

- CLI: `osq digest`.
- The versioned JSON schema of a digest.

### Non-goals

- Prose written by a model. That's docs-narration.
- Present-state docs for onboarding. That's docs-onboarding.
- Changes that haven't archived.
- Reading git history.

### Verify

`pnpm verify`, plus tests:

- a date range selects exactly the archives dated inside it, including both ends
- selection by id returns those changes in date order, and an unknown id fails naming it
- every field above appears for a fixture archive, and a change with a dead task shows its reason
- a delta with ADDED, MODIFIED, REMOVED and RENAMED requirements lists each under the right heading
- `--no-cost` output contains no cost and no model
- no output contains an absolute path, a tool summary or verify output
- two runs give byte-identical Markdown and JSON
- an empty range says so and exits zero

### Notes for planning

- Put the archive reader in its own module. docs-onboarding reuses it for a capability's recent changes.
- Reuse `delta.ts` and the ADR reader rather than parsing again.
- Older archives may lack fields. Show what exists and mark the rest as not recorded, rather than failing.
- osq's own archive is the first real input.

## [done-marker-path-in-spec] The stale-build spec names the done marker the watcher really writes

Depends on: nothing

### Goal

The living watcher-and-harness spec names a task's done marker as `.run/done/<n>`, the path the watcher writes, everywhere it names one.

### Context

As of 2026-09-30:

- 118 (`stale-build-every-pass`) added the scenario "Source edited while a task runs" to "Stale build preflight detection" in `openspec/specs/watcher-and-harness/spec.md`. Its THEN says `` `.run/done/1.md` exists``.
- `writeDoneMarker` in `src/watcher/outcome.ts` writes `.run/done/<n>` with no extension. 118's executor flagged the mismatch and tested the real path: `tests/watcher-stale-every-pass.test.ts` checks `.run/done/1`.
- The mistake was the 118 planner's. No other living spec names a `.run/done/` file with an extension.

### Requirements

- The scenario "Source edited while a task runs" says `` `.run/done/1` exists``. Nothing else in the requirement changes.

### Non-goals

- Renaming the done marker.
- Changing any code or test.

### Notes for planning

- A MODIFIED "Stale build preflight detection" that repeats the requirement word for word and keeps every scenario, with only that path changed.
- The change adds no test and changes no code, so its one task's `verify` is `node --import tsx --test tests/watcher-stale-every-pass.test.ts` with `verify_starts: green`.
