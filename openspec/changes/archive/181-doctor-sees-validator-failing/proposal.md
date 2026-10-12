---
title: osq doctor fails the validator check while the validator's runs fail
depends_on: []
verify: pnpm verify
features:
  reads:
    - spec-lint-and-approve
    - status-inspection
    - version-control
    - watcher-and-harness
---
## Goal

`osq doctor` never says the validator is fine while every validator run fails.
When the newest archived validator runs failed, doctor shows a failing
`validator-runs` check that names how many runs failed, the newest error line,
and the fix, so a broken validator is caught on the first doctor run instead
of after weeks of empty trial data.

Measured on 2026-10-12: osq's own validator failed at every archive from 150
to 180 with `[claude-code:unrecognized_model] {"model":"claude-opus-5-5",...}`,
while doctor printed `[ok] validator-harness-version`. A prototype of this
check on the current tree printed
`validator failed 23× in a row, last on 180: ...`. Its only test fallout was
the own-repository case in `tests/doctor.test.ts` and the 250-line budget of
`src/core/foundation/doctor.ts`.

## Verify

`pnpm verify`

The CLI and UI typechecks, the build, every test and lint pass on the final
tree, including the new `tests/validator-doctor-runs.test.ts`.

## Non-goals

- A doctor probe that spends a model call.
- A per-model version table in code.
- Changing what the validator does at archive.
- Changing `readValidatorFailing`, the inbox item, or the `osq status` line.
- Changing the executor's own doctor checks.

## Surface

- Added: `validator-runs` (`osq doctor` check)

## Decisions

- ADR 001: config loading is untouched.
- ADR 004: the OpenSpec `validator` check is untouched.
- ADR 005: the peer range rule is untouched.
- ADR 010: doctor only reads the validator's recorded runs; it makes no model call and never stops or changes a change.
- ADR 012: the watch service is untouched.
- ADR 015: `osq mcp` is untouched.

## Assumptions

- With nothing failing, the check is absent rather than a passing line, because `readValidatorFailing` returns null both for "newest run validated" and for "no runs yet".
- A missing or disabled validator adds no `validator-runs` check even when old runs failed, since no new run can clear it.
- After this lands, `osq doctor` in osq's own repository fails until Claude Code accepts `claude-opus-5-5` (or `validator.model` changes) and a later archive records a `validated` run. The own-repository doctor test leaves `validator-runs` out for that reason.

## Contract

### Requirement: Validator runs doctor check

When the resolved config's `validator` is enabled and
`readValidatorFailing(projectRoot, config)` returns a value, `osq doctor` SHALL
add a failing `validator-runs` check whose message is
`validator <outcome> <runs>× in a row, last on <id>: <error> — update the <harness> harness or change validator.model`.

#### Scenario: Validator runs fail in doctor
- **WHEN** archived changes `001-a` and `002-b` each hold one `validator_ran` event, in time order, as in the row
- **THEN** `osq doctor` shows the `validator-runs` check the row names

## Human steps

### Before approval

None

### After landing

- `osq doctor` here will fail on `validator-runs` until the validator works again: update Claude Code to a release that knows `claude-opus-5-5`, or change `validator.model` in `osq.config.ts`. It clears after the next archive that records a `validated` run.

## Delta

- `specs/cli-foundation/spec.md`: ADDED "Validator runs doctor check".

No file is shared between tasks.
