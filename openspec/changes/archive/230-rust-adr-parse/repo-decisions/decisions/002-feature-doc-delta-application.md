---
status: accepted
applies_to: [watcher-and-harness]
rule: Archive merges approved deltas into living specs deterministically, without a model.
---
# 002. Feature Doc Delta Application Strategy

Date: 2026-09-17

## Status

Accepted

## Context

The core thesis of osq is that feature documentation under features/ represents the current behavior that is always true of main. When an approved spec finishes its last task, the watcher applies the spec delta section to the documents listed in features.writes.

In v0.1, applyDelta simply appends ## Delta from <title> to existing feature documents. Over multiple iterations, this transforms feature documents into an append-only changelog rather than an authoritative reference of current behavior.

## Decision

1. **v0.1**: Retain the deterministic append behavior in applyDelta (## Delta from <title>).
2. **Planned for v0.2**: Implement deterministic section-level replacement:
   - Specs author deltas as complete replacement sections (e.g., a ## Behavior section in the spec delta completely replaces the existing ## Behavior section in features/<name>.md).
   - New section headings in the delta are appended to the document.
   - This keeps the watcher deterministic without requiring LLM/smart-model summarization at delta-application time, while ensuring feature docs remain always true of main.

## Consequences

- Feature doc updates remain 100% deterministic and watcher-managed.
- v0.1 stays simple while establishing the path toward section replacement in v0.2.
