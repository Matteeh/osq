## ADDED Requirements

### Requirement: Verify command
`run_verify(request: &VerifyRequest) -> Result<VerifyOutcome,
ProcessError>` in `osq-kernel-harnesses` SHALL run `request.command` as
`runVerificationCommand` does: through `/bin/sh -c` in `request.cwd`, in
its own process group, stdin closed. Past `request.timeout` the group gets
`SIGTERM`, then `SIGKILL` after `request.kill_grace`. After the shell
exits, the runner waits at most `kill_grace` for the output pipes to
close. A shell that cannot start is `ProcessError::Spawn`.

#### Scenario: Verify runs of small commands
- **WHEN** `run_verify` runs each row's command in a new temporary folder, given as its canonical path, with the source environment `PATH` set to the test's `PATH`, no configured or agent names, no change, no diff, a `kill_grace` of 300 milliseconds and the row's timeout
- **THEN** the outcome has the row's output, exit code and timed-out flag, and each run returns in under 5 seconds:

| Command | Timeout | Output | Exit code | Timed out |
|---|---|---|---|---|
| `echo out; sleep 0.2; echo err >&2; exit 3` | none | `out\nerr\n` | 3 | false |
| `printf 'a\n\n   \nb'` | none | `a\n\n   \nb` | 0 | false |
| `kill -KILL $$` | none | empty | 1 | false |
| `echo started; sleep 10` | 300 ms | `started\n` | 1 | true |
| `(sleep 10) & echo done` | none | `done\n` | 0 | false |
| `pwd -P; echo "$(pwd -P)/src/a.rs:1"` | none | `.\nsrc/a.rs:1\n` | 0 | false |

#### Scenario: Verify stops the whole group
- **WHEN** `run_verify` runs `sh -c 'sleep 1; echo late > late.txt' & echo started; wait` in a new temporary folder with a timeout of 300 milliseconds and a `kill_grace` of 300 milliseconds, and the test then waits 1.5 seconds
- **THEN** the outcome is timed out with exit code 1 and output `started\n`, and `late.txt` does not exist in the folder

#### Scenario: Verify shell that cannot start
- **WHEN** `run_verify` runs with a `cwd` that does not exist
- **THEN** it returns `ProcessError::Spawn` naming `/bin/sh`

### Requirement: Verify environment
The command SHALL see exactly `role_env(EnvRole::Verify, source_env,
configured_env, agent_env, extra)` with no extra, then `OSQ_CHANGE` set to
`request.change` and `OSQ_DIFF` to `request.diff`, each removed when
`None` even if the source holds it, then every `request.extra_env`
variable set last. So a model key the agent names list never reaches
verify, even when it is configured (ADR 007).

#### Scenario: Verify variables
- **WHEN** `run_verify` runs `printf '%s\n' "${OSQ_CHANGE-unset}" "${OSQ_DIFF-unset}" "${OSQ_MUTANT-unset}" "${DEEPSEEK_API_KEY-unset}" "${ANTHROPIC_API_KEY-unset}" "${CI-unset}"` with the configured names `DEEPSEEK_API_KEY` and `CI`, the agent names `DEEPSEEK_API_KEY` and `ANTHROPIC_API_KEY`, and the row's source, change, diff and extra variables
- **THEN** its output is the row's six lines, each followed by `\n`:

| Source | Change | Diff | Extra | Lines |
|---|---|---|---|---|
| `DEEPSEEK_API_KEY=sk-model`, `ANTHROPIC_API_KEY=sk-ant`, `CI=true` | `/p/openspec/changes/001-a` | `/tmp/d/change.patch` | none | `/p/openspec/changes/001-a`, `/tmp/d/change.patch`, `unset`, `unset`, `unset`, `true` |
| `OSQ_CHANGE=/stale`, `OSQ_DIFF=/stale` | none | none | none | `unset`, `unset`, `unset`, `unset`, `unset`, `unset` |
| none | `/p/c` | none | `OSQ_MUTANT=1`, `OSQ_CHANGE=/x` | `/x`, `unset`, `1`, `unset`, `unset`, `unset` |

### Requirement: Verify outcome
`VerifyOutcome` SHALL hold `exit_code` (an `i32`), `timed_out`, `output`
and `duration`. `output` is stdout and stderr in the order the runner read
them, decoded as `String::from_utf8_lossy` does, then made relative to
`cwd` as `relativizeToolSummary` does: `<cwd>/` is removed and `<cwd>`
followed by the end, whitespace or one of `"'()[]{},;:` becomes `.`. A
timed-out run has exit code 1, and so does a run a signal ended.

#### Scenario: Verify outcome duration
- **WHEN** `run_verify` runs `sleep 0.3` with no timeout
- **THEN** the outcome's `duration` is at least 300 milliseconds and under 5 seconds, and its exit code is 0
