---
queue_item: rust-plan-brief-notes
queue_hash: sha256:b597a0cc45a2699bd7263de7fc2afa81131da038e48d5c4bed3108713c82111d
planner: null
date: 2026-10-24
---

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
