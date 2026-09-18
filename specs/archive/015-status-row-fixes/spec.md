---
title: Status row fixes and outcome log curation
depends_on: [012]
features:
  reads: [watcher-and-harness]
  writes: [watcher-and-harness]
---
## Goal

Resolve four terminal UX defects in `osq watch` introduced by the initial watch terminal UX implementation:

1. **Status row terminal overflow and wrapping**: Move status line truncation into the logger's `redraw()` method. The logger computes available width from `stream.columns` (defaulting to 80) minus the 2-column spinner prefix (`<frame> `), truncating with an ellipsis (`…`) when the text exceeds the terminal width. Never apply logger prefix formatting (such as `[osq]`) to status text so the rendered row never overflows terminal columns or leaves ghost tails on redraws. Remove truncation logic and terminal width parameters from `formatTaskStatusRow` and `formatIdleStatus`.
2. **Duplicate task outcome logging & function removal**: Completely delete `formatTaskOutcomeSummary` from `src/watcher/runner.ts` so the function no longer exists in the codebase (not exported, absent anywhere under `src/`), and eliminate every call site in `runner.ts` (lines 454, 468, 489, 500, 618, 660, 764, 787 at HEAD, plus the dead-path pairs). Route all task outcomes through `formatTaskOutcomeLine` via `logOutcome`, ensuring exactly one outcome line is emitted per completed or failed task, preserving all failure reasons (`spec_conflict`, `already_running`, `crashed`, `timeout`, `no_result`, `verify_red`) and failure details (`code: <exitCode>`, `timed_out: true`), and eliminating the legacy `(passed)` suffix. The outcome logging tests run the mock harness end to end for a verified task and a dead task, asserting info-level output contains one outcome line each and no `(passed)` string.
3. **Abbreviated token counters with rollover**: Format cumulative token counts with compact abbreviations (below 1000 as-is, `X.Xk` below 1M, `X.XM` at or above 1M) across both the interactive TTY status row and the periodic heartbeat log line via a shared token formatter, preserving cost rendering as-is. Values that round to `1000.0k` (e.g. `999_950`) roll over to `1.0M`. A table-driven test verifies edge boundaries including `999`, `1000`, `999_949`, `999_950`, and `1_000_000`, alongside an assertion on the rendered status text.
4. **Repository-relative tool paths in status observations**: Strip the project root the harness actually ran in (defaulting to `process.cwd()`) and its trailing directory separator from any absolute path present in tool summaries rendered in the status row and heartbeat line, so paths appear cleanly relative to the project root (e.g. `specs/014-...` rather than `/specs/014-...`), while preserving the raw summary unchanged in `.run/events/<n>.jsonl`.

## Invariant

1. The status row text fits the terminal width entirely within the logger sink without applying `[prefix]`, ensuring `\r\x1b[2K` redraws never leave ghost characters or wrap rows.
2. Every task completion or failure emits exactly one permanent outcome line at `info` level via `formatTaskOutcomeLine`. `formatTaskOutcomeSummary` does not exist in `src/`.
3. The 012 invariant holds: `computeTaskHeartbeatStats` supplies the single authoritative stats object, and shared formatting helpers ensure the 1s status row and the periodic heartbeat line render identical token and tool summary representations.

## Contract

| Component / Trigger | Expected Output / Behavior |
|---|---|
| Logger `status()` & `redraw()` | Status text is stored raw without `[prefix]`; `redraw()` truncates text to `(stream.columns ?? 80) - 2` columns appending `…` when overflowing; row never wraps or leaves ghost characters |
| Status formatters (`formatTaskStatusRow`, `formatIdleStatus`) | Assemble full status strings without taking a terminal width parameter or performing string truncation |
| Task outcome logging & helper removal | `formatTaskOutcomeSummary` no longer exists in `src/` (not exported, not present); every terminal outcome routes through `formatTaskOutcomeLine`; exactly one outcome line logged per task; tested via mock harness end-to-end |
| Token count formatting | Shared formatter abbreviates counts: `<1000` as integer, `<1M` as `X.Xk` (values rounding to `1000.0k` roll over to `1.0M`), `>=1M` as `X.XM` (at or above 1M); identical representation in status row and heartbeat line |
| Tool summary path relativization | Project root (with fallback to cwd) and its trailing separator stripped from absolute paths in tool summaries for status row and heartbeat line; raw summaries preserved in `events.jsonl` |

## Non-goals

- Adding external terminal UI libraries or new dependencies.
- Modifying the watcher loop logic beyond signature adjustments where `formatIdleStatus` drops its width parameter.
- Changing `events.jsonl` schema or raw event payloads written by harness adapters.
- Altering verification execution, lock acquisition protocols, or spec state transitions.

## Delta

Update `features/watcher-and-harness.md` under `## Terminal UX & Observability` to replace the **Live Status Row** and **Curated Permanent Log Stream** bullet points with the following literal paragraphs:

- **Live Status Row**: Rendered via the logger's stderr sink when connected to an interactive TTY (`process.stderr.isTTY` is true, `--quiet` is unset, and `CI` is unset). The row animates a spinner at an 80ms interval. Truncation is handled entirely within the logger sink: the text is constrained to `stream.columns` (default 80) minus the 2-column spinner prefix (`<frame> `) and capped with an ellipsis (`…`) without applying logger prefixing (such as `[osq]`). While running a task, the row displays the spinner, task number, elapsed duration, tool invocation count, abbreviated cumulative tokens (`<1000` as-is, `X.Xk` below 1M, `X.XM` at or above 1M, with rollover from `1000.0k` to `1.0M`), reported cost, and the most recent tool summary with the project root and trailing separator stripped from absolute paths. While idle, it displays the spinner, watching spec directory, approved specs waiting count, and the last archived spec with its completion age.

- **Curated Permanent Log Stream**: Permanent output at `info` level is strictly limited to high-signal lifecycle events: spec pick-up upon approval detection, task start with single-line truncated title, exactly one task outcome line (`verified` or `dead` with failure reason, diagnostic details, and elapsed duration), spec archival, spec halt on failed tasks, and watcher errors. Diagnostic details (`exited`, synthesized result notices, and TTY-mode heartbeats) are routed exclusively to `verbose` level.