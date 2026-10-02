## ADDED Requirements

### Requirement: Harness containment report
Every harness catalog entry SHALL declare `containment`, a function from
configuration to `{ ok, warning?, message }` that says what confines that
harness's agent. When the `config` check passes, doctor SHALL add one
`harness-containment` check for the selected harness from its catalog entry,
right after `harness` and any checks its `diagnose` hook adds, whether or not
the harness probe passed, and without naming any harness. The messages SHALL
be:

- `agy` with `agy.dangerouslySkipPermissions: true`: a passing warning,
  `agy.dangerouslySkipPermissions is true: agy approves every tool call, so nothing stops git, network tools, or sudo`.
- `agy` otherwise: a failure,
  `agy asks before every tool call and a headless task cannot answer; set agy.dangerouslySkipPermissions: true to accept that, or choose another harness`.
- `claude`: passing, as "Claude diagnostics" describes.
- `codex`: passing,
  `workspace-write sandbox: writes confined to the project, .git read-only, no network`.
- `opencode` with `opencode.agent` set to `osq-coder`: passing,
  `osq-coder agent denies git, curl, wget, ssh, scp, sudo, and web tools; shell unconfined with open network`.
- `opencode` with any other agent: a passing warning,
  `opencode.agent is <agent>, not osq-coder: that agent's own permissions apply, not osq's denials`.
- `pi`: passing,
  `nothing confines the agent: no permission prompts, no sandbox, open network`.
- `mock`: passing, `no agent process`.

#### Scenario: Codex containment
- **WHEN** doctor runs with harness `codex`
- **THEN** the check after `harness` is a passing `harness-containment` check naming the workspace-write sandbox

#### Scenario: agy without the bypass
- **WHEN** doctor runs with harness `agy` and `agy.dangerouslySkipPermissions` unset
- **THEN** the `harness-containment` check fails naming `agy.dangerouslySkipPermissions`, and doctor exits 1

#### Scenario: agy with the bypass
- **WHEN** doctor runs with harness `agy` and `agy.dangerouslySkipPermissions: true`
- **THEN** the `harness-containment` check passes with a warning saying agy approves every tool call

#### Scenario: opencode with another agent
- **WHEN** doctor runs with harness `opencode` and `opencode.agent: 'build'`
- **THEN** the `harness-containment` check passes with a warning naming `build`

#### Scenario: Containment follows diagnoses
- **WHEN** doctor runs with harness `pi` and `pi.provider` set
- **THEN** the checks run `config`, `harness`, `harness-version`, `harness-auth`, `harness-containment`, then `managed-blocks`

## MODIFIED Requirements

### Requirement: Claude diagnostics
The `claude` catalog entry SHALL declare a `diagnose` hook that adds a
`harness-version` check failing when `claude --version` is below 2.1.278,
naming the version and the minimum. Its `containment` SHALL pass and say that
file tools are confined to the project and `git` is denied, and that Bash is
sandboxed with no network when `claude.sandbox` is true or unconfined with
open network otherwise; doctor reports it as the `harness-containment` check.
Claude preflight SHALL fail before any task spawns on the same version
condition.

#### Scenario: Old version
- **WHEN** `claude --version` prints `2.1.200 (Claude Code)`
- **THEN** doctor's `harness-version` check fails naming `2.1.200` and `2.1.278`, and preflight fails before any task spawns

#### Scenario: Containment report
- **WHEN** doctor runs with `claude.sandbox: true`
- **THEN** the `harness-containment` check says that Bash is sandboxed without network, that file tools are confined to the project, and that `git` is denied

### Requirement: Codex consumer guidance
The README and scaffolded environment example SHALL describe Codex selection, independent planning configuration, optional model/effort, precedence, setup and authentication prerequisites, permissions, diagnostics, fresh sessions, watcher verification, and observed-only metrics. The scaffolded `osq.config.ts` SHALL select `process.env.OSQ_HARNESS || 'codex'`, and the scaffolded environment example SHALL start with `OSQ_HARNESS=codex`. Examples SHALL contain no credentials or hard-coded recommended model.

#### Scenario: Scaffold preservation
- **WHEN** a clean project is scaffolded and later scaffolded again after its environment example is edited
- **THEN** the original generated example includes commented Codex guidance and the repeat run preserves consumer edits

#### Scenario: Honest support boundaries
- **WHEN** a consumer reads the Codex guidance
- **THEN** it distinguishes task scope from sandbox permissions, leaves unreported cost unestimated, and describes optional live validation without claiming an untested minimum CLI version

#### Scenario: Codex is the scaffolded default
- **WHEN** `osq init` runs in an empty directory
- **THEN** `osq.config.ts` contains `harness: process.env.OSQ_HARNESS || 'codex'` and the first line of `.env.example` is `OSQ_HARNESS=codex`
