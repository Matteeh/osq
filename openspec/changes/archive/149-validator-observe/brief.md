---
queue_item: validator-observe
queue_hash: sha256:45e9e163a132e602e5aa3d18d9a0743e66df899a872aa660f164ce2b6de20896
planner: null
date: 2026-10-04
---

### Goal

After a change's verify and check pass at archive, a validator agent judges whether the change does what its delta says, and osq records its findings without stopping the change. This is the first step of the key missing feature on the Notion roadmap, run observe-only so its false positives can be measured before it blocks.

### Context

As of 2026-10-04:

- The Notion page "Key missing feature: a validator agent that checks code against the spec" (under ROADMAP) has the reasoning and the open decisions.
- Every gate osq runs is deterministic. They prove the executor's tests pass, not that the tests express the delta's scenarios. Traceability is opt-in (`DEFAULT_TRACEABILITY_CONFIG` has `capabilities: []`, `mode: 'warn'`), osq's own config opts nothing in, and mutation checks only observe (`src/watcher/mutation-check.ts`).
- The roles osq spawns are `prepare`, `agent` and `verify` (`CONFINEMENT_ROLES` in `src/core/foundation/config-confinement.ts`). The harness adapter's `spawn` takes task-shaped `SpawnTaskOptions` with a `tier` of `coding` or `smart`.
- `src/watcher/archiver.ts` (202 lines) runs each task's verify, applies the deltas, then the change-level verify, then the proposal's `check:`, and relocates the archive.
- ADR 006 decision 4: a warning is allowed only while its signal is being measured; then it blocks or goes. ADR 007: each role gets only the environment it declares.
- Executors run on the top-level `harness` (osq's own config: pi with deepseek-flash). The optional `planner` block already selects its own `harness` and `model`, validated by `validatePlannerConfig` in `src/core/foundation/config-codex.ts`, so a role on a different model than the executor needs no new adapter method.

### Requirements

- A new ADR adds the validator role: what osq gives it, what it may write (only its findings file), its environment, and that it never edits code, tests or specs and never runs git.
- osq gives the validator the delta specs, the change's diff against its base, and the tests it added or changed. The executor result files come second, as claims to check, not as the account to start from, so the coder's own story does not steer the reviewer.
- At archive, after the check passes, osq runs the validator once per change and records an event with its findings. Each finding names a scenario and one of: no code meets it, no test covers it, or the test would pass without the change.
- A validator that fails, times out, or writes no readable findings is recorded as such, and the archive goes on. Nothing the validator does stops, delays past its timeout, or changes a change.
- `osq show` prints the findings for an archived change, and `osq report` counts changes validated and findings per change.
- The validator runs on its own harness and model, from a `validator` config block shaped like `planner` (harness, model, timeout, on/off). Its model is required when it is on; it never falls back to the executor's. A validator on the same model as the builder shares its blind spots.
- `osq doctor` warns when the validator's harness and model are the same as the executor's. A warning, not an error: a project with one provider key can still run it.
- The ADR records the measurement that decides block or drop, and the date or change count when it is due.

### Non-goals

- Blocking anything; a later change makes it a gate or removes it.
- Fixing code, reviewing style or architecture. Checking code against ADR rules is a later step, measured on its own; the findings format leaves room for a second kind of finding but this change emits none.
- Opting osq's own capabilities into traceability.

### Notes for planning

- Decided with the human on 2026-10-04: per change, not per task; a different model than the executor by default (for osq itself, the planner's model judging the executor's work); `osq doctor` warns when they match; style and architecture stay out of this change.
- Still open, settle in the proposal: whether `osq init` writes a `validator` block on, off, or commented out.
- Reuse the adapter's `spawn`; add an adapter method only if a harness really differs (AGENTS.md).
- `archiver.ts` is near the line budget; put the validator in its own module.
- Run the validator prompt by hand over a few archived changes, including 112, before fixing its format, and record what it found in the proposal.
