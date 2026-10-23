# osq queue

The remaining work on osq itself, as an osq brief queue.

Each item's body becomes that change's `brief.md` word for word. Drive the run with `osq plan --next`, then plan the change in a Claude Code session, review it, and `osq approve`.

Landed items are taken out of this file. Each one's text is kept as `brief.md` in its archived change folder, and each finished queue has a summary in Notion under OSQ > Archive. The latest queues drove 237 to 303; earlier queues drove 220 to 236, 189 to 197, 166 to 188, 156 to 165, 145 to 155, 136 to 144, 132 to 135 and 103 to 131.

This queue serves the Rust rewrite, which is designed by hand in Notion (OSQ > Rust Rebuild, with its roadmap database) and built in this repository. Core, every kernel, the CLI dispatch, worktree listing, and the query, inbox, plan, archive, approve, land and report features have landed, with the run feature's prompt and verify pieces. Show, lint, doctor, retry, reject, plan steering, after-land, running one task on pi, `osq spec`, land sync, doctor's setup checks and worktree approve and archive have landed too. The items already planned finish the worktree paths for reject and run, the planner lint rules, archive-commit recovery and land's config tails. The new items port `osq sync`, `osq message` and the first part of `osq report`, close run's remaining worktree gaps, carry archive-commit recovery to Rust, and fix two planning frictions. The loop still needs a design session first, and the server waits.

Items run in parallel. The watcher runs up to `maxConcurrency` approved changes at once when their scopes do not overlap, so an item's `Depends on` line names only what it really needs. Each Rust item works in its own crate, and every feature crate it needs already exists, so no item edits the root `Cargo.toml` or the CLI registry. Items in one crate share scope, so the watcher runs them one after another whatever their `Depends on` line says. Since 262 land rebuilds a conflicting `Cargo.lock`, so tasks do not scope it. Land each change as it archives.

osq reads only the `## [slug]` items below. Everything above the first item is for people.

## [rust-lint-proposal-rules] Rust osq lint checks a proposal's assumptions, human steps, decisions and banned words

Depends on: nothing

### Goal

Rust `osq lint` runs the specs validation and link gates (275), but none of TypeScript's planner rules. Port the proposal rules first, since every plan hits them.

### Context

As of 2026-10-22:

- TypeScript checks them in `src/core/spec/assumptions.ts`, `human-steps.ts`, `decisions-lint.ts` and `banned-word-lint.ts`, collected by `src/core/spec/linter.ts`.
- 275 built `crates/features/lint`: one finding per line, then `<folder>: valid` or a count, non-zero on a blocking finding.
- `rust-config-lint-settings` gives `bannedWords`. The specs kernel parses ADRs (229).

### Requirements

- Rust `osq lint <id>` reports each of these rules' findings with TypeScript's text and severity, in TypeScript's order next to the existing findings.
- Tests run it on fixture changes that pass and that break each rule.

### Non-goals

- The task, scope and verify rules; later items port them.

## [rust-reject-worktree] Rust osq reject rejects a change in its worktree

Depends on: nothing

### Goal

With git on, a change that fails runs in its own worktree. TypeScript reject commits the move there and removes the worktree. Rust reject (272) works only in the checkout with vcs off.

### Context

As of 2026-10-22:

- TypeScript does it in `src/core/lifecycle/reject-vcs.ts`: commit the rejected move in the worktree, then remove the worktree, keeping it and saying why when the commit fails or leaves changes.
- 272 built reject in `crates/features/approve`. `rust-approve-worktree` creates the worktrees this item rejects in.

### Requirements

- With vcs on, Rust `osq reject <id> "<reason>"` on a worktree change writes the rejection files there, commits them on `osq/<folder>` and removes the worktree, as TypeScript does, with its text.
- Each case where TypeScript keeps the worktree keeps it, with TypeScript's reason.
- Tests use scratch repositories and compare with TypeScript's `dist`.

### Non-goals

- Stacked changes.

