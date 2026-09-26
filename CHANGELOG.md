# Changelog

All notable changes to `osq` are documented in this file.

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
