---
title: The Rust osq plan writes TypeScript's steering prompt for a change that needs steering
depends_on: []
verify: sh scripts/verify-rust.sh
features:
  reads: [rust-core, rust-storage, rust-specs]
---
## Goal

When a change needs steering, `osq plan <id>` hands the planner a prompt
that names each trigger and its evidence. Rust's plan feature plans only
new changes from the queue. This change adds `plan <id>` to it. For an
active change with a steering trigger, it writes TypeScript's prompt, the
opening sections plus the `## Steering` section, into `plan-prompt.md`,
and prints TypeScript's handoff. The trigger kinds are blocked, stuck,
regression, conflict and requirement-changed. The expected text comes
from TypeScript itself: goldens printed by the built `dist` from fixture
changes in this change folder, which task 1 copies into the crate.

## Verify

`sh scripts/verify-rust.sh` runs the format check, clippy with pedantic
lints and every Rust test, the link gates and the mutation check of the
changed lines included. It proves that the Rust steering handoff and
prompt equal TypeScript's on every golden row, that `plan --next` still
passes its tests, and that `osq-rs plan <id>` dispatches through the
registry.

## Non-goals

- Starting the planner, auto-steer, and the default-branch requirement text, which TypeScript prints only with vcs on.
- Changes in an osq worktree or a stacked approval, and archived changes, which need steering only inside a worktree. Like Rust reject, run and retry, this reads the checkout's active changes, so it works with vcs off.
- Resuming an unapproved change's plan, or creating a change named by `plan <name>`; Rust refuses an id that needs no steering.
- A live planner or auto-steer record changing the handoff's next step.

## Surface

- Added: `osq-rs plan <id>` (command form).
- Changed: the `osq-rs plan` usage, now `--next [--replan] | <id>`, and its usage error, now `expected --next [--replan] or one change id`.

## Decisions

- ADR 022: plan stays one feature crate. The steering triggers are derived again inside it from rust-storage's snapshot, as the inbox crate derives them, because a feature never calls another.
- ADR 023: the trigger list, the steering section and the next-step text are pure functions; one orchestrator reads the change and writes `plan-prompt.md`.
- ADR 024: every public item ends its doc with `Implements: rust-plan/<requirement>`, and each test names `Covers: rust-plan/<scenario>`.
- ADR 025: plan reads today's `.run` markers and writes only `plan-prompt.md` in the steered folder.
- ADR 026: marker bodies are split from their frontmatter through the specs kernel's `parse_frontmatter`.
- ADR 027: no scheduling changes.
- ADR 028: `PlanFeature` keeps its two commands, and `plan`'s usage widens.
- ADR 029: plan reads no config, so the default branch in the approval line is TypeScript's no-vcs `main`.

## Assumptions

- The brief asks for archived changes too, but an archived change needs steering only in an osq worktree, which needs vcs on. This change covers the checkout, and worktree steering is a follow-up item.
- `plan <id>` for a change that needs no steering is refused, where TypeScript resumes or creates a change. Rust's queue path is the only way to make a change.
- Every golden was printed by `golden/print-goldens.mjs.txt` with the built `dist` of this repository on 2026-10-22.

## Contract

### Requirement: Steering prompt

See `specs/rust-plan/spec.md`, with "Steering lookup" and "Steering
handoff", and the MODIFIED "Plan feature" and "Plan arguments".

## Human steps

### Before approval

None

### After landing

None

## Delta

- `specs/rust-plan/spec.md`: MODIFIED "Plan feature" and "Plan arguments"; ADDED "Steering lookup", "Steering prompt" and "Steering handoff".
- `fixture/steer-project/` holds the fixture project, and `golden/` the goldens, that task 1 copies to `crates/features/plan/tests/fixtures/steer-project/` and `crates/features/plan/tests/fixtures/steer-golden/`.
