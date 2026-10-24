# osq queue

The remaining work on osq itself, as an osq brief queue.

Each item's body becomes that change's `brief.md` word for word. Drive the run with `osq plan --next`, then plan the change in a Claude Code session, review it, and `osq approve`.

Landed items are taken out of this file. Each one's text is kept as `brief.md` in its archived change folder, and each finished queue has a summary in Notion under OSQ > Archive. The latest queues drove 237 to 318; earlier queues drove 220 to 236, 189 to 197, 166 to 188, 156 to 165, 145 to 155, 136 to 144, 132 to 135 and 103 to 131.

This queue serves the Rust rewrite, which is designed by hand in Notion (OSQ > Roadmap, with its roadmap database) and built in this repository. Core, every kernel, the CLI dispatch and worktree listing have landed, and Rust runs approve, reject, run, archive, land, sync, message, report (summary and History counts), query, inbox, show, status, spec, lint, doctor, retry, queue and plan. The items already planned finish the report's History section, add feature events (ADR 030), steered approval and syncing an active change. The rest port steered, default-branch and stacked approval and strict ids, then the flags and doctor checks Rust still lacks, the next report sections and `osq manual`, each in its own crate so they run in parallel. The loop still needs a design session first, and the server waits.

Items run in parallel. The watcher runs up to `maxConcurrency` approved changes at once when their scopes do not overlap, so an item's `Depends on` line names only what it really needs. Each Rust item works in its own crate, and every feature crate it needs already exists, so no item edits the root `Cargo.toml` or the CLI registry. Items in one crate share scope, so the watcher runs them one after another whatever their `Depends on` line says. Since 262 land rebuilds a conflicting `Cargo.lock`, so tasks do not scope it. Land each change as it archives.

osq reads only the `## [slug]` items below. Everything above the first item is for people.

## [rust-report-history-counts] Rust osq report prints the History section's counts

Depends on: nothing

### Goal

305 ported the report's header, `Specs Summary:` and `Now:`. The next part is `History:` up to and including `Scope regressions:`, which tells a human how attempts, verifies and deaths went.

### Context

As of 2026-10-24:

- TypeScript prints it in `formatReport` in `src/core/report/report.ts`, from `Total attempts` through `Requeued for agent`, with `formatRetryHistoryLines` (`report-retries.ts`) and the pre-spawn lines (`report-pre-spawn.ts`).
- 305 built `crates/features/report` with goldens against TypeScript's `dist`. Storage reads event tables (211) and task outcomes (228).

### Requirements

- Rust `osq report` prints those History lines with TypeScript's text and numbers, in TypeScript's order after `Now:`, and in `--json`.
- Tests compare with TypeScript's `dist` on a fixture history with retries, dead reasons, rejections and scope regressions.

### Non-goals

- Rework, disclosures, dependencies, sizes and every later section; `rust-report-history-sizes` ports them.
- `--since` and `--until`.

## [rust-report-history-sizes] Rust osq report prints rework, disclosures, dependencies and sizes

Depends on: rust-report-history-counts

### Goal

Finish the report's `History:` section after its counts: the rework, disclosures and dependencies blocks and the size buckets that planners use to size tasks.

### Context

As of 2026-10-24:

- TypeScript: `formatRework`, `formatDisclosures`, `formatDependencies` and the `Size by scope files`, `Resolver 2 starts at`, `Size by acceptance lines` and largest-pass lines in `src/core/report/report.ts`, with `report-dependencies.ts`, `record-rework.ts`, `record-disclosures.ts` and `scope-size.ts`.
- The Rust plan prompt's repository record (255, 314) may already compute some of these measures; reuse what fits.

### Requirements

- Rust `osq report` prints the rest of the History section with TypeScript's text, in its order, and in `--json`.
- Tests compare with TypeScript's `dist` on fixtures that fill each block and leave each empty.

### Non-goals

- `Coverage:`, `Planning:` and every later section.

## [rust-feature-events-adr] Rust features react to events through one delivery entry point

Depends on: nothing

### Goal

ADR 022 says features never call each other and talk through event files, and ADR 028 left "loop hooks, the events a feature reacts to" for later. Steered approval is the first place that needs them: after a re-approval, retry's code must clear the triggers, and approve may not call the retry crate. This change writes the ADR and builds the mechanism, so approve can emit an event and retry can react to it. It also gives the loop and the server their hook.

