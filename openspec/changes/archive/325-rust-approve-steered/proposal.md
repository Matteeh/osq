---
title: Rust osq approve re-approves a steered change
depends_on: []
verify: sh scripts/verify-rust.sh
features:
  reads: [rust-storage, rust-vcs, rust-config, rust-specs, rust-loop]
---
## Goal

When a running change hits a steering trigger, the human edits the plan and
runs `osq approve` again. Rust approve refuses every change with a steering
trigger, so steering still needs TypeScript. This change lets Rust approve a
steered change in its worktree, or in the checkout with git off, as
TypeScript does, and keeps every done task.

It is the first real use of ADR 030's events. TypeScript's approve calls
retry to clear the triggers. In Rust, approve may not call the retry crate,
so approve seals the revised plan and appends an `approved` event naming the
triggers it approved past. Retry reacts to that event and clears each
trigger with its own code, before the command returns.

## Verify

`sh scripts/verify-rust.sh` runs the format check, clippy and every Rust
test.

- Core's new `approved_event` test reads and writes the new event line.
- Approve's `approve_steering` and `approve_steered` tests cover two things:
  the triggers and refusals, and a worktree approval's output, commit,
  tree record and event. They compare with goldens that TypeScript's built
  `dist` printed.
- Retry's `retry_reaction` test clears triggers from a delivered event and
  proves that a second delivery changes nothing.
- The CLI's `approve_steered` test runs `osq approve` through `run_cli` on
  scratch repositories. It compares the change's whole `.run/` tree after
  the reaction with TypeScript's goldens, with git on and off.

## Non-goals

- Stacked changes; `rust-approve-stacked` follows.
- Default-branch triggers (a sync conflict, a changed requirement, a red
  verify after a sync). They stay refused, and
  `rust-approve-default-branch-steering` follows.
- Archived changes that need steering. Rust approve still finds active
  changes only.
- Auto-steer.
- The TypeScript refusal while a planner runs. Rust approve has no planner
  record yet, for any change.
- The digest, notices, `.run/manifest.json` and `.run/plan.jsonl`, which Rust
  approve does not write for any change.

## Surface

- Added: event type `approved` in `.run/events/change.jsonl`, written only by
  Rust approve on a steered approval: `hash` and `targets`
- Changed: `osq approve <id>` (Rust) approves a change with run triggers in
  its worktree or, with git off, in the checkout. It prints
  `  Continues from task <n>` and finds changes in osq worktrees.
- Changed: Rust approve's steering refusal now names default-branch steering
  only, plus two new refusals: a running task, and a steered checkout change
  with git on.

## Decisions

- ADR 022: approve never calls retry; it appends a typed `approved` event, and retry reacts to it.
- ADR 023: triggers, the steered approval and the reaction are small named functions; only the orchestrators do IO.
- ADR 024: every changed public item names its requirement and every new test its scenario.
- ADR 025: the `approved` line is today's event format, `type`, `timestamp` and `data`; markers, retained names and `retry` lines are TypeScript's.
- ADR 026: approve validates the worktree folder in the specs kernel against the checkout's living specs, as it validates any change.
- ADR 027: three tasks, each in one crate, apart from the CLI test in task 3.
- ADR 028: no feature gains a command; retry gains `reacts_to` and `react` through the trait's defaults.
- ADR 029: approve reads `vcs.enabled`, `vcs.author` and the git timeouts from `osq.toml` through the config kernel.
- ADR 030: section 7's case exactly. Approve leads to work retry owns, the event is named in the past tense, and the retry handler checks the event's targets against the markers and later `retry` lines, so a second delivery changes nothing.

## Assumptions

- TypeScript reads event lines generically and filters by `type`, so an `approved` line in `change.jsonl` is passed over by its watcher, status, report and read index.
- `Continues from task <n>` is computed by approve before retry runs, since reaction output is dropped. It names the first task without a done marker or with a regressed marker. It differs from TypeScript only when retry recertifies a scope regression that passes: that task stays done, but approve names it.
- With git on, Rust approve now looks up changes in osq worktrees too. A change that is already approved in its worktree and has no trigger now fails with `branch osq/<folder> already exists`, as TypeScript does, instead of `Spec "<id>" not found`.
- The approval commit always holds the new `approved` line, so running approve again after a failed commit never stops on "nothing to commit", the 326 incident's last approve failure.

## Contract

### Requirement: Steered approval
Rust approve seals a steered change's revised plan, appends an `approved`
event, and commits it in the worktree. Retry clears the triggers when the
event is delivered, as TypeScript's approve and retry do together.

#### Scenario: Steered approval equals TypeScript's
- **WHEN** a human runs Rust `osq approve <id>` on a change with run triggers in its worktree
- **THEN** the change's output, commit and `.run/` tree equal TypeScript's golden, apart from the `approved` event and the delivery cursor

## Human steps

### Before approval

None

### After landing

None

## Delta

- `specs/rust-core/spec.md`: MODIFIED "Event types", adding the `approved` type and the scenario "Approved event lines".
- `specs/rust-approve/spec.md`: MODIFIED "Approve lookup" and "Steering refusal", ADDED "Steered approval".
- `specs/rust-retry/spec.md`: ADDED "Approval reaction".
- `specs/rust-cli/spec.md`: ADDED "Steered approval through the CLI".
- `golden/print-steered-goldens.mjs.txt` printed the six goldens beside it from TypeScript's `dist`. Copy it to a `.mjs` file before running it.
- No file is shared between tasks.
