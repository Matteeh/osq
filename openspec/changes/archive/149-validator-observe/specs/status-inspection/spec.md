## ADDED Requirements

### Requirement: Validation in show
For an archived change whose timeline holds a `validator_ran` event,
`SpecDetails` SHALL carry `validation`, the data of the latest such event,
built by `buildValidation` in `src/core/status/show-model-validation.ts` from
the timeline. `osq show` SHALL print it after the task section, rendered by
`src/core/status/show-validation-lines.ts`:

- a blank line, then the headline. A `not_run` event prints
  `Validation: not run (<reason>)`. Any other run prints
  `Validation: <outcome> by <harness>/<model> in <duration>s`, with the
  duration rounded to whole seconds, and a validated run adds
  `, <scenarios> scenarios judged, <n> findings`
- for a validated run, one line per finding:
  `  - <capability>: <requirement> / <scenario>: <words>. <detail>`, where
  the words are `no code meets it`, `no test covers it`, or
  `its test passes without the change`
- when `restored` is not empty, `  Restored: <path>, <path>`

`osq show --json` SHALL carry `validation` before `digest`. A change without
a `validator_ran` event SHALL have no `validation`, and its text and JSON
SHALL be unchanged.

#### Scenario: Findings shown
- **WHEN** archived change 042's `change.jsonl` holds a validated `validator_ran` event by `claude/claude-opus-5-5` taking 61.4 seconds, judging 3 scenarios, with one `no_test` finding for `pricing: Volume discount / Ten or more` detailed `Only the five-item tier is tested.`
- **THEN** `osq show 042` prints `Validation: validated by claude/claude-opus-5-5 in 61s, 3 scenarios judged, 1 findings` and `  - pricing: Volume discount / Ten or more: no test covers it. Only the five-item tier is tested.` after the task section

#### Scenario: Run that never started shown
- **WHEN** an archived change's latest `validator_ran` event has outcome `not_run` with reason `no_base`
- **THEN** `osq show` prints `Validation: not run (no_base)` and no finding lines

#### Scenario: No validator event
- **WHEN** an archived change has no `validator_ran` event
- **THEN** `osq show` prints no `Validation:` line and `osq show --json` has no `validation` key