### Context

As of 2026-10-24, decided with the human in a design session:

- Trait: `Feature` gains `reacts_to() -> Vec<EventKind>` (plain data, like `commands()`, default empty) and `react(&self, reaction: &Reaction<'_>) -> Result<Output, FeatureError>`. `Reaction<'a>` is a `#[non_exhaustive]` core struct holding the root, the change and `&'a Envelope`; it is declared with a lifetime now so a borrowed database transaction can join it later without changing any handler. Storage is `rusqlite`, which works through `&`, so no `&mut`.
- Delivery: one kernel entry point, in the loop kernel, runs a command and then delivers its new events. The CLI, the future server (ADR 014) and the future loop all call it, and no app delivers on its own. One pass: events a reaction appends are delivered by the next command or loop pass, so there are no cycles. Reactions may not call the entry point.
- Handled-record: `.run/delivered/<feature>` per change holds a byte offset per event file. Delivery is at-least-once and handlers must be idempotent, as with Kafka consumer offsets or EventStoreDB checkpoints. Delivery reads from the offset and consumes only up to the last `\n`, since TypeScript and Rust append unlocked, each writing a whole line in one call. A file whose size equals its cursor is skipped with one size check; a file shorter than its cursor is an error. Only active changes are delivered. Later the record becomes a database row committed in the handler's transaction.
- Lock: `.run/delivery.lock` per change, separate from the event files, taken once with std `File::lock` (Rust 1.89, so `rust-version` goes from 1.85 to 1.89), never deleted, git-ignored like `.run/running/`, released by the kernel on exit. A lock error fails loudly. osq assumes a local filesystem for `.run/`.
- Cursor writes are durable: temp file, `sync_all`, rename, then fsync the directory under `#[cfg(unix)]`. No Rust code does this today, so a storage-kernel helper is new here.
- Failure: the command's output, then `<feature> could not handle <event> for <change>: <error>`, and exit 1. The cursor stays, so the next delivery tries again.
- In-house on std and core's event parser. No event-sourcing framework (`cqrs-es`, `esrs`, `eventually`): each brings its own storage and async runtime, and ADR 025 keeps today's files. No broker, and no in-memory bus as truth (ADR 022).
- First user: approve appends an `approved` event to `change.jsonl` naming the triggers it saw, and retry reacts by clearing them (queue item `rust-approve-steered`, change 325, held until this lands). TypeScript reads `change.jsonl` too, so check that it tolerates a new event type.

### Requirements

- A new Rust ADR records these decisions, and ADR 028's "Loop hooks" line points to it.
- Core gains the trait methods, `EventKind`, `Reaction` and the `approved` event; the loop kernel gains the delivery entry point with cursor, lock and failure output; the storage kernel gains the durable write; the CLI dispatches through the entry point.
- Tests prove: at-least-once delivery after a crash between handler and cursor, a partial last line left for later, the size-check skip, a shorter file failing, a held lock refused loudly, and failure output with exit 1.

### Non-goals

- Steered approval itself; `rust-approve-steered` uses this next.
- A shared event appender and durable marker renames; roadmap rows.
- The server and the loop; they call the entry point when they are built.

## [rust-approve-steered] Rust osq approve re-approves a steered change

Depends on: nothing

### Goal

When a running change hits a steering trigger, the human edits the plan and runs `osq approve` again. Rust approve refuses every change with a steering trigger ("Steering refusal"), so steering still needs TypeScript.

### Context

As of 2026-10-24:

- TypeScript re-approves a steered change through `src/cli/approve.ts`; `deriveSteering` in `src/core/status/steering.ts` gives the triggers. Done tasks stay done (128).
- Rust approve (272, 292) has the steering refusal and worktree approval; `osq plan <id>` already writes the steering prompt (278, 291).

### Requirements

- Rust `osq approve <id>` on a steered change, in the checkout or its worktree, writes the same files, markers, events and commits as TypeScript, with its text, and keeps done tasks.
- The cases TypeScript still refuses stay refused with its text.
- Tests use scratch repositories and compare with TypeScript's `dist`.

### Non-goals

