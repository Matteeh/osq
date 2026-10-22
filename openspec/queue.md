# osq queue

The remaining work on osq itself, as an osq brief queue.

Each item's body becomes that change's `brief.md` word for word. Drive the run with `osq plan --next`, then plan the change in a Claude Code session, review it, and `osq approve`.

Landed items are taken out of this file. Each one's text is kept as `brief.md` in its archived change folder, and each finished queue has a summary in Notion under OSQ > Archive. The latest queues drove 237 to 268; earlier queues drove 220 to 236, 189 to 197, 166 to 188, 156 to 165, 145 to 155, 136 to 144, 132 to 135 and 103 to 131.

This queue serves the Rust rewrite, which is designed by hand in Notion (OSQ > Rust Rebuild, with its roadmap database) and built in this repository. Core, every kernel, the CLI dispatch, worktree listing, and the query, inbox, plan, archive, approve, land and report features have landed, with the run feature's prompt and verify pieces. This queue finishes running one task on pi, then ports the commands a human runs around it: show, lint, doctor, retry, reject, plan steering and after-land.

Items run in parallel. The watcher runs up to `maxConcurrency` approved changes at once when their scopes do not overlap, so an item's `Depends on` line names only what it really needs. Each item works in its own crate. `rust-feature-scaffolds` adds the four new crates in one change, so the items after it never share the root `Cargo.toml` or the CLI registry. Since 262 land rebuilds a conflicting `Cargo.lock`, so tasks do not scope it. Land each change as it archives.

osq reads only the `## [slug]` items below. Everything above the first item is for people.

## [rust-scope-audit] Rust core decides which changed paths a task's scope allows

Depends on: nothing

### Goal

The run feature must kill a task that writes outside its scope or changes a frozen test. That decision is pure, so it belongs in core, where the run feature and the scheduler can share it.

### Context

As of 2026-10-21:

- TypeScript decides in `scopeCoversPath` and `scopeCoversChangedPath` in `src/core/run/scope.ts`, with the lockfile rule from 235 (`lockfileFollowsManifest`) and the gated test rule from 201 (`tests.modify`).
- `scope_files` in the loop kernel resolves globs against the tree (237); core does no IO.

### Requirements

- A pure core function takes a task's scope patterns, its `tests.modify`, the result file path, the manifests in scope, the language test-path rules and the changed paths, and gives each disallowed path with its reason, matching TypeScript on the same inputs.
- Table tests cover a glob, a lockfile beside a scoped manifest, a frozen test, a new test and the result file.

### Non-goals

- Reading git status or the tree; the caller passes the changed paths.

## [rust-inbox-archived] The Rust inbox lists archived-not-landed changes and archived steering

Depends on: nothing

### Goal

The Rust inbox left out the archived-not-landed and archived steering cards, because TypeScript shows them only when `vcs.enabled` is on and Rust could not read config or worktrees then.

### Context

As of 2026-10-21:

- Left out of 244. TypeScript builds these cards in `src/core/status/dispatch-cards.ts` and `status.ts`.
- The config kernel gives `VcsConfig` (252); `rust-worktree-changes` makes the storage listing read worktrees.

### Requirements

- With vcs enabled, the inbox shows the archived-not-landed and archived steering cards TypeScript shows, with the same text and order; with vcs off it shows neither.
- Tests use scratch repositories with worktrees.

### Non-goals

- Acting on the cards.

## [rust-run-one-task] The Rust run feature runs one task end to end on pi

Depends on: rust-scope-audit

### Goal

Join the run feature's pieces so Rust can run one approved task the way the watcher does: start the executor, check its result and scope, run the task and change verify, and record the outcome in the `.run/` files TypeScript reads.

### Context

As of 2026-10-21:

- The pieces come from `rust-run-task-prompt`, `rust-verify-command`, `rust-scope-audit` and `rust-pi-config`. The runner and pi harness landed in 246, 251 and 254.
- TypeScript runs a task in `runTask` in `src/watcher/runner.ts`, with the attempt, outcome and dead-marker files in `src/watcher/`.
- ADR 025: Rust writes today's `.run` markers and event JSONL as they are, so TypeScript can read what Rust wrote.

### Requirements

- `osq run <id> <n>` in Rust runs one task once and writes the running, done or dead markers and the events TypeScript writes for that outcome.
- A task is done only when osq's own task verify and change verify pass and the scope audit finds nothing.
- Tests run the committed fake pi from 260 on a fixture change, for a done, a verify-red and a scope-violation outcome.

