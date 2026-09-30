## MODIFIED Requirements

### Requirement: Change folder in verify environment
`runVerificationCommand` SHALL take the change folder as a required argument,
either an absolute path or null. It SHALL run the command with its role's
environment from "Role environments", the verify role unless the caller names
prepare, plus `OSQ_CHANGE` set to that path. With null, it SHALL run with
`OSQ_CHANGE` removed, even when osq's own environment has it. Every watcher
verify SHALL pass the change folder it runs for: a task's pre-spawn and
post-exit verify, the change-level verify, the archive-time verifies, and the
scope-regression audit. So SHALL the recertification verify of `osq retry`.
The `check` command of an archived change SHALL run with null, because its
deltas are already in the living spec.

#### Scenario: Task verify sees its change
- **WHEN** the watcher runs a task whose verify prints `OSQ_CHANGE`
- **THEN** the recorded `verify_ran` output is the absolute path of the change folder

#### Scenario: Archived check runs without it
- **WHEN** `osq check` runs an archived change's check command while the shell has `OSQ_CHANGE` set
- **THEN** the command sees no `OSQ_CHANGE`

### Requirement: Claude permissions and containment
Every Claude task SHALL run with `--permission-mode dontAsk`, the allow rules
`Bash`, `Read`, `Edit(./**)`, `Write(./**)`, `Glob`, and `Grep`, and the deny
rules `Bash(git:*)`, `Bash(curl:*)`, `Bash(wget:*)`, `Bash(ssh:*)`,
`Bash(scp:*)`, and `Bash(sudo:*)`, in that order, after `--disallowedTools`.
When `claude.sandbox` is true, the `--settings` JSON SHALL also carry
`sandbox` with `enabled: true`, `failIfUnavailable: true`,
`autoAllowBashIfSandboxed: true`, `allowUnsandboxedCommands: false`, and
`network` with an empty `allowedDomains` and `strictAllowlist: true`.

#### Scenario: Default containment
- **WHEN** `claude.sandbox` is unset or false
- **THEN** the settings JSON is exactly `{"autoMemoryEnabled":false}` and the `git` deny rule is passed

#### Scenario: Sandboxed containment
- **WHEN** `claude.sandbox` is true
- **THEN** the settings JSON carries the sandbox block above, and the `git` deny rule is still passed

#### Scenario: Network tools and sudo denied
- **WHEN** `buildClaudeArgs` runs with any configuration
- **THEN** the arguments after `--disallowedTools` are `Bash(git:*)`, `Bash(curl:*)`, `Bash(wget:*)`, `Bash(ssh:*)`, `Bash(scp:*)`, and `Bash(sudo:*)`, followed by `--strict-mcp-config`

## ADDED Requirements

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
verifies, focused runs, mutation checks, the baseline verify, `osq check`,
retry recertification, and sync verify.

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

### Requirement: Agent role environment
Each harness adapter's task spawn (agy, opencode, codex, pi, and claude) SHALL
pass the child the environment `buildRoleEnv('agent', ...)` builds with the
task's config, the adapter's own harness name, and extra variables
`OSQ_TASK_NUMBER` and `OSQ_SPEC_FOLDER`. It SHALL NOT spread `process.env`.
Interactive planner sessions, version probes, usage reads, and session
exports SHALL keep osq's environment.

#### Scenario: Claude task environment
- **WHEN** the claude adapter spawns a fake binary that records its environment, while osq's environment sets `ANTHROPIC_API_KEY`, `OPENAI_API_KEY`, and `SECRET_PROBE`
- **THEN** the record holds `ANTHROPIC_API_KEY`, `OSQ_TASK_NUMBER`, and `OSQ_SPEC_FOLDER`, and neither `OPENAI_API_KEY` nor `SECRET_PROBE`

#### Scenario: Configured agent name
- **WHEN** the codex adapter spawns a fake binary with a config listing `AGENT_PROBE` in `confinement.roles.agent.env`, while osq's environment sets `AGENT_PROBE` and `SECRET_PROBE`
- **THEN** the record holds `AGENT_PROBE` and no `SECRET_PROBE`

### Requirement: OpenCode executor agent permissions
`OPENCODE_AGENT_TEMPLATE`, the executor agent file `osq setup` writes when
none exists, SHALL set `bash` to a map rather than `allow`: `"*": allow`, then
`deny` for `"git"`, `"git *"`, `"curl *"`, `"wget *"`, `"ssh *"`, `"scp *"`,
and `"sudo *"`. `read`, `edit`, `glob`, and `grep` SHALL stay `allow`, and
`webfetch` and `websearch` SHALL stay `deny`. An existing agent file's
frontmatter SHALL stay as it is.

#### Scenario: New agent file denies git and network tools
- **WHEN** `osq setup` writes a new `.opencode/agent/osq-coder.md`
- **THEN** its frontmatter's `bash` maps `*` to `allow` and each of `git`, `git *`, `curl *`, `wget *`, `ssh *`, `scp *`, and `sudo *` to `deny`

#### Scenario: Existing agent file keeps its permissions
- **WHEN** `osq setup` runs with an existing agent file whose frontmatter sets `bash: allow`
- **THEN** that line is unchanged and only the managed block is refreshed