- Stacked changes; `rust-approve-stacked` follows.
- Auto-steer.

## [rust-approve-stacked] Rust osq approve stacks a change on the approved changes it overlaps

Depends on: rust-approve-steered

### Goal

Rust approve refuses a change that would stack ("Stacked approval refusal"). With parallel lanes, overlapping changes are common, so Rust approve should stack them as TypeScript does.

### Context

As of 2026-10-24:

- TypeScript: `awaitedForApproval` in `src/core/spec/stack-overlap.ts` picks the changes to stack on; approve writes `.run/stacked-on` and creates the worktree on the chain tip (170).
- Rust approve has the refusal with the same selection.

### Requirements

- Rust `osq approve <id>` on a change TypeScript would stack writes the same `.run/stacked-on`, branch, worktree, events and text as TypeScript.
- Tests use scratch repositories with one and two stacked changes and compare with TypeScript's `dist`.

### Non-goals

- Running, rejecting or landing stacked changes in Rust.

## [rust-land-remove-worktree] Rust osq land removes a landed change's worktree

Depends on: nothing

### Goal

Rust land prints `<folder> has already landed; Rust land does not remove worktrees yet`. Port the worktree removal with the rules `land-removes-worktree-folder` gives TypeScript.

### Context

As of 2026-10-24:

- `crates/features/land/src/land/text.rs` has the placeholder line; the vcs kernel has `worktree_remove`.
- `land-removes-worktree-folder` defines moving `.run/logs`, removing ignored files, no timeout on the delete, pruning and the failure text.

### Requirements

- Rust `osq land <id>` removes the worktree as TypeScript does after that item, with its text and exit codes, including the cleanup on a second land.
- Tests use scratch repositories and compare with TypeScript's `dist`.

### Non-goals

- Stacked changes.

## [rust-sync-active-change] Rust osq sync syncs an active change and recertifies its done tasks

Depends on: rust-land-remove-worktree

### Goal

Rust `osq sync` (304) refuses an active change; TypeScript merges the default branch into it and reruns each done task's verify to recertify it. Port that.

### Context

As of 2026-10-24:

- TypeScript: `src/core/vcs/sync-main.ts` with recertification; it finds active changes with `holdsChange` (`.run/approved`).
- Rust sync lives in `crates/features/land/src/land/sync_command.rs` and `sync.rs`; 297 built scope recertification in the retry crate, which land cannot depend on, so shared code moves to a kernel.

### Requirements

- Rust `osq sync <id>` on an active worktree change writes the same merge commit, markers, events and text as TypeScript, recertifying done tasks.
- The active-change lookup matches TypeScript's `holdsChange`.
- The refusal while a watcher runs (`sync-refuses-while-watching`) is kept when that item has landed.
- Tests use scratch repositories and compare with TypeScript's `dist`.

### Non-goals

- Stacked changes.

## [rust-change-id-strict] Every Rust command resolves a change id strictly through one lookup

Depends on: rust-approve-stacked, rust-sync-active-change, rust-report-history-sizes

### Goal

On 2026-10-23 `osq land 310]` landed 310. TypeScript's `matchesFolder`, and Rust ports such as `padded()` in `crates/features/land/src/land/find.rs`, keep only the leading digits, so `310]`, `310x` and `310-wrong-slug` all match 310, and `31O` matches 031. Rust should accept only a real id and refuse anything else.

### Context

As of 2026-10-24:

- Each Rust feature crate matches ids on its own (land, retry, show, approve, plan, archive, inbox).
- This is an improvement over TypeScript, which stays as it is.

### Requirements

- One kernel function resolves a change id for every Rust command: digits that name a change, the full folder name, or the slug alone when TypeScript accepts it. Anything else fails with a message that names the input and the accepted forms.
- Every feature crate uses it and keeps no matcher of its own.
- Tests cover each accepted form and each refused form above, for every command that takes an id.

### Non-goals

- TypeScript's lookup.

## [rust-approve-default-branch-steering] Rust osq approve re-approves a change steered by a default-branch trigger

Depends on: rust-approve-steered

### Goal

Change 325 re-approves a change steered by run triggers only. A change can also be steered because the default branch moved under it (129: a conflict restarts it from main). Rust approve should handle that case too.

### Context

As of 2026-10-24:

- TypeScript handles default-branch triggers in `src/cli/approve.ts` and `src/core/status/steering.ts`; 129 decided a conflict restarts from main and land commits stop on the branch.
- ADR 030 (326) lets a feature react to the `approved` event; 325 makes retry react to it for run triggers.

### Requirements

- Rust `osq approve <id>` on a change steered by a default-branch trigger writes the same files, markers, events and commits as TypeScript, with its text.
- Approve never calls another feature; any follow-up work runs as a reaction under ADR 030.
- Re-approving a default-branch stop with no plan edit works. TypeScript fails with git's `nothing to commit` because it commits `osq: <id> replanned` first (seen on 319, 2026-10-24); Rust skips that commit when nothing changed.
- Tests use scratch repositories and compare with TypeScript's `dist`.

### Non-goals

- Stacked changes.
- Auto-steer.

## [rust-show-json] Rust osq show --json prints TypeScript's change details JSON

Depends on: nothing

### Goal

`osq show <id> --json` is how tools and agents read one change. Rust `show` prints only the text view and refuses `--json`. Port the JSON view.

### Context

As of 2026-10-24:

- TypeScript: `formatShowJson` in `src/core/status/show-output.ts`, from the same `SpecDetails` the text view uses (`src/cli/show.ts`).
- Rust `crates/features/show` derives the text view's facts: status and next step, dependency readiness, git state and land lines.

### Requirements

- Rust `osq show <id> --json` prints TypeScript's JSON byte for byte for checkout, worktree and archived changes, with vcs on and off.
- It reuses show's derivations rather than copying them.
- Tests compare with TypeScript's `dist` on fixture projects.

### Non-goals

- `osq status --json`; TypeScript has none.

## [rust-inbox-json] Rust osq inbox --json prints TypeScript's inbox JSON

Depends on: nothing

### Goal

The dashboard and scripts read the inbox as JSON. Rust `osq inbox` prints the text view only. Port `--json`.

### Context

As of 2026-10-24:

- TypeScript: `src/cli/inbox.ts` prints `JSON.stringify(inbox, null, 2)` of the same inbox model the text view renders, and `osq --json` with no command does the same.
- Rust `crates/features/inbox` builds every card type TypeScript has (needs-you, running, landed, archived, paused, after-land, autopilot stop, validator failing).

### Requirements

- Rust `osq inbox --json` prints TypeScript's JSON byte for byte for every card type, and writes the same look cursor as the text view does.
- Bare `osq --json` gives the same output when the CLI already passes the flag to the inbox command; otherwise that is left for later.
- Tests compare with TypeScript's `dist` on the inbox crate's fixtures.

### Non-goals

- `--follow`; it needs the loop.

## [rust-lint-json-repository] Rust osq lint takes several ids, --json and --repository

Depends on: nothing

### Goal

Rust `osq lint` lints one change and prints text. TypeScript lints several ids at once, prints findings as JSON for tools, and lists every repository finding with `--repository`. Port those.

### Context

As of 2026-10-24:

- TypeScript: `src/cli/lint.ts`: several ids, `--json`, `--repository` (`printRepositoryFindings`, `dedupeFindings`), and the count line `repository: <n> findings about other changes and living specs; osq lint --repository lists them`.
- Rust: `crates/features/lint` (275, 299) lints one change and prints that count line.

### Requirements

- Rust `osq lint [ids...]`, with `--json` and `--repository`, prints TypeScript's output and exit codes for one id, several ids and none.
- Tests compare with TypeScript's `dist` on fixture projects with valid, warning and failing changes.

### Non-goals

- New lint rules.

## [rust-plan-brief-notes] Rust osq plan takes --brief, --notes and --print

Depends on: nothing

### Goal

Rust `osq plan` plans the next queue item, a new change and a steering prompt, but refuses `--brief`, `--notes` and `--print`. A human uses them to plan from a brief file or stdin, pass notes to the planner, and print the prompt for a planner they start themselves.

### Context

As of 2026-10-24:

- TypeScript: `src/cli/plan.ts` reads `--brief <file>` or `-` for stdin (`readBriefInput`, `writeBriefAndManifest`), adds `--notes <text>` to the prompt, and with `-p`/`--print` writes only the prompt to stdout.
- Rust: `crates/features/plan` has "Plan arguments", "Plan handoff" and "Plan prompt" for `--next` and `--replan`.