## [rust-lint-task-rules] Rust osq lint checks tasks' scope, verify and verify_starts

Depends on: rust-lint-proposal-rules

### Goal

After the proposal rules, the lint rules that catch most planning mistakes are the task rules: scope patterns, verify commands that name files and the `verify_starts` claim.

### Context

As of 2026-10-22:

- TypeScript checks them in `src/core/spec/verify-starts.ts`, `verify-paths.ts`, `brace-scope-lint.ts` and `entry-lint.ts`, plus the task checks in `linter.ts`, using the `limits` block.
- `rust-config-lint-settings` gives the limits; `rust-lint-proposal-rules` adds the first planner rules to `crates/features/lint`.
- `rust-lint-proposal-rules` (299) left out the `## Surface` rule (`readSurfaceSection` in `linter.ts`) to port here with the task rules. 299 also gives no finding when `proposal.md`'s frontmatter does not parse, where TypeScript reports a frontmatter error.

### Requirements

- Rust `osq lint <id>` reports these rules' findings with TypeScript's text and severity, in TypeScript's order next to the existing findings.
- It also reports TypeScript's `## Surface` finding and its proposal frontmatter error.
- Tests run it on fixture changes that pass and that break each rule.

### Non-goals

- Traceability, sidecar, impact and generated-move rules; later items port them.

## [rust-run-worktree] The Rust run feature runs a task in its change's worktree and commits it

Depends on: nothing

### Goal

With git on, TypeScript runs each task in the change's osq worktree and commits a verified task there, so parallel changes never share a tree. The Rust run (273) runs only in the checkout.

### Context

As of 2026-10-22:

- TypeScript commits in `commitWorktreeVerifiedTask` and `commitWorktreeDeadTask` in `src/watcher/worktree-commit.ts`, with the worktree found by the runner in `src/watcher/runner.ts`.
- 273, 281 and `rust-run-usage-pause` built `crates/features/run`. The vcs kernel lists worktrees and commits.

### Requirements

- With vcs on, Rust `osq run <id> <n>` runs the executor, verify and scope audit in the change's worktree, and commits a done or dead task on `osq/<folder>` with TypeScript's message.
- With vcs off, run behaves as today.
- Tests use scratch repositories and the committed fake pi.

### Non-goals

- Stacked changes and the baseline verify.

## [rust-run-baseline-verify] The Rust run feature checks a task's verify_starts before the first attempt

Depends on: rust-run-worktree

### Goal

TypeScript runs a task's verify once before the first attempt and kills the task when the result contradicts its `verify_starts`, so a verify that proves nothing never certifies a task. The Rust run skips that check.

### Context

As of 2026-10-22:

- TypeScript runs it in `src/watcher/runner.ts`, keyed by `src/watcher/baseline-key.ts`, with the dead reason from `src/watcher/failure-reason.ts`.
- `run_verify` in the harnesses kernel runs the verify (268). `rust-run-worktree` gives the tree the verify runs in.

### Requirements

- Before a task's first attempt, Rust `osq run <id> <n>` runs its verify once, records the baseline as TypeScript does, and writes TypeScript's dead marker and event when the result contradicts `verify_starts`.
- A later attempt reuses the recorded baseline.
- Tests cover red, green and any for both outcomes.

### Non-goals

- Running the change-level baseline.

## [archive-commit-recovery] A failed archive commit in a worktree is retried and shown, not swallowed

Depends on: nothing

### Goal

When the archive commit in an osq worktree fails, the watcher logs a warning and carries on, leaving the change archived on disk with the move uncommitted. Nothing records the failure, the inbox says `osq land <id>`, and land refuses with a list of uncommitted paths that doesn't say why. A human must then run git by hand, which goes against ADR 003. This happened to 289 on 2026-10-22.

### Context

As of 2026-10-22:

