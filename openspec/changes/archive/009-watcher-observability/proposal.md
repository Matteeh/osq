---
title: Watcher observability
depends_on:
  - 8
features:
  reads:
    - watcher-and-harness
    - cli-foundation
---
## Goal

Provide comprehensive observability and runtime transparency for the osq watcher and execution harness. Introduce a centralized, leveled stderr logger controlled by CLI verbosity flags (--verbose, --quiet). Log process lifecycle events with pid, timeout, exit code, and elapsed duration. Emit periodic runtime heartbeats detailing elapsed time, event counts, and accumulated token totals. Standardize structured tool events across OpenCode and Antigravity stream-json harnesses. Synthesize missing result files from final agent stream text to prevent false no_result failures, and emit single-line outcome logs upon task verification or failure.

## Invariant

Every log line and its corresponding events.jsonl entry must originate from the same code path.

## Contract

| Component / Event | Expected Output / Behavior |
|---|---|
| CLI flags (--verbose, --quiet) | Configures logger: quiet suppresses info/verbose, normal shows info/errors, verbose reveals all details |
| Process lifecycle (started, exited) | Emits lifecycle event and logs one-line summary with pid, timeout, exit code, elapsed seconds to stderr |
| Runtime heartbeat | Periodic timer logs elapsed seconds, event count, and total tokens from config (log.heartbeatSeconds, default 60s) |
| Tool events (tool) | Emits { type: 'tool', data: { tool, summary } } to events.jsonl and logs at verbose level to stderr |
| Agy stream-json | Passes --output-format stream-json, translates usage to tokens and step tools to tool events, falls back cleanly |
| Synthesized result | On exit 0 without result file, synthesizes .run/results/N.md with synthesized: true from last stream text |
| Task outcome logging | Logs single-line summary with outcome and failure reason when verify passes, fails, or dead marker is written |

## Non-goals

- Implementing osq plan, osq archive, osq lint, or osq doctor.
- Sandbox confinement or harness_misconfigured handling.
- Modifying folder hashing, lock files, or approval cryptographic logic.
- Building web dashboards, terminal UI widgets, or external monitoring integrations.

## Delta (legacy)

Update features/watcher-and-harness.md to document the unified stderr logger, CLI verbosity flags (--verbose, --quiet), lifecycle logging for started and exited processes, periodic execution heartbeats, the standardized { type: 'tool', data: { tool, summary } } harness event, Antigravity stream-json event translation, runner result synthesis from final text stream events with synthesized: true frontmatter, and single-line task completion and failure outcome logs.