### Requirements

- Rust `osq plan` with `--brief`, `--notes` and `--print`, alone and with `--next` or a name, writes the same files and prints the same text as TypeScript, including its refusals.
- Tests compare with TypeScript's `dist`.

### Non-goals

- `--run` and `--session`; they start a planner process.

## [rust-doctor-checks] Rust osq doctor prints TypeScript's validator, languages, prices and containment checks

Depends on: nothing

### Goal

On this repository TypeScript's `osq doctor` prints 16 checks and Rust prints 7. Port the missing checks so Rust doctor tells a human the same things.

### Context

As of 2026-10-24:

- TypeScript checks Rust lacks: `harness-containment` and the harness lines for harnesses other than pi (`src/core/foundation/doctor.ts`), `validator` (the pinned OpenSpec version), `languages` (`doctor-languages.ts`), `planning-prices` (`doctor-prices.ts`), and `validator-harness`, `validator-harness-version`, `validator-model` and `validator-runs` (`doctor-validator.ts`).
- Rust: `crates/features/doctor` has the pi, change, managed-block, decision and git checks.

### Requirements

- Rust `osq doctor` prints each of those checks with TypeScript's name, status, text and order, and fails as TypeScript does.
- A check that needs config Rust does not read yet reads it through the config kernel, with TypeScript's default.
- Tests compare with TypeScript's `dist` on fixture projects, with fake harness programs where a check runs one.

### Non-goals

- Running the validator.

## [rust-report-traceability-coverage] Rust osq report prints the Traceability, Validation and Coverage sections

Depends on: rust-report-history-sizes

### Goal

After the History section, TypeScript's report prints `Traceability:`, `Validation:` and `Coverage:`. Port them, in order, as the next part of the report.

### Context

As of 2026-10-24:

- TypeScript: `src/core/report/report-traceability.ts`, `report-validation.ts`, and the `Coverage:` block in `formatReport` in `src/core/report/report.ts`, with their `--json` members.
- Rust `crates/features/report` prints through the History section once `rust-report-history-sizes` lands, with goldens from TypeScript's `dist`.

### Requirements

- Rust `osq report` prints those three sections with TypeScript's text and numbers, after History, and in `--json`.
- Tests compare with TypeScript's `dist` on fixtures that fill each section and leave each empty.

### Non-goals

- `Planning:` and every later section.

## [rust-manual-command] Rust osq manual keeps uncommitted edits as a manual change

Depends on: rust-feature-events-adr

### Goal

`osq manual "<comment>" [paths...]` is how a human keeps a hand edit on the default branch with a record the planner sees. Rust has no `manual` command.

### Context

As of 2026-10-24:

- TypeScript: `src/cli/manual.ts`, `src/core/vcs/manual-edits.ts` and `manual-records.ts`; version-control "Manual edit keeping", "Manual edit commit" and "Manual edit record", cli-foundation "Manual command" and "Manual edits configuration".
- Rust storage reads manual edit records (`read_manual_edits`), and the plan prompt prints them.
- A new feature crate edits the root `Cargo.toml` and the CLI registry, which 326 also edits, so this waits for it.

### Requirements

- Rust `osq manual` writes the same commit, record and text as TypeScript, with its refusals, for all paths and for named paths.
- Tests use scratch repositories and compare with TypeScript's `dist`.

### Non-goals

- Manual edits inside a worktree, unless TypeScript supports them.

## [rust-init-command] Rust osq init scaffolds a project

Depends on: rust-manual-command

### Goal

`osq init` is the first command on a new project. Rust has none, so a Rust-only osq could not start a project. Port it, writing `osq.toml` in place of `osq.config.ts` (ADR 025, ADR 029).

### Context

As of 2026-10-24:

- TypeScript: `src/cli/init.ts` copies `templates/` and writes the config; the copied files belong to the consumer.
- Rust reads `osq.toml` through the config kernel (ADR 029).
- A new feature crate edits the root `Cargo.toml` and the CLI registry, so this follows `rust-manual-command`.

### Requirements