### Non-goals

- Retries, baseline verify, mutation testing, worktrees, commits and the watcher loop; each is a later item.

## [rust-feature-scaffolds] Rust gains empty show, lint, doctor and retry feature crates, registered in the CLI

Depends on: nothing

### Goal

Every new feature crate edits the root `Cargo.toml` and the CLI's `features()` registry, so changes that each add a crate overlap and run one at a time. One small change should add the four crates the next items need, empty, so those items each touch only their own crate and run side by side.

### Context

As of 2026-10-22:

- The workspace lists each crate in `members` and `[workspace.dependencies]` in the root `Cargo.toml`. `crates/apps/cli/src/lib.rs` registers each `Feature` in `features()`, and `crates/apps/cli/Cargo.toml` depends on each feature crate.
- 239 split capabilities into one per crate. Each Rust capability's spec holds a `Code ownership` requirement and an `osq.yml` with `group: rust`.
- The TypeScript commands these crates will port are `osq show` (`src/cli/show.ts`), `osq lint` (`src/cli/lint.ts`), `osq doctor` (`src/cli/doctor.ts`) and `osq retry` (`src/cli/retry.ts`).

### Requirements

- New crates `osq-feature-show`, `osq-feature-lint`, `osq-feature-doctor` and `osq-feature-retry` under `crates/features/`, each with one capability (`rust-show`, `rust-lint`, `rust-doctor`, `rust-retry`) that owns the crate.
- Each exposes one `Feature` with its name and no commands, registered in the CLI, so the binary's help is unchanged.
- Tests prove each feature's name and empty command list, and that the CLI registry holds it.

### Non-goals

- Any command; each is its own item.

## [rust-show] The Rust osq show prints one change as TypeScript does

Depends on: rust-feature-scaffolds

### Goal

`osq show <id>` is the command a human runs most after the inbox, and Rust lacks it. The show feature should print one change's details with TypeScript's text.

### Context

As of 2026-10-22:

- TypeScript builds the text in `getSpecDetails` and `formatShowText` in `src/core/status/show.ts`, called from `src/cli/show.ts`.
- The storage kernel's `read_change` gives the snapshot; 270 gives the inbox the tree listing with vcs on.
- `rust-feature-scaffolds` gives an empty `osq-feature-show` crate.

### Requirements

- `osq show <id>` in Rust prints the same text as TypeScript for active, approved, running, dead, archived and rejected changes of a fixture, with vcs off.
- Unknown or missing ids give TypeScript's error text.
- Goldens are printed by TypeScript's built `dist` from the fixture and committed in the change folder.

### Non-goals

- `--json`, and the worktree and landed lines that need vcs on.

## [rust-lint-command] The Rust osq lint reports a change's spec and link gate findings

Depends on: rust-feature-scaffolds

### Goal

The specs kernel validates deltas and the linter kernel runs the link gates, but no Rust command runs them on a change. `osq lint <id>` in Rust should run both and print the findings, so the Rust gates can be used before TypeScript's lint is ported in full.

### Context

As of 2026-10-22:

- TypeScript's lint is `src/cli/lint.ts` over `src/core/spec/lint*.ts`. It checks proposals, tasks, scopes and verifies, and runs the Rust link gates through `rust-linter`.
- The specs kernel validates a change's deltas (217). The linter kernel gives `change_link_gates` (232, 238, 263).
- `rust-feature-scaffolds` gives an empty `osq-feature-lint` crate.

### Requirements

- `osq lint <id>` in Rust prints each specs-validation and link-gate finding of the change, one per line, then `<folder>: valid` or a count, and fails with a non-zero exit when any finding blocks.
- Tests run it on fixture changes with no findings, a delta error and a link-gate error.

### Non-goals

- The TypeScript planner rules about proposals, tasks, scopes and verifies; later items port them.
- `--repository`.

## [rust-doctor-pi] The Rust osq doctor checks pi as TypeScript does

Depends on: rust-feature-scaffolds

### Goal

The executor runs on pi, and a wrong pi version or a missing provider key fails every task. Rust should give TypeScript's `osq doctor` pi checks, from the pi settings in `osq.toml`.

### Context

As of 2026-10-22:

