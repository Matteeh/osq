---
title: Rust osq lint checks a proposal's assumptions, decisions and banned words
depends_on: []
verify: sh scripts/verify-rust.sh
features:
  reads: [rust-core, rust-config, rust-linter]
---
## Goal

Rust `osq lint` runs the spec validation and the link gates (275) but none
of TypeScript's planner rules, so a Rust-only planner could hand over a
proposal that TypeScript's lint refuses. Every plan hits the proposal
rules, so they come first. This change makes Rust `lint` report
TypeScript's `## Assumptions` and `## Decisions` findings, the `AGENTS.md`
project rules errors the Decisions rule raises, and the banned word
warnings from `bannedWords`, with TypeScript's text and severity, before
the existing findings. Warnings no longer fail lint; they print above
`<folder>: valid`.

Doctor already checks the project rules block. Task 1 moves that check
into the specs kernel as `project_rules_errors`, so doctor and lint share
one function instead of two copies.

## Verify

`sh scripts/verify-rust.sh` runs the format check, clippy with pedantic
lints, every Rust test, the link gates and the mutation check of the
changed lines. It proves that the kernel's project rules errors match
TypeScript's `checkProjectRules` on every row, that doctor's decisions
lines are unchanged, and that `lint` gives TypeScript's proposal and
banned word findings, in order, next to every existing lint row.

## Non-goals

- The `## Surface` rule; it moves to `rust-lint-task-rules` with the other task and scope rules.
- The task, scope, verify, impact and word-count rules; later queue items port them.
- A rule for `## Human steps`; TypeScript's lint has none.
- Reading `openspec.root` or the decisions folder from config; lint reads `openspec/` and `decisions/` at the root, as doctor does.

## Surface

- Changed: `osq-rs lint <id>` (command): prints proposal and banned word findings, and warnings no longer fail it

## Decisions

- ADR 022: the rules live in the lint feature crate; the shared project rules check moves down into the specs kernel, which doctor and lint both call, so no feature calls another.
- ADR 023: each rule is a small pure function over text; one orchestrator reads `proposal.md`, the task files, the delta specs, `AGENTS.md` and the config.
- ADR 024: every public item ends its doc with `Implements: <capability>/<requirement>`, and each new test names `Covers: <capability>/<scenario>`.
- ADR 025: the proposal, task files and ADRs are read from today's files as they are.
- ADR 026: ADRs come from the specs kernel's `read_decisions`, frontmatter from `parse_frontmatter`, task scope from `parse_task_file`.
- ADR 027: no scheduling changes.
- ADR 028: `LintFeature`'s command list is unchanged; only what `lint` checks grows.
- ADR 029: `bannedWords` and `limits.maxProjectRules` come from `load_config`, and a config error fails lint with its display.

## Assumptions

- When `proposal.md` cannot be read or its frontmatter does not parse, the proposal and banned word rules give no finding; TypeScript reports a frontmatter error there, which the later task rules item ports.
- TypeScript prints every finding and then a count or `valid`; Rust keeps 275's shape, a `Failed` error with the count when any finding is an error, and output when none is.
- Each expected value was taken from `assumptions.ts`, `decisions-lint.ts`, `rules-block.ts`, `banned-word-lint.ts` and `lint-output.ts` as of 2026-10-23.

## Contract

### Requirement: Lint proposal rules

See `specs/rust-lint/spec.md`, with "Lint proposal rules", "Lint banned
words", "Lint findings", "Lint errors" and "Lint command", and
`specs/rust-specs/spec.md`, with "Project rules block".

## Human steps

### Before approval

None

### After landing

None

## Delta

- `specs/rust-specs/spec.md`: ADDED "Project rules block"; MODIFIED "Public API".
- `specs/rust-doctor/spec.md`: MODIFIED "Doctor decisions".
- `specs/rust-lint/spec.md`: MODIFIED "Lint command", "Lint findings" and "Lint errors"; ADDED "Lint proposal rules" and "Lint banned words".
- No file is shared by two tasks.