- Rust `osq init` writes the same folders and files as TypeScript, with `osq.toml` holding the defaults in place of `osq.config.ts`, and the same text and refusals.
- Tests run it in scratch folders and compare with TypeScript's `dist`, with the config file as the one intended difference.

### Non-goals

- `osq setup` and the harness configuration.

## [repo-counts-tracked-files] The watcher counts the repository from git's tracked files, with line counts cached by blob

Depends on: nothing

### Goal

Before each task the watcher measures the repository's size (`repoFiles`, `repoLines`). It walks the whole worktree and reads every file to count its lines, skipping only a fixed list of folders that lacks `target/`. Each Rust worktree holds 13 to 20 GB of Cargo build output, so on 2026-10-24 three task starts kept the watcher at 100% CPU for minutes before any executor ran. Count what the repository is, the files git tracks, and read each file's content only once.

### Context

As of 2026-10-24:

- TypeScript: `gatherRepoCounts` in `src/watcher/measures.ts` walks the folder with `IGNORED_DIRS` from `src/core/spec/import-graph.ts` and reads every file whole, binary files included, before it drops those holding a NUL byte.
- `git ls-files` lists this repository's 12,702 tracked files in a few milliseconds, and `git ls-files -s` gives each one's blob hash without reading it. Reading all of them still takes about 4.5 seconds, mostly the archive.
- ADR 008: the SQLite read index is derived only from files, and deleting it changes nothing but speed. A blob hash names exact content, so a line count keyed by it never goes stale.
- ADR 017: language-specific rules sit behind the languages adapter, so the fix should not hard-code a Rust folder.
- Finished worktrees keep their build output: 309, 312, 314 and 315 still hold about 17 GB under `target/`. Rust `land` removes worktrees since 328; TypeScript `land` does not.

### Requirements

- `repoFiles` counts the files git tracks in the tree the task runs in, and `repoLines` their lines, counting text files only as today.
- Line counts are cached in the read index keyed by blob hash, so a task start reads only blobs the index has not seen. Deleting the index gives the same counts, only slower.
- A tree that is not a git repository falls back to today's walk.
- Tests cover a worktree with a large ignored build folder, a changed file, a deleted index and a folder with no git.

### Non-goals

- Removing finished worktrees in TypeScript `land`.
- Other measures, such as scope counts and import fan-in.

## [overlap-wait-survives-reapproval] A change keeps waiting for an overlapping change after that change is re-approved

Depends on: nothing

### Goal

When approve finds that a change rewrites capabilities an approved change also rewrites, it writes an overlap line to `.run/stacked-on`, and the change waits for that one to land. A re-approval of the awaited change silently drops that wait, so the two run independently, and whichever lands second finds its requirements changed on main.

### Context

As of 2026-10-24:

- `awaitedDependencies` in `src/core/spec/stack-dependencies.ts` keeps an overlap line only while its recorded hash equals the dependency's current approved hash (`if ((state.hash ?? '') !== line.hash) continue;`). After a steer and re-approval the hashes differ, and the line is ignored everywhere it is read: the watcher's start, sync (`sync-change.ts`), `osq show`'s runs-after and the land checks.
- What happened: 326 was re-approved at 12:04 and again at 13:52:04. 334 was approved at 13:52:14 and recorded `326 sha256:696c87… overlap rust-cli,rust-core`, the 12:04 hash. 334 then ran on main, landed at 15:32, and rewrote rust-cli "Command dispatch". 326, which rewrites the same requirement, regressed with `requirement_changed` and needed a steer.
- Approve also recorded a hash that was already stale ten seconds after the dependency's re-approval, so the recorded hash can lag even with no later steer.
- The Rust scheduler (ADR 027) and Rust approve may port the same rule.

### Requirements

- An overlap line whose dependency is still approved or archived but not landed keeps the change waiting, whatever hash the line records.
- A re-approval of the dependency is still visible: `osq show` and the inbox name the overlap and say the dependency was re-approved since, so a human can check that the overlap still holds.
- A dependency that is rejected or landed ends the wait, as today.
- A scenario test replays this sequence: B is approved with an overlap on A, A is steered and re-approved, and B does not start until A lands.
- If Rust already ports the hash check, the Rust code gets the same fix in its own crate.

### Non-goals

- Recomputing the overlap's capabilities after a re-approval.
- Declared `depends_on` entries, which never compare hashes.