- TypeScript checks pi in `diagnosePi` and `assessPiVersion` in `src/core/foundation/config-pi.ts`, against the tested range `PI_TESTED_RANGE`, and prints through `src/cli/doctor.ts`.
- 266 gives `PiConfig` and `PiHarness::from_config`. 251 gives the pi preflight that reads `pi --version`.
- `rust-feature-scaffolds` gives an empty `osq-feature-doctor` crate.

### Requirements

- `osq doctor` in Rust prints the pi lines TypeScript prints for a pi in range, out of range, missing, and with or without the provider's key, and exits non-zero when a check fails.
- Tests use the committed fake pi from 260.

### Non-goals

- Doctor's checks for other harnesses, git, Node or the watcher.

## [rust-retry] The Rust osq retry clears a dead or regressed task or change as TypeScript does

Depends on: rust-feature-scaffolds

### Goal

A human retries a task or a change after it dies or regresses. Rust has no retry, so a Rust run could not be retried without TypeScript.

### Context

As of 2026-10-22:

- TypeScript retries in `retrySpec` in `src/core/lifecycle/retry.ts`, called from `src/cli/retry.ts`. It checks approval, running state and failure before writing, keeps each cleared marker as history, and appends a `retry` event that `readRetryContext` in `src/watcher/attempt.ts` reads.
- ADR 025: Rust writes the `.run` markers and events TypeScript reads.
- `rust-feature-scaffolds` gives an empty `osq-feature-retry` crate.

### Requirements

- `osq retry <id> <n>` and `osq retry <id> change` in Rust make the same file and event changes TypeScript makes, and refuse what TypeScript refuses, with its text.
- Tests compare the `.run` tree after a Rust retry with the tree TypeScript's `dist` leaves on the same fixture.

### Non-goals

- Retrying an after-land command, and stale-lock recovery of a killed watcher.

## [rust-reject] The Rust osq reject moves a change into rejected history as TypeScript does

Depends on: nothing

### Goal

A human rejects a plan or a failed change with a reason. Rust's approve feature approves but cannot reject.

### Context

As of 2026-10-22:

- TypeScript rejects in `rejectSpec` in `src/core/lifecycle/reject.ts`, called from `src/cli/reject.ts`. An unapproved active change is eligible. An approved one is eligible only with an active failure and no running task. Every refusal happens before the first write.
- `crates/features/approve` holds the approve command (250); reject is the same capability in TypeScript (`spec-lint-and-approve`).

### Requirements

- `osq reject <id> "<reason>"` in Rust moves the folder and writes the rejection files TypeScript writes, and refuses each case TypeScript refuses, with its text.
- Tests run it on fixture changes for each eligible and refused case, with vcs off.

### Non-goals

- Rejections with vcs on, and steering a rejected plan.

## [rust-plan-steer] The Rust osq plan builds the steering prompt for a change that needs steering

Depends on: nothing

### Goal

When a change needs steering, `osq plan <id>` hands the planner a prompt naming each trigger, its evidence and the requirements that changed. Rust's plan feature plans new changes only.

### Context

As of 2026-10-22:

- TypeScript builds the steering prompt in `src/cli/plan-steer.ts` and `src/cli/plan-steer-prompt.ts`, finding the change with `findSteeringChange` in `src/core/status/steering-change.ts`.
- The Rust inbox derives the same triggers (244, 270). The plan feature writes `plan-prompt.md` for new changes (249, 255).

### Requirements

- `osq plan <id>` on an active or archived change that needs steering writes the same prompt TypeScript writes, for blocked, stuck, regression, conflict and requirement-changed triggers.
- Goldens are printed by TypeScript's `dist` from fixture changes and committed in the change folder.

### Non-goals

- Starting the planner, auto-steer, and the default-branch requirement text when vcs is off.

## [rust-land-after-land] Rust land runs the configured after-land command and records a failure

Depends on: nothing

### Goal

`vcs.afterLand` runs a command in the checkout after each land, such as a rebuild. Rust land skips it, so a Rust land leaves the checkout stale.

### Context

As of 2026-10-22:

- TypeScript runs it in `runAfterLand` in `src/core/vcs/land-after.ts`, records a failure under `~/.osq`, and `retryAfterLand` reruns it. The inbox shows the failure as an `after-land-failed` item.
- The config kernel reads `vcs.afterLand` (252). The harnesses kernel runs shell commands with a timeout (268).

### Requirements

- After a successful Rust land, the configured command runs in the checkout, and a failure is recorded in the file TypeScript reads, with its output, while the land itself still succeeds.
- An unset command leaves land's output as it is today.
- Tests use scratch repositories and commands that pass and fail.

