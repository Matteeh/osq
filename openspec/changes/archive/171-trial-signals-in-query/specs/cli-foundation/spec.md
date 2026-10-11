# Spec Delta: cli-foundation

## ADDED Requirements

### Requirement: Validator harness doctor checks
When the resolved config's `validator` is enabled and its `harness` differs
from the config's `harness`, `osq doctor` SHALL check the validator's harness
the way it checks the executor's, on `validatorRunConfig(config, validator)`:

- a `validator-harness` check that probes the binary `harnessBinary` names
  for that config, with the same timeout as the `harness` check. It passes
  with `<bin> <version>`, fails with `binary unavailable: <bin> (<message>)`,
  or passes with `no external executable required` when the harness needs no
  binary;
- after a passing probe, each check the validator harness's catalog
  `diagnose` returns for that config and the probed version, with its name
  prefixed `validator-`, its message, and its warning flag.

These checks SHALL come after every other check except `validator-model`,
which stays last. A failing one SHALL fail `osq doctor` like any other check.
A validator on the executor's harness, a disabled validator, or no validator
SHALL add none of them, because the executor's `harness` checks already cover
that binary.

#### Scenario: Validator harness below its floor
- **WHEN** the config's harness is `mock`, the validator is `claude` with `claude-opus-5-5`, and `claude.bin` is a fake that prints `2.1.200 (Claude Code)`
- **THEN** `osq doctor` has a passing `validator-harness` check, a failing `validator-harness-version` check whose message names `2.1.200` and `2.1.278`, `validator-model` as its last check, and exits 1

#### Scenario: Validator harness at its floor
- **WHEN** the same config's fake prints `2.1.278 (Claude Code)`
- **THEN** `validator-harness` and `validator-harness-version` pass, and they come right before `validator-model`

#### Scenario: Validator binary missing
- **WHEN** the same config's `claude.bin` names a file that does not exist
- **THEN** the `validator-harness` check fails with a message that starts `binary unavailable: `, and the report has no `validator-harness-version` check

#### Scenario: Validator on the executor's harness
- **WHEN** the config's harness is `claude` with `claude.model` `claude-sonnet-5-5`, and the validator is `claude` with `claude-opus-5-5`; or the validator is disabled; or there is none
- **THEN** the report has no check whose name starts `validator-harness`
