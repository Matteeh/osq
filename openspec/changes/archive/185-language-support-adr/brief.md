---
queue_item: language-support-adr
queue_hash: sha256:e934e96d7afbf7fffe88b49604febf9b26bdb38363701a8187d53c7cbe98ba0b
planner: null
date: 2026-10-12
---

### Goal

Before osq learns a second language, one accepted ADR fixes how languages fit in: where a path's language comes from, what is data and what is code, where the code lives, and how a gate says it does not cover a language. Every later language change follows it instead of inventing its own seam.

### Context

As of 2026-10-12:

- Every gate and extra assumes TypeScript and node:test (Notion page "Language support: osq on a project in any language", checked against the code at 171). Test paths, the dependency manifest, test output, the import graph, function ranges and traceability tags are read in TypeScript-only code spread over `src/core/run`, `src/watcher`, `src/core/spec` and `src/core/trace`.
- ADR 016 makes capabilities vertical slices and lists six kernel slices; `src/kernel/` does not exist yet.
- ADR 006: a gate blocks or is removed; it never silently does nothing.
- Decided 2026-10-12: a path's language comes from its nearest manifest; the code lives in a new kernel slice `languages`; the ADR is its own change; the adapter starts tiny.

### Requirements

- New accepted ADR 017 "Language support", `applies_to: all`, whose rule says that a path's language comes from its nearest manifest and that language-specific code lives behind the `languages` kernel slice's adapter.
- It records: language per path by nearest manifest; facts (test paths, manifests, runners) are data, code reading (imports, function ranges, test output, tags) goes through a per-language adapter; a gate covers a language or says it does not (ADR 006); an adapter method is added only where languages really differ, and shared formats such as JUnit XML are preferred; no new runtime dependency; `src/kernel/languages/` is a kernel slice next to ADR 016's six; TypeScript code moves behind the adapter one gate per change.
- The rule reaches AGENTS.md's rules block, and the decisions index lists the ADR.

### Non-goals

- Any code under `src/kernel/languages/` (language-gaps-reported starts it).
- Supporting a second language.
