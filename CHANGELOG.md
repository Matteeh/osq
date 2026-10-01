# Changelog

All notable changes to `osq` are documented in this file.

## [Unreleased]

- `osq query "<select>"` runs one read-only `SELECT` over five history tables (`changes`, `requirements`, `tasks`, `dead_attempts`, `disclosures`) and prints rows, or JSON with `--json`. `PLANNER.md` and the executor protocol point agents at it instead of event files (134).
- `osq report` reads archived event streams through a SQLite index at `.osq/index.sqlite`, using Node's built-in `node:sqlite`. Deleting it only costs speed (ADR 008) (133).
- `osq report` reads and parses each event file once per run, without holding verify logs in memory: about 4.0 s to 2.4 s on osq's own repository (132).
- `osq digest [ids...]` prints a deterministic Markdown or JSON digest of archived changes, by id or by `--since`/`--until` range, with `--out` and `--no-cost` (130).
- A change the default branch stops — a `sync_conflict`, a `requirement_changed`, or a red verify or check after osq merges the default branch (`sync_verify_red`) — now shows once in the inbox with `osq plan <id>`, archived or not, and `osq land` records the stop on an archived change's branch. Approval of the revised plan restarts the branch from the default branch after a conflict, or merges the default branch without running verify otherwise, keeping done tasks (129).
- A stuck, blocked, or regressed change now shows once in the inbox with `osq plan <id>`. `osq plan` writes the prompt into the change's own folder, and `osq approve` continues the run from the first task that is not done (128).
- Removed `osq verified` and `osq check`. A proposal's `check:` command now runs after the change-level verify at archive and again in an `osq land` sync that merges a newer default branch; a failure stops the change as a failed verify does. `### After landing` steps are notes that `osq show` prints, and nothing waits on them. Archives with recorded verifications still show them in `osq show` (125).
- With `vcs.enabled`, `osq approve` removes the change folder from your checkout once its branch or stacked approval holds it, unless the folder is committed. `osq status` no longer prints `Leftover drafts:` or the checkout-copy warning, and `osq land` no longer removes a leftover draft. A copy an older approval left behind now lists as an unapproved draft; remove it with `rm -r openspec/changes/<folder>` once the change has landed (123).
- A stacked change is edited in its stacked directory and approved again from there; `osq reject` of a stacked change moves it back into your checkout as a draft (123).
- `osq new`, `osq plan`, and `osq lint` see changes in worktrees, stacked approvals, and `osq/` branches, so numbers are never reused (123).
- Removed: `osq done <id> <task> --manual`, which marked a task done without its verify. Fix the cause and run `osq retry <id> <n>`, or reject the change. Archives with manual done markers read as before (123).
- Role environments (ADR 007): verify, `vcs.prepare`, and harness tasks no longer inherit osq's environment. Each role gets a fixed base set plus the names listed under `confinement.roles.<role>.env`; verify never gets the model key. Claude tasks also deny `curl`, `wget`, `ssh`, `scp`, and `sudo` (122).
- `osq spec [capability] [requirement]` lists living capabilities and their requirements, or prints one; planners and executors read the requirements they need instead of whole specs (121).
- A regressed or dead marker for a red verify holds an output excerpt and a `Full output:` line instead of the whole log. New config keys `limits.markerOutputLines` (40) and `limits.markerLineChars` (400) (120).
- `osq lint` prints the change's own findings and counts the repository's; `osq lint --repository` lists those (119).
- A watcher or `osq land` running an old build stops and says to rebuild; `osq land --allow-stale` overrides (118).
- Approval never races the watcher, a change-level halt names `osq retry <id> change`, and a rejected change's branch is kept so it can be approved again (117).
- Executor prompts carry only changed rules, and a spawn that throws kills the task (116).
- Lint warns about a `source` comment on any requirement other than Code ownership (115).
- `osq sync <id>` merges the default branch into a running change's branch, and the watcher does the same before a change's first task and before archive. A sync resolves living specs and the archive from the default branch (110).
- `osq land <id>` lands an archived change in one command: it syncs and verifies, builds the land commit from the verified tree, and fast-forwards the default branch, so a land ends complete or changes nothing. Living specs never conflict (107, 109).
- ADR 006, osq is the deterministic core, and its rule in AGENTS.md (108).
- `osq graph` prints the system as one versioned graph; `GET /api/system` serves it to the dashboard (106).
- Each capability can carry an `osq.yml` with its `group` and `tags`, and `osq migrate sidecars` writes them; config key `capabilities.requireGroups` (105).
- Every change relates to a capability through a delta or `features.reads`, and a new capability is declared in the proposal's `creates` (102).
- `osq inbox` records how long items waited, and `osq report --since/--until` shows it in an `Inbox waiting` section (101).
- On a terminal, `osq inbox` opens the first item as a card with keys that run its commands (099).
- `osq inbox --follow` prints items as they arrive and leave, and plays a sound for new work; `inbox.*` config keys tune it (098).
- Fixes: a landed change counts once while its worktree is kept (104); a result section that says only None counts as empty (103); a task may delete a file its scope names (126); CI no longer fails while a test's temp repository is being written (124).