### Non-goals

- Retrying the command; the inbox item for it is `rust-inbox-pending-items`.

## [rust-inbox-pending-items] The Rust inbox lists paused tasks, after-land failures and autopilot stops

Depends on: rust-inbox-archived

### Goal

The Rust inbox still leaves out three cards TypeScript shows: a task paused by a usage limit, a failed after-land command, and an autopilot stop.

### Context

As of 2026-10-22:

- TypeScript builds them in `src/core/status/inbox-paused.ts` (`projectPaused`), `afterLandFailedItem` and `autopilotStoppedItem` in `src/core/status/inbox-projection.ts`, reading `.run/paused.md`, the after-land failure record and the autopilot stop record.
- 270 adds the archived cards and reads every tree with vcs on.

### Requirements

- The Rust inbox shows the three cards with TypeScript's text, in its order, and none when no record exists.
- Tests write each record on a fixture and compare with TypeScript's text.

### Non-goals

- Acting on the cards.

## [rust-run-attempts] The Rust run feature counts attempts and hands the prior failure to a retried task

Depends on: rust-run-one-task, rust-retry

### Goal

A retried task should know which attempt it is and why the last one failed, as TypeScript's executor prompt says. The first Rust run reads neither.

### Context

As of 2026-10-22:

- TypeScript reads them in `readRetryContext` in `src/watcher/attempt.ts`, from the `retry` and `recertification` events, and hands them to the prompt.
- 267's `executor_prompt` takes a `PriorAttempt` from its caller. `rust-retry` writes the `retry` event.

### Requirements

- `osq run <id> <n>` in Rust reads the attempt and prior failure from the task's events as TypeScript does, and passes them to the executor prompt.
- Tests cover a first run, a run after a retry, and a run after a requeued recertification.

### Non-goals

- Automatic retries and the usage-limit pause.

## [rust-cli-run] The Rust CLI registers the run feature, so osq run works from the binary

Depends on: rust-run-one-task

### Goal

`rust-run-one-task` adds `RunFeature` but leaves it out of the CLI registry, because 271 was editing that registry at the same time. Until it is registered, the Rust binary has no `osq run`.

### Context

As of 2026-10-22:

- `features()` in `crates/apps/cli/src/lib.rs` registers every feature in order; 271 appended show, lint, doctor and retry after report. `crates/apps/cli/Cargo.toml` already depends on `osq-feature-run`.
- `RunFeature` is a unit struct in `crates/features/run/src/feature.rs` with one `run` command (273). The CLI's dispatch tests are in `crates/apps/cli/tests/dispatch.rs`.

### Requirements

- `features()` registers `RunFeature`, and the binary's top-level help lists `run` with its summary.
- `osq run <id> <task>` through the CLI reaches the run feature: a test runs it on a root with no `openspec/` folder and gets the feature's own error, not an unknown-command error.

### Non-goals

- Any change to how the run feature runs a task.

## [planner-scripted-edits] The planner rule bans shell-written file contents, not scripted edits that lint checks

Depends on: nothing

### Goal

The planner rule "Write files with the file tool, never through a shell echo." bans every scripted write. It came from 029, when task files written through a shell echo held control characters and fused acceptance lines. 029 also made `osq lint` and `osq approve` reject exactly that damage, so lint now guards the result whatever wrote it. The rule adds friction without adding safety: 273's planner narrowed the scopes of two task files with a script, broke the rule, and lint passed on the text it meant.

### Context

As of 2026-10-22:

- The rule lives in the managed planner block, `MANAGED_PLANNER_BLOCK` in `src/core/foundation/init-blocks.ts`, copied into `PLANNER.md` and `templates/PLANNER.md`.
- cli-foundation's scenario "Managed block includes file tool instruction" pins the exact sentence. So do `tests/init-planner.test.ts`, `tests/plan.test.ts` and `tests/architecture-first-docs.test.ts`; the last uses it as the bullet before the architecture-ADR bullet.

### Requirements

- The rule reads: "Write file contents with the file tool, never through a shell echo or heredoc. A script may make mechanical edits, such as one scope change across several task files; `osq lint` checks the result."
- The block, both PLANNER.md copies, the scenario and the tests that pin the sentence all carry the new text.

### Non-goals

- Changing what `osq lint` checks.
- An osq command that edits scopes. A scope inspector that shows facts is an idea on Notion (Tools for AI and tools for humans, 2026-10-22), not queued.
