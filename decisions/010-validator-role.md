---
status: accepted
applies_to: [watcher-and-harness, cli-foundation]
rule: The validator judges a change once at archive on its own harness and model, writes only its findings file, and never stops or changes the change.
checks:
  - tests/validator-config.test.ts
---
# 010. Validator role

Date: 2026-10-04

## Status

Accepted

## Context

Every gate osq runs today is deterministic. The pre-spawn red check,
traceability, and mutation checks prove that the executor's tests fail before
the change and pass after it, but they cannot see whether those tests express
the delta's scenarios. A test can pass and check nothing, or cover a behavior
the base already had. Nothing in the flow reads the delta specs against the
code and the tests.

ADR 006 decision 4 sets the bar for closing that gap: a gate either stops the
flow when it fails or is removed; a warning is allowed only while its signal
is being measured. Making an agent's judgement into a blocking gate before its
false-positive rate is known would invert that rule. The validator therefore
starts as an observer whose findings are recorded and measured, not a gate.

Planner and executor already run on one model. A validator on that same model
shares its blind spots, so by default it runs on a different harness and model
than the executor. A project with only one provider key must still be able to
run it, so `osq doctor` warns when the two identities match rather than
refusing the config. The validator checks code against the scenarios, never
style, naming, or architecture; those are separate judgments with their own
measurements.

## Decision

1. **Its inputs.** At archive, once every verification step has passed, osq
   gives the validator the delta specs, the scenarios the change adds or
   modifies, the diff against `.run/base` with `openspec/` left out, and the
   tests that diff adds or changes, plus read access to the whole repository.
   The executor results come last, labeled as claims to check. It judges only
   the listed scenarios.
2. **What it may write.** Only `.run/validator/findings.json`. It never edits
   code, tests, or specs and never runs git. osq records the status and
   contents of every listed path before the spawn, puts back every path the
   validator changed, and lists those paths in the event's `restored`.
3. **Its environment.** The agent role's allowlist from ADR 007, built for the
   validator's harness, so it gets that harness's model key names and
   `confinement.roles.agent.env`. A role block of its own comes with a later
   confinement stage.
4. **Its model.** Its own `harness` and `model`, both required while it is on,
   never the executor's or `OSQ_MODEL`. `osq doctor` warns when they match the
   executor's, because a validator on the builder's model shares its blind
   spots; it is a warning so a project with one provider key can still run it.
5. **It never blocks.** Every outcome, `validated`, `failed`, `timed_out`,
   `unreadable`, or `not_run`, is recorded in a `validator_ran` event, and the
   archive goes on.

## Measurement

The role is due for a block-or-drop decision after 15 changes whose outcome is
`validated`, or on 2026-11-15, whichever comes first. A human labels each
finding true or false by reading the code, in the brief that follows.

- It becomes a gate if at least two thirds of the findings are true and at
  most one change in five has a false finding.
- It is dropped if fewer than one third of the findings are true, or if more
  than one run in five is `failed`, `timed_out`, or `unreadable`.
- Anything in between gets one more window of the same size with a revised
  prompt, and then it must block or go.

## Consequences

- Archives wait up to `timeoutSeconds` (900 by default) for one validator run.
- Each archive costs one validator run, and the tokens in
  `.run/events/validator.jsonl` count in the report's totals.
- A validator that crashes, times out, or writes no readable findings still
  records an event, and the change archives exactly as before.
- Until the measurement says otherwise, the validator's findings are advice a
  human reads with `osq show` and `osq report`, not a gate.

## Rejected

- **A validator per task.** It sees too little and costs one run per task.
- **Giving it only the diff.** In the 112 hand run, traceability's "Test and
  source paths" had no test in the diff while a test from before the change
  covered it; a diff-only validator would have reported a false `no_test`. The
  validator reads the whole repository, and osq lists only the scenarios the
  change adds or changes.
- **Putting the executor results first.** The coder's story steers the
  reviewer; they come last as claims to check.
- **Falling back to the executor's model.** A validator on the builder's model
  shares its blind spots, which is the failure the role exists to catch.
- **A temp folder for the findings.** Claude Code writes only inside the
  project root, so the findings file sits under the change's `.run/validator/`.