## [0.2.3] - 2026-09-27

- Stage 1 of git (ADR 003) is complete. With `vcs.enabled`, the watcher runs a change in its worktree on `osq/<folder>`, commits each verified task and the archive, and keeps a dead task's edits in `.run/dead/<n>.patch` (093). `vcs.enabled` still defaults to off.
- Stacking: dependent changes approved together run without a human, with a stacked approval cut from the dependency's archive commit (094, 096).
- `osq message <id>` prints the squash commit message with `Osq-*` trailers for a hand landing, and `osq status` flags leftover drafts after one (095).
- `osq inbox` lists what needs a human in dispatch order and prints the first item's card; `osq inbox --json` carries every card. New config key `limits.cardOutputLines`, default 20 (097).

## [0.2.2] - 2026-09-26

- Claude Code executor harness (070).
- OpenCode 2: tasks and planning sessions use v2's flags, run usage includes the final step, and doctor and the watcher's preflight refuse opencode 1 (092).
- Architecture decisions reach every spec, with ADR checks judged by validity (079, 080, 085).
- Opt-in scenario traceability: scenario tests run before the full verify, and mutation checks are observe only (081–083).
- Baseline verify before a change's first task (086); a blocked exit and automatic recertification (078).
- Planning and lint: rework declarations, executor disclosures, planning price estimates, lint findings you can act on, import-graph lint, and human steps on the record (074–077).
- Config errors fail loudly (090).
- Fixes from the ts-paas run: skip the rejected folder, recorded bugs, plainer wording (071–073).
- Groundwork for git (ADR 003), off by default and not yet complete: read-only git, one resolver for where changes live, `vcs` config and git writes, approve into a worktree, and dead-path building blocks (084, 087–089, 091). The watcher does not run changes in worktrees yet, so leave `vcs.enabled` off.

## [0.2.1] - 2026-09-24

Fixes from the first run on a project other than osq (069):
- `started` events, the idle status line, and done markers name osq's own version and commit. The project's HEAD is recorded separately as `projectCommit` and `project_commit`.
- The `unknown_capability` approval flag fires only for a delta without `## Purpose` or with a name resembling a living capability. The digest marks a deliberately created capability as `(new capability)`.
- Dead marker fingerprints ignore numbers after duration keys such as `duration_ms` and the names of temp directories, so repeated `node:test` failures are detected as stuck.

## [0.2.0] - 2026-09-24

Planning inside osq, stricter verification gates, and a read-only dashboard:
- npm package distribution, CI and release workflows, and a packed tarball smoke test (013, 014, 019).
- OpenSpec layout, pinned validator, delta replay in landing order, and compliance checks (016, 018, 025, 028, 051, 059).
- Engine safety: runner split by lifecycle phase, frozen import graph, line and function budgets, canonical layout, pure state, and stale build detection (020–024, 058).
- Verification gates: archive-time re-verification and tree hashes, test modification gating, scope regression recertification, deterministic scope resolution, and immediate breakage attribution (017, 027, 041, 042, 046).
- Failure handling: dead marker retention, manual done, retry and rejection, automatic retry with stuck detection, and the human attention inbox (029, 036, 037, 065).
- Planning: interactive and tool-native planning sessions, brief queue, planner rules and templates, per-turn planning measurement and attribution, approval digest with flags, and the proposal surface section (030, 031, 035, 039, 040, 043, 053, 062–064, 066).
- Harnesses: Codex, Pi, a harness capability catalog, and one executor prompt (032, 033, 050, 060).
- Reporting: current state and execution history, planning economics, and approval flag outcomes (026, 034, 035).
- Read-only dashboard and `osq serve` export (044, 054–057).
- Verify integrity: the pre-spawn red check, and a verify must find every path it names, with `verify_path_missing` and `verify_starts_conflict` (061, 067, 068).

## [0.1.0] - 2026-09-18

Initial release providing spec-driven development CLI, task verification gates, and observability:
- Core spec queue architecture, folder hashing, cryptographic approval, and state derivation (001, 002).
- Reactive watcher loop, exclusive locking, stale lock reaping, and multi-task sequential execution (003, 004).
- Inspection and reporting CLI commands: osq status, osq show, and osq report with token economics (005, 006, 007, 010).
- Multi-harness adapters: Agy and OpenCode adapters with stream-json event parsing and verification preflight (008).
- Observability and lifecycle tracking: PID propagation, unified leveled stderr logging, tool event streaming, and stream text result synthesis (009, 011).
- Watch terminal UX: interactive single-line footer with animated spinner, live progress counters, and curated permanent info stream (012).
