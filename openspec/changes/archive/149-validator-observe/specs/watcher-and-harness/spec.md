## ADDED Requirements

### Requirement: Validator run at archive
When the config's `validator` is enabled, `checkAndArchiveSpec` SHALL call
`runValidator` in `src/watcher/validator.ts` once every archive verification
step has passed, the `check` included, and before the folder moves to the
archive. `runValidator` SHALL spawn the validator's adapter once. The adapter
comes from `getHarnessAdapter` for the validator's harness unless the caller
passes one. The spawn SHALL use the change's tree root as `projectRoot`,
`taskNumber` `validator`, tier `smart`, the validator's `timeoutSeconds`, the
config `validatorRunConfig` returns, and, as `prompt`, the text
`buildValidatorPrompt` returns. A spawn that throws SHALL be caught.

Then it SHALL append one `validator_ran` event to the change's
`.run/events/change.jsonl` with data `outcome`, `harness`, `model`,
`duration` in wall seconds, `exitCode` (null when nothing exited),
`scenarios` (how many scenarios were judged), `findings`, and `restored`. A
`not_run` event also has `reason`, and a failed or unreadable run has
`output`. The outcome SHALL be:

- `not_run`, without spawning, with reason `no_base` when git is off or
  `.run/base` is missing or empty, or `no_scenarios` when no scenario is to
  be judged
- `timed_out` when the spawn result says it timed out
- `failed` when the spawn throws or exits nonzero, with `output` the error
  text cut to its last 2,000 characters
- `unreadable` when it exits 0 and `.run/validator/findings.json` is missing
  or `parseValidatorFindings` returns null, with `output` the file's text cut
  to its last 2,000 characters, or empty when the file is missing
- `validated` otherwise

Only a `validated` event SHALL carry findings; every other outcome has an
empty list. After the event, `.run/validator/` SHALL be removed. Beyond
waiting for its timeout, nothing the validator does SHALL change whether the
change archives. `runValidator` SHALL catch every error, log it, append a
`failed` event when it can, and return, and `checkAndArchiveSpec` SHALL then
relocate the folder as before. A missing or disabled validator SHALL spawn
nothing and append no event.

#### Scenario: Findings recorded
- **WHEN** a change with `.run/base` archives in a linked osq worktree, and the validator's adapter writes a findings file holding one `no_test` finding
- **THEN** the change archives, its archived `change.jsonl` holds a `validator_ran` event with outcome `validated` and that finding, and `.run/validator/` is gone

#### Scenario: Validator throws
- **WHEN** the validator adapter's `spawn` throws
- **THEN** the change archives and its `validator_ran` event has outcome `failed` and the error text as `output`

#### Scenario: Validator times out
- **WHEN** the validator adapter's `spawn` returns `timedOut: true`
- **THEN** the change archives and its `validator_ran` event has outcome `timed_out` and no findings

#### Scenario: Findings unreadable
- **WHEN** the adapter exits 0 and the findings file holds `not json`
- **THEN** the change archives and its `validator_ran` event has outcome `unreadable`, `output` `not json`, and no findings

#### Scenario: No base
- **WHEN** a change archives outside git with the validator enabled
- **THEN** the change archives, no adapter is spawned, and its `validator_ran` event has outcome `not_run` and reason `no_base`

#### Scenario: Validator off
- **WHEN** a change archives with no `validator` in the config
- **THEN** no adapter is spawned and no `validator_ran` event is appended

### Requirement: Validator inputs
`readValidatorInputs` in `src/watcher/validator-inputs.ts` SHALL gather what
osq gives the validator, or return `{ notRun: 'no_base' }` when git is off or
`.run/base` is missing or empty, and `{ notRun: 'no_scenarios' }` when no
scenario is judged. It gathers:

- `base`, the trimmed contents of `.run/base`
- `deltaPaths`, the change's `specs/<capability>/spec.md` files,
  project-relative, in capability name order
- `scenarios`, from `judgedScenarios`, given each delta spec and the same
  capability's living spec at the base, read with
  `vcs.show(base, <paths.features>/<capability>/spec.md)`. A scenario is
  judged when it belongs to an ADDED or MODIFIED requirement and the living
  spec at the base has no requirement of that name holding a scenario with
  the same name and the same text, compared with surrounding whitespace
  trimmed. They come in capability order, then document order.
- `patch`, `vcs.patch(base)` with every file whose path starts with
  `<paths.openspecRoot>/` left out
- `testPaths`, the files left in the patch that `isTestPath` accepts and that
  exist, sorted
- `resultPaths`, the change's `.run/results/<n>.md` files that exist, in task
  number order, project-relative

Before spawning, `runValidator` SHALL remove any old
`.run/validator/findings.json`, then write the patch to
`.run/validator/diff.patch` and the text `formatScenariosFile` returns to
`.run/validator/scenarios.md`.

#### Scenario: Unchanged scenario not judged
- **WHEN** a MODIFIED requirement repeats a scenario of the living spec at the base word for word and adds one new scenario
- **THEN** `judgedScenarios` holds only the new scenario

#### Scenario: Specs left out of the patch
- **WHEN** a change's tree differs from its base in `src/a.ts`, `tests/a.test.ts`, and `openspec/specs/x/spec.md`
- **THEN** the inputs' patch has no block for `openspec/specs/x/spec.md`, and `testPaths` is `tests/a.test.ts`

