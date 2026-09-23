# Changelog

All notable changes to `osq` are documented in this file.

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