- `commitWorktreeArchive` in `src/watcher/worktree-commit.ts` catches the error from `commitArchive` (`src/core/run/task-commit.ts`) and only calls `logger.warn`. It is called from `archiveCompletedSpec` in `src/watcher/archive-change.ts`.
- Verified tasks already recover from the same failure: `commitPendingVerifiedTasks` commits every done marker the branch lacks on each watcher pass, called from `src/watcher/loop.ts`, and a failed commit returns a `commit_failed` halt.
- Land refuses a dirty worktree in `assertWorktreeClean` in `src/core/vcs/land-checks.ts`.

### Requirements

- When the archive commit fails, the watcher records the failure where the inbox and `osq show` read it, with git's error.
- On a later pass, the watcher makes the missing archive commit for an archived change whose worktree holds the uncommitted move, as it does for pending verified tasks. Success clears the record.
- `osq land <id>` on such a change says the archive commit is missing and what to run, instead of listing paths.
- Tests use scratch repositories with a commit made to fail, for example with a failing pre-commit hook.

### Non-goals

- The Rust archive; `rust-archive-worktree` already fails loudly.
- Finding why git failed for 289.

## [rust-land-limits] Rust land reads its output tail sizes from the config limits

Depends on: nothing

### Goal

Every limit comes from config. Rust land still holds TypeScript's tail sizes as constants: `OUTPUT_TAIL_LINES = 20` in `crates/features/land/src/land/after.rs` (279), and the 20-line command tail and 40-line, 400-character verify excerpt that `rust-land-sync` added. 289 has since given the Rust config the `limits` block they belong to.

### Context

As of 2026-10-23:

- TypeScript reads `limits.cardOutputLines` in `src/core/vcs/land-after.ts`, `sync-verify.ts` and `sync-lockfiles.ts`, and `limits.markerOutputLines` and `limits.markerLineChars` in `src/core/run/verify-excerpt.ts`.
- 289 added `card_output_lines`, `marker_output_lines` and `marker_line_chars` to `Config.limits` in `crates/kernel/config/src/blocks/limits.rs`, with TypeScript's defaults 20, 40 and 400.

### Requirements

- Rust land takes every output tail size from `config.limits`, and no tail size is a constant in the land crate.
- The living rust-land requirements that name 20, 40 or 400 name the limits keys instead, keeping their scenarios.
- A test sets each key to a small value in `osq.toml` and sees the shorter tail.

### Non-goals

- Tail sizes in other crates.

## [rust-sync-message-commands] Rust osq sync and osq message

Depends on: nothing

### Goal

`osq sync <id>` merges a newer default branch into a change's branch without landing it, and `osq message <id>` prints the land commit message an archived change will get. Rust has neither. 294 already merges the default branch inside land, and 256 already builds the land message, so both commands mostly expose code the land crate has.

### Context

As of 2026-10-23:

- TypeScript: `syncCommand` in `src/cli/sync.ts` calls `syncChange` in `src/core/vcs/sync-change.ts`, which refuses with `OSQ_SYNC_NEEDS_GIT` when vcs is off. `src/cli/message.ts` prints `buildSquashMessage` from `src/core/run/squash-message.ts` and exits one when the change is not archived.
- Rust: `crates/features/land/src/land/sync.rs` (294) runs the merge, with spec and `Cargo.lock` rebuilds and the land-stop record. `crates/features/land/src/land/message.rs` (256) builds the squash message. A feature never depends on another feature, so both commands go on `LandFeature`, as 298 put `spec` on `ShowFeature`.

### Requirements

- Rust `osq sync <id>` merges the default branch into `osq/<folder>` as land's sync does, and prints TypeScript's text for a clean merge, a rebuilt conflict, a stop and vcs off.
- Rust `osq message <id>` prints the message TypeScript prints for an archived change, and TypeScript's refusal and exit code otherwise.
- Goldens are printed by TypeScript's `dist` from scratch repositories and committed in the change folder.

### Non-goals

- The bridge commit for stacked changes.

## [rust-report-summary] Rust osq report prints the summary and current task counts

Depends on: nothing

### Goal