#### Scenario: Missing base
- **WHEN** `.run/base` does not exist
- **THEN** `readValidatorInputs` returns `{ notRun: 'no_base' }`

### Requirement: Validator prompt
`buildValidatorPrompt` in `src/watcher/validator-prompt.ts` SHALL build the
validator's whole prompt. It SHALL first say that the validator judges
whether the change does what its delta specs say, reads but never edits code,
tests, or specs, and never runs git. It SHALL then name the change folder,
the delta spec paths, the scenarios file, the patch file, the tests the
change added or changed, and the findings file. Then come the rules. The
validator judges only the listed scenarios. It may read any file in the
repository, including tests the change did not touch, and runs no build or
test command. It reports a finding only for one of three problems:
`no_code`, when no code meets the scenario; `no_test`, when no test checks
its THEN; or `passes_without_change`, when the scenario describes behavior
the base did not have and its test would still pass on the base code. It
reports nothing about style, naming, or architecture. Only after the rules
SHALL the prompt list the executor result paths, under
`Executor claims (check them; do not start from them):`. It SHALL end with
the findings file's JSON format and the line
`CRITICAL: Before exiting, write <findings path>. Change no other file. Never run git.`

#### Scenario: Claims come last
- **WHEN** the prompt is built for a change with one delta, one changed test, and one result file
- **THEN** the delta path, the scenarios file, the patch file, and the test path all come before the claims heading, the result path comes after it, and the last line is the `CRITICAL:` line

### Requirement: Validator findings file
The validator SHALL write `.run/validator/findings.json` as
`{"findings": [...]}`. Each finding SHALL be an object with `kind`
`scenario` and non-empty strings `capability`, `requirement`, `scenario`,
`problem`, and `detail`, where `problem` is `no_code`, `no_test`, or
`passes_without_change`. `parseValidatorFindings` in
`src/watcher/validator-findings.ts` SHALL return the findings in file order
with their strings trimmed. It SHALL return null when the text is not JSON,
has no `findings` array, or holds any finding with another kind or problem,
or a missing or empty field. `{"findings": []}` is a run with no findings.
`kind` leaves room for a second kind of finding in a later change.

#### Scenario: Valid findings
- **WHEN** `parseValidatorFindings` reads one `no_code` finding with every field set
- **THEN** it returns that one finding

#### Scenario: Unknown problem
- **WHEN** a finding's `problem` is `style`
- **THEN** `parseValidatorFindings` returns null

#### Scenario: No findings
- **WHEN** the text is `{"findings": []}`
- **THEN** `parseValidatorFindings` returns an empty list

### Requirement: Validator tree guard
Before spawning the validator, `runValidator` SHALL record `vcs.status()` and
the contents of every file it lists. After the spawn, it SHALL put back every
path the validator changed, apart from files under the change's
`.run/validator/` and its `.run/events/validator.jsonl`. A path listed before
the spawn gets its recorded contents back, or is removed when it did not
exist then. Any other path goes through `vcs.discard`. The event's `restored`
SHALL list those paths, project-relative and sorted. The findings SHALL still
be read and recorded.

#### Scenario: Validator edits the tree
- **WHEN** the validator's adapter modifies a committed source file, edits a living spec the archive already changed, creates `notes.txt`, and writes a valid findings file
- **THEN** afterwards the source file matches HEAD, the living spec holds the archive's text, `notes.txt` is gone, `restored` lists those three paths, and the event's outcome is `validated`

## MODIFIED Requirements

### Requirement: Shared executor prompt
Every textual harness SHALL deliver the prompt `buildExecutorPrompt` returns,
byte for byte, and SHALL keep its own delivery, arguments, and attachments. The
prompt SHALL name the task file, `proposal.md`, title, scope, entry files,
verification command, result destination, prior context, delta spec paths, and
living spec paths, then the managed executor steps, capability rules, managed
exit text, and the concrete result path. Its closing line SHALL also tell the
agent never to run git. It SHALL NOT name `features/` or a parent `spec.md`.
When `SpawnTaskOptions.prompt` is set, `buildExecutorPrompt` SHALL return it
unchanged instead, so a role other than the executor uses the same harness
delivery without a new adapter method.

#### Scenario: Same task, three harnesses
- **WHEN** agy, codex, and opencode build argv for the same fixture task
- **THEN** each carries the same prompt text, equal to its checked-in golden prompt

#### Scenario: Specs named for every harness
- **WHEN** a change writes a delta spec and its proposal reads a living capability that exists
- **THEN** every harness prompt lists the delta spec path under `Delta Specs:` and the living spec path under `Living Capability Specs:`

#### Scenario: Managed text reaches the prompt
- **WHEN** a harness prompt is built
- **THEN** it contains every managed executor step line and every managed exit line verbatim

#### Scenario: No git
- **WHEN** a harness prompt is built
- **THEN** its last line says never to run git

#### Scenario: Prompt override
- **WHEN** `SpawnTaskOptions.prompt` is `judge this` and the claude and pi adapters build argv
- **THEN** `buildExecutorPrompt` returns `judge this`, and each argv's last argument is `judge this`
