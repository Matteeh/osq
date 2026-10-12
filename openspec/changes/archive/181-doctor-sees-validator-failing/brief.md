---
queue_item: doctor-sees-validator-failing
queue_hash: sha256:bdf38079f071f317bf6edb3a48e5b3b2401f2b04c49a97c42335465c6aeeb05b
planner: null
date: 2026-10-12
---

### Goal

`osq doctor` never says the validator is fine while every validator run fails. When the newest archived validator runs failed, doctor names the error and the fix, so a broken validator is caught on the first doctor run instead of after weeks of empty trial data.

### Context

As of 2026-10-12:

- The validator recorded `failed` at every archive from 150 to 179. Each `validator_runs` row has `[claude-code:unrecognized_model] {"model":"claude-opus-5-5"}`: Claude Code 2.1.278 does not know the configured model.
- `osq doctor` prints `[ok] validator-harness-version: Claude Code 2.1.278 (Claude Code) (minimum 2.1.278)`. The floor is the single constant `CLAUDE_MINIMUM_VERSION` in `src/core/foundation/config-claude.ts`, "the oldest Claude Code release every flag osq passes was verified against". It knows nothing about models.
- 171 added `readValidatorFailing` in `src/core/status/validator-failing.ts`, and the inbox shows a validator-failing item from it (`src/core/status/inbox-projection.ts`). Doctor does not read it.
- ADR 010's block-or-drop decision is due 2026-11-15 and has no validated change yet.

### Requirements

- When `readValidatorFailing` reports failing runs, `osq doctor` shows a failing `validator-runs` check naming how many runs failed, the newest error line, and what to do: update the harness, or change `validator.model`.
- When the newest validator run passed, or there are no runs yet, the check passes or is absent; it never fails on a project that has not archived a validated change.
- The executor's own checks are unchanged.

### Non-goals

- A doctor probe that spends a model call.
- A per-model version table in code.
- Changing what the validator does at archive.

### Notes for planning

- Reuse `readValidatorFailing`; doctor and the inbox must agree on what counts as failing.
- Doctor's exit code follows the existing rule for failing checks.