`osq report` is how a human sees how osq is doing, and Rust has no `osq report`. TypeScript's report is large, so port it in slices, starting with the header, `Specs Summary:` and `Now:` sections, which read only the current change files.

### Context

As of 2026-10-23:

- TypeScript builds the report in `buildMetricsReport` and prints it in `formatMetricsReport`, both in `src/core/report/report.ts`, called from `src/cli/report.ts`. `--json` prints the sorted report object through `serializeSortedJson`.
- Rust: `crates/features/report` holds `osq query` (243, 286). The storage kernel reads every change's marker files.

### Requirements

- Rust `osq report` prints `osq Delivery Metrics Report`, then the `Specs Summary:` and `Now:` sections with TypeScript's text and counts, including the completion rate.
- Rust `osq report --json` prints the same fields under TypeScript's keys, sorted as TypeScript sorts them.
- Goldens are printed by TypeScript's `dist` from fixture projects and committed in the change folder.

### Non-goals

- The `History:` section and every later section; later items port them.
- `--since` and `--until`.

## [rust-run-verify-tail] The Rust run feature cuts verify output by the config limits

Depends on: nothing

### Goal

Every limit comes from config. The Rust run verdict cuts verify output to a hard-coded 2000-byte tail, where TypeScript uses the line and character limits that 289 gave the Rust config.

### Context

As of 2026-10-23:

- Rust: `OUTPUT_TAIL_BYTES` in `crates/features/run/src/feature/verdict.rs`.
- TypeScript: `tailVerifyOutput` and `excerptVerifyOutput` in `src/core/run/verify-excerpt.ts`, using `limits.markerOutputLines` and `limits.markerLineChars`.
- 289 added `marker_output_lines` and `marker_line_chars` to `Config.limits` in `crates/kernel/config/src/blocks/limits.rs`, with TypeScript's defaults 40 and 400. `rust-land-limits` (303) makes the same fix in land.

### Requirements

- The Rust run cuts verify output in dead markers and events as TypeScript does, with the sizes from `config.limits`, and no tail size is a constant in the run crate.
- A test sets each key to a small value in `osq.toml` and sees the shorter excerpt.

### Non-goals

- Tail sizes in other crates.

## [rust-run-worktree-checks] The Rust run feature refuses a bad worktree and halts when its commit fails

Depends on: rust-run-worktree

### Goal

`rust-run-worktree` (301) runs tasks in the change's worktree but left out TypeScript's safety checks: it doesn't refuse a worktree that is off its branch or dirty, and a failed task commit just fails the run. TypeScript halts the change with a reason a human can retry.

### Context

As of 2026-10-23:

- TypeScript names the halts `worktree_off_branch`, `worktree_dirty` and `commit_failed` in `src/watcher/worktree-run.ts`. `src/watcher/commit-catch-up.ts` makes the missing commits on a later pass within `gates.commitRetries`.
- 301 built the worktree run in `crates/features/run`, with `patch` and `discard` in the vcs kernel.
- `gates.commitRetries` (default 2) is in `src/core/foundation/config-gates.ts`. The Rust config has no `gates` block yet, so this item adds one with only that key.

### Requirements

- Before spawning the executor, Rust `osq run <id> <n>` halts the change with TypeScript's marker, event and text when its worktree is off `osq/<folder>` or has uncommitted changes.
- When a task commit fails, the run writes TypeScript's `commit_failed` halt with git's error, and a later `osq run` of that change first makes the missing commit and clears the halt, within `gates.commitRetries` tries, as the catch-up does.
- Tests use scratch repositories, with the commit made to fail by a failing pre-commit hook.

### Non-goals

- Regressed and recertification commits, and stacked changes.

## [rust-archive-commit-failed] Rust archive and land handle a failed archive commit as TypeScript does

Depends on: archive-commit-recovery

### Goal

`archive-commit-recovery` makes TypeScript record a failed archive commit, make it later, and have land say what to run. Rust archive (295) fails loudly but records nothing, and Rust land lists the uncommitted paths. Both must write and read the same files as TypeScript, so either language can pick up the other's change.

