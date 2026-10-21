---
title: The Rust run feature builds the executor prompt for one task as TypeScript does
depends_on: []
verify: sh scripts/verify-rust.sh
features:
  reads: [rust-specs]
---
## Goal

The run feature is a placeholder. Its first piece is the prompt an executor
gets for one task: the task, change and spec files to read, the capability
rules, any prior attempt, and the protocol to follow. This change ports
TypeScript's `buildExecutorPrompt` to `executor_prompt` in `osq-feature-run`,
byte for byte equal for the same inputs.

## Verify

`sh scripts/verify-rust.sh` runs the format check, clippy with pedantic lints
and every Rust test, the corpus link gates included, so it proves the new
prompt test passes against TypeScript's goldens.

## Non-goals

- Starting the harness, running verify or writing any marker.
- Reading the prior attempt from `.run/events`, as TypeScript's `readRetryContext` does; the caller gives it.
- A run command or a `Feature` for run.
- Config's `paths.features`; the living specs are always under `openspec/specs`, TypeScript's default.

## Surface

None

## Decisions

- ADR 022: the run feature reads the change's files through the specs kernel, as plan and approve do, and calls no other feature.
- ADR 023: the statement parser and the output bound are pure leaves; `executor_prompt` is the thin orchestrator that reads files.
- ADR 024: every public item ends its doc with `Implements: rust-run/<requirement>`, and each test names `Covers: rust-run/<scenario>`.
- ADR 025: the prompt reads today's change folders and `.run/results` files as they are.
- ADR 026: the task file and proposal are read with the specs kernel's `read_task_file` and `read_proposal`.
- ADR 027: no scheduling changes.
- ADR 028: no `Feature` yet; the prompt is a library function the run command will call.
- ADR 029: no config is read; the default `paths.features` holds.

## Assumptions

- The goldens in `golden/` were printed by `golden/print-prompts.mjs.txt` from this checkout's `dist`, built at 2026-10-21 22:55 after every change to `src/harness/prompt.ts`, `src/harness/types.ts` and `src/core/foundation/init-blocks.ts`.
- Byte order of capability names equals TypeScript's `localeCompare` order for osq's lowercase kebab-case names.
- An output cut at 2000 UTF-16 code units never splits a surrogate pair in practice; Rust cannot hold the lone half TypeScript would keep.
- A proposal the Rust `read_proposal` refuses is one TypeScript's `parseSpecMd` also refuses, so both give no reads.

## Contract

### Requirement: Executor prompt

See `specs/rust-run/spec.md`, with "Prompt spec lists", "Prompt capability
rules", "Prompt requirement statements", "Prompt prior context" and "Prompt
output bound".

## Human steps

### Before approval

None

### After landing

None

## Delta

- `specs/rust-run/spec.md`: ADDED "Executor prompt", "Prompt spec lists", "Prompt capability rules", "Prompt requirement statements", "Prompt prior context" and "Prompt output bound".

The fixture project in `fixture/prompt-project/` and the goldens in
`golden/` are copied into the run crate's test fixtures by task 1.