## [worktree-remove-not-timed-out] Removing a big worktree is never cut off halfway

Depends on: nothing

### Goal

When osq removes a change's worktree, the removal finishes or fails cleanly, so a large build folder never leaves a half-deleted worktree that git no longer knows.

### Context

- `GitVcs.worktreeRemove` (`src/core/vcs/git-vcs-write.ts`) runs `git worktree remove` through `ctx.run`, which is bounded by `timeouts.gitSeconds` (10 s by default, set for quick git reads).
- On 2026-10-24 `osq approve 326` merged main into `osq/326`, the merge conflicted, and `restartDefaultBranchBranch` (`src/core/spec/approve-default-branch-restart.ts`) called `worktreeRemove` on a worktree holding a 20 GB `target/`. The removal was killed partway: `.git`, `crates/`, `decisions/` and `scripts/` were gone, while `target/`, `node_modules/` and `src/` stayed. `git worktree list` showed it as prunable.
- The `osq: 326 approved` commit had already landed on the branch, but the `regressed` marker stayed. The next `osq approve 326` failed with `git is off: not a git repository`. Recovery took a manual move-aside, `git worktree prune`, and a watcher restart so `recreateWorktrees` rebuilt the worktree.
- Land's worktree cleanup and any other `worktreeRemove` caller share the same bound.

### Requirements

- `git worktree remove` runs under its own timeout config key, not `timeouts.gitSeconds`, with a default long enough for a multi-gigabyte build folder.
- When the removal fails or times out during a restart, approve stops with a message that names the worktree and the recovery steps: move the folder aside, run `git worktree prune`, and restart `osq watch` so it recreates the worktree. The change's markers stay as they were, so a second `osq approve` can finish the restart.
- A scenario test covers a removal that fails mid-restart: approve stops with that message and leaves the markers unchanged.

### Non-goals

- Making `git worktree remove` faster, for example by deleting `target/` first.
- The Rust vcs kernel, whose land wiring has its own timeouts.
- Recovering a broken worktree inside `osq approve`; the watcher's `recreateWorktrees` already does that on restart.

## [rust-equivalent-mutant-skips] Executors mark equivalent mutants with a reasoned skip instead of bending code

Depends on: nothing

### Goal

When cargo-mutants reports a mutant no test can tell apart from the original, the executor marks it with one known skip and a written reason, instead of reshaping working code to dodge the gate.

### Context

- The Rust verify fails on any missed mutant in a change's touched lines (`scripts/mutants-rust.sh`, ADR 024), and `.cargo/mutants.toml` is outside every task's scope.
- Executors found `#[cfg_attr(docsrs, mutants::skip)]` on their own. Nothing sets `docsrs` here, so it needs no crate, and cargo-mutants still reads the attribute. There are 5 such skips today (changes 274, 287 and 306). Three have a comment saying why the mutant is equivalent; `crates/features/show/src/status/snapshot.rs` and `crates/features/show/src/archived/section/land/read.rs` have none, and their reasons live only in result files.
- Other executors bent code instead: 247 and 296 (twice) reshaped checks and comparisons, and 326 task 1 gave `reacts_to` an empty `Vec` with spare capacity only so a test could kill the `vec![]` mutant.

### Requirements

- The executor instructions (`AGENTS.md` and the Rust section of `CLAUDE.md`, plus the templates `init` copies, if they carry the Rust rules) say: prefer simplifying the code when that removes the mutant; when the code is already as simple as it gets and the mutant is equivalent, mark the function `#[cfg_attr(docsrs, mutants::skip)]` with a comment directly above it that starts `equivalent mutant:` and says why; never reshape code only to kill a mutant.
- A check run by `sh scripts/verify-rust.sh` fails when any `mutants::skip` in `crates/` lacks an `equivalent mutant:` comment directly above it (doc or line comment), naming each file and line.
- The two existing skips without a reason gain one.
- The check has tests for a skip with a reason, a skip without one, and a crate without skips.

### Non-goals

- Judging whether a reason is true; that stays with human review and, later, the validator.
- Removing 326's spare-capacity workaround; a later change can take it out.
- Listing new skips in `osq land` or `osq show`.
- Moving to the `mutants` crate's own attribute.