### Context

As of 2026-10-23:

- `archive-commit-recovery` defines the record, the `osq retry <id> change` path and land's refusal. Read its archived change folder once it lands, not this brief.
- Rust: `crates/features/archive` commits the move with `osq: <id> archived` (295). `crates/features/land/src/land/checks.rs` refuses a dirty worktree. `crates/features/retry` handles `change` retries (277, 290).

### Requirements

- When the archive commit fails, Rust `osq archive <id>` writes TypeScript's failure record with git's error and exits non-zero.
- Rust `osq retry <id> change` on that record makes the archive commit and clears the record, with TypeScript's text.
- Rust `osq land <id>` on such a change refuses with TypeScript's text instead of listing paths.
- Tests use scratch repositories with a failing pre-commit hook and compare the files with TypeScript's `dist`.

### Non-goals

- The watcher's catch-up pass; that belongs to the loop.

## [plan-queue-slug] osq plan can plan one queue item out of order

Depends on: nothing

### Goal

`osq plan --next` always takes the first eligible queue item, so planning a later item means planning every eligible item before it. `osq plan <slug> -p` for a queue slug ignores the queue brief and makes an empty scaffold. Planning 303 forced planning 300 to 302 first.

### Context

As of 2026-10-23:

- `planCommand` in `src/cli/plan.ts` takes `--next`, handled by `prepareQueueSelection` and `createQueueChange` in `src/cli/plan-queue.ts`. Without `--next` it steers an existing change or creates an empty one.
- The queue parser sits in `src/core/status/queue-parser.ts`, and `osq queue` prints which items are eligible and which have unmet dependencies.

### Requirements

- `osq plan --next <slug>` plans that queue item as `--next` plans the first one: same brief, same queue hash and same handoff.
- It refuses, with a line naming the reason, an unknown slug, an item that already has a change, and an item whose `Depends on` is unmet.
- `osq plan --next` with no slug behaves as today.

### Non-goals

- The Rust plan feature; a later item ports it.
- Reordering `queue.md`.

## [plan-report-limits] The plan report takes its sizes from config in both languages

Depends on: nothing

### Goal

Every limit comes from config, but the report that opens each plan prompt still hard-codes sizes. TypeScript reads most of them from the `planning` block but keeps the repository record's three sizes as constants. Rust reads none of them: its config has no `planning` block, so the plan feature hard-codes all eight.

### Context

As of 2026-10-23:

- TypeScript: `planning.disclosures` (`recentChanges` 3, `maxCharacters` 4000) and `planning.history` (`minimumTasks` 30, `recentTasks` 100, `maxCharacters` 1500) in `src/core/foundation/config-planning.ts`. The record sizes `REPOSITORY_RECORD_MIN_MEASURED_TASKS` (5), `REPOSITORY_RECORD_MAX_ARCHIVED_CHANGES` (20) and `REPOSITORY_RECORD_MAX_DEAD_OUTCOMES` (10) are constants in `src/core/report/report.ts`.
- Rust: `crates/features/plan/src/next/report/hints.rs` (30, 100, 1500), `record.rs` (5, 20, 10, and the "too small" text with 5 in it) and `disclosures.rs` (3, 4000). ADR 029 and 252 give the config kernel one module per block under `crates/kernel/config/src/blocks/`.

### Requirements

- TypeScript gains a `planning.record` block with the three record sizes and today's values as defaults, and `report.ts` reads it.
- The Rust config kernel reads the `planning` block's `disclosures`, `history` and `record` tables with TypeScript's keys, defaults and refusals, and the Rust plan report takes every size from it.
- The record's "too small" text names the configured value in both languages.
- With the defaults, every plan prompt and golden stays byte for byte the same.
- Tests in both languages set a key to a small value and see the shorter section.

### Non-goals

- Changing any default.
- `planning.idleGapMinutes` and `planning.prices` in Rust.

