## MODIFIED Requirements

### Requirement: Blocked exit
<!-- source: src/watcher/blocked.ts, src/watcher/task-verify.ts, src/watcher/runner.ts, src/watcher/failure-reason.ts, tests/blocked-exit.test.ts, tests/result-none-sections.test.ts -->
After the agent exits and the runner has made sure a result file exists, a
result file whose `## Blocked` section `parseResultSections` reads as present
SHALL make the task die with reason `blocked`. The runner SHALL check this
before the missing verify path check, the task verify, and the change verify,
and SHALL run none of them for a blocked task. The dead marker SHALL carry
`reason: blocked` in its frontmatter and the stated need in its body, and one
`dead` event SHALL record reason `blocked`. A `## Blocked` section that is empty
or says only `None`, as "Result file sections" defines it, SHALL leave the task
to the checks that follow, as before. `blocked` SHALL NOT be one of the reasons
eligible for an automatic retry.

#### Scenario: Executor stops blocked
- **WHEN** a fake agent writes a result file whose `## Blocked` says `Needs src/b.ts in scope` and writes no code
- **THEN** the task dies with `blocked`, the dead marker body holds `Needs src/b.ts in scope`, and no `verify_ran` event follows the agent's exit

#### Scenario: Blocked task is not retried
- **WHEN** a watcher cycle with `gates.autoRetries` of 1 sees a task that died with `blocked`
- **THEN** the task stays dead and no `retry` event is appended

#### Scenario: Blocked says None
- **WHEN** the result file's `## Blocked` says only `None`
- **THEN** the task goes through the missing-path check and verify as before

#### Scenario: Blocked says None as a bullet
- **WHEN** a fake agent's result file says `- None.` under `## Blocked` and the task's verify passes
- **THEN** a `verify_ran` event follows, the task is done, and the change archives
