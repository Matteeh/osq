## ADDED Requirements

### Requirement: Change check at archive
After the change-level verification passes, the watcher SHALL run the
proposal's `check` command, when `readCheckCommand` finds one, through
`verifyArchiveStep` with target `change`, as it runs that verify. A check that
fails, times out, or names a missing path SHALL be handled exactly as a failed
change-level verify: the living specs go back, the change stays unarchived,
and `.run/regressed/change.md` records the regression.

#### Scenario: Check passes
- **WHEN** a change's verify passes and its `check: node check.cjs` exits 0
- **THEN** the change archives, and `.run/events/change.jsonl` holds a `verify_ran` event whose command is `node check.cjs`

#### Scenario: Check fails
- **WHEN** a change's verify passes and its `check: node check.cjs` exits 1
- **THEN** the change stays unarchived, `.run/regressed/change.md` has reason `verify_red` and command `node check.cjs`, and the living specs are what they were before archive began

### Requirement: Archived event without a verification requirement
The `archived` event SHALL carry only `archivePath`, whatever the proposal's
human steps and `check` command are.

#### Scenario: After-landing steps
- **WHEN** a change whose `### After landing` lists a step and whose frontmatter has `check: node check.cjs` is archived
- **THEN** its `archived` event's data is exactly `{ archivePath }`

## MODIFIED Requirements

### Requirement: Change folder in verify environment
`runVerificationCommand` SHALL take the change folder as a required argument,
either an absolute path or null. It SHALL run the command with its role's
environment from "Role environments", the verify role unless the caller names
prepare, plus `OSQ_CHANGE` set to that path. With null, it SHALL run with
`OSQ_CHANGE` removed, even when osq's own environment has it. Every watcher
verify SHALL pass the change folder it runs for: a task's pre-spawn and
post-exit verify, the change-level verify, the archive-time verifies and
check, and the scope-regression audit. So SHALL the recertification verify of
`osq retry`. A land's sync SHALL run an archived change's verify and `check`
with null, because its deltas are already in the living spec.

#### Scenario: Task verify sees its change
- **WHEN** the watcher runs a task whose verify prints `OSQ_CHANGE`
- **THEN** the recorded `verify_ran` output is the absolute path of the change folder

#### Scenario: Archived check runs without it
- **WHEN** a land's sync runs an archived change's `check` command while osq's environment has `OSQ_CHANGE` set
- **THEN** the command sees no `OSQ_CHANGE`

### Requirement: Role environments
`buildRoleEnv` in `src/core/run/role-env.ts` SHALL build the environment of
every process osq spawns for a role, where the role is `prepare`, `agent`, or
`verify`. It SHALL take the role and an options object with an optional
config, an optional harness name, optional extra variables, and an optional
source environment that defaults to `process.env`. The harness SHALL default
to the config's `harness`, then to `DEFAULT_CONFIG.harness`. From the source
it SHALL copy only these variables, and only when set:

- the names in the exported `BASE_ENV_NAMES`: `PATH`, `HOME`, `USER`,
  `LOGNAME`, `SHELL`, `LANG`, `LANGUAGE`, `LC_ALL`, `LC_CTYPE`, `TERM`, `TZ`,
  `TMPDIR`, `TMP`, `TEMP`, `XDG_CONFIG_HOME`, `XDG_CACHE_HOME`,
  `XDG_DATA_HOME`, `XDG_STATE_HOME`, `XDG_RUNTIME_DIR`, `NODE_EXTRA_CA_CERTS`,
  `SSL_CERT_FILE`, `SSL_CERT_DIR`, `CI`, `NO_COLOR`, `SYSTEMROOT`, `COMSPEC`,
  `PATHEXT`, `WINDIR`, `USERPROFILE`, `APPDATA`, `LOCALAPPDATA`, and
  `PROGRAMDATA`
- every variable whose name starts with `OSQ_`
- the names the config lists in `confinement.roles.<role>.env`
- for the agent role, the names the harness's catalog entry lists in
  `agentEnv`

