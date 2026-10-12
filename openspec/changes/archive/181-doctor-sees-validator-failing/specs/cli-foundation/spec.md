## ADDED Requirements

### Requirement: Validator runs doctor check
When the resolved config's `validator` is enabled and
`readValidatorFailing(projectRoot, config)` from
`src/core/status/validator-failing.ts` returns a value, `osq doctor` SHALL add
a failing `validator-runs` check with the message
`validator <outcome> <runs>× in a row, last on <id>: <error> — update the <harness> harness or change validator.model`,
where `<outcome>`, `<runs>` and `<error>` are the returned values, `<id>` is
the numeric prefix of the returned `change` folder name or else the whole
name, and `<harness>` is the validator's `harness`. Doctor and the inbox SHALL
count failing runs the same way because both read `readValidatorFailing`.

The check SHALL come right before the validator harness checks of "Validator
harness doctor checks", or right before `validator-model` when there are none.
A failing `validator-runs` check SHALL fail `osq doctor` like any other check.
When `readValidatorFailing` returns null, or the validator is missing or
disabled, doctor SHALL add no `validator-runs` check. The check SHALL make no
model call and write nothing.

#### Scenario: Validator runs fail in doctor
- **WHEN** the config's harness is `mock`, the validator is `claude` with `claude-opus-5-5` on a fake binary at Claude Code's floor version, every other check passes, and archived changes `001-a` and `002-b` each hold one `validator_ran` event, in time order, as in the row
- **THEN** the doctor report has the `validator-runs` check the row names, and `report.ok` is as the row says:

| `001-a` run | `002-b` run | `validator-runs` check | `report.ok` |
| --- | --- | --- | --- |
| `failed`, output `[claude-code:unrecognized_model] {"model":"claude-opus-5-5"}\n\nClaude Code result: success` | the same | fails with `validator failed 2× in a row, last on 002: [claude-code:unrecognized_model] {"model":"claude-opus-5-5"} — update the claude harness or change validator.model` | false |
| `validated` | `timed_out`, no output | fails with `validator timed_out 1× in a row, last on 002: timed_out — update the claude harness or change validator.model` | false |
| `failed`, output `boom` | `validated` | none | true |
| none | none | none | true |

#### Scenario: Validator runs check order
- **WHEN** the same config's runs fail as in the first row above
- **THEN** `validator-runs` comes right before `validator-harness`, and `validator-model` is the last check

#### Scenario: No validator, no runs check
- **WHEN** both runs are `failed` and the config has no `validator` block, or one with `enabled: false`
- **THEN** the doctor report has no `validator-runs` check