For the prepare and verify roles it SHALL leave out every name the harness's
`agentEnv` lists, even when the config lists it for that role. Extra
variables SHALL be set last and win. On Windows a name SHALL match regardless
of case. The built environment SHALL be a new object, and the source SHALL
never change.

`runVerificationCommand` SHALL take an optional options object after the
change folder, with an optional `role` (`verify` or `prepare`, default
`verify`), an optional `config`, and optional `extraEnv`. It SHALL build the
environment with `buildRoleEnv`, then apply the `OSQ_CHANGE` rule from
"Change folder in verify environment", then set `extraEnv`. `runPrepare`
SHALL use the prepare role. Every other caller in `src/` SHALL use the verify
role and pass the config it holds: task, change, archive, and regression
verifies, a change's `check` command, focused runs, mutation checks, the
baseline verify, retry recertification, and sync verify.

#### Scenario: Base and OSQ variables pass
- **WHEN** `buildRoleEnv('verify', { source })` runs with `PATH`, `HOME`, `OSQ_FAKE_MODE`, and `AWS_SECRET_ACCESS_KEY` in the source
- **THEN** the result holds `PATH`, `HOME`, and `OSQ_FAKE_MODE`, and no `AWS_SECRET_ACCESS_KEY`

#### Scenario: Configured verify name
- **WHEN** the config lists `DATABASE_URL` in `confinement.roles.verify.env` and the source sets it
- **THEN** the verify role holds `DATABASE_URL`, and the prepare and agent roles do not

#### Scenario: Agent gets its harness keys
- **WHEN** `buildRoleEnv('agent', { harness: 'claude', source })` runs with `ANTHROPIC_API_KEY` and `OPENAI_API_KEY` in the source
- **THEN** the result holds `ANTHROPIC_API_KEY` and no `OPENAI_API_KEY`

#### Scenario: Verify never gets the model key
- **WHEN** the config's harness is `claude`, it lists `ANTHROPIC_API_KEY` in `confinement.roles.verify.env` and `confinement.roles.prepare.env`, and the source sets it
- **THEN** neither the verify nor the prepare role holds `ANTHROPIC_API_KEY`

#### Scenario: Extra variables win
- **WHEN** the source sets `OSQ_TASK_NUMBER=9` and the extra variables set `OSQ_TASK_NUMBER=1`
- **THEN** the result's `OSQ_TASK_NUMBER` is `1`

#### Scenario: Verify command sees only its role
- **WHEN** `runVerificationCommand` runs a command that prints its environment, with a config listing `VERIFY_PROBE` for verify, while osq's environment sets `VERIFY_PROBE` and `SECRET_PROBE`
- **THEN** the output holds `VERIFY_PROBE` and no `SECRET_PROBE`

#### Scenario: Prepare sees only its role
- **WHEN** `runPrepare` runs `vcs.prepare` with a config listing `NPM_TOKEN` for prepare and `VERIFY_PROBE` for verify, both set
- **THEN** the prepare command sees `NPM_TOKEN` and no `VERIFY_PROBE`

#### Scenario: Watcher verifies use the verify role
- **WHEN** the watcher runs a task whose verify and change-level verify exit 0 only when `VERIFY_PROBE` is set and `SECRET_PROBE` is unset, with a config listing `VERIFY_PROBE` for verify and a baseline verify doing the same check
- **THEN** the baseline, the task verify, and the change verify all pass, and the task is done

## REMOVED Requirements

### Requirement: Archived verification requirement
**Reason**: Nothing reads an archived change's verification requirement any more; nothing waits on a human's verification (ADR 006 decision 3).
**Migration**: None. `archived` events written before this change keep their `verification` key, and nothing reads it.

### Requirement: Human verification events
**Reason**: No command appends `check_ran` or `verification_recorded` events any more. A change's check records a `verify_ran` event at archive and in a land's sync.
**Migration**: None. `osq show` still prints the events an older archive holds.
