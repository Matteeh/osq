## ADDED Requirements

### Requirement: Failed exit with a result
When a task's agent exits non-zero without timing out, and the task's result
file was modified at or after that attempt's spawn started, the watcher SHALL
append one `exit_continued` event holding the agent's `exitCode` and then run
the checks a zero exit runs. The task SHALL become done only when they pass,
and otherwise SHALL die with the failing check's reason. Every other non-zero
exit or timeout SHALL die as before.

#### Scenario: Agent exit and result file
- **WHEN** the agent of task 1's first attempt ends as a row below describes
- **THEN** the task ends as the row gives:

| Exit code | Timed out | Result file | Task verify | Task ends | `exit_continued` events |
|---|---|---|---|---|---|
| 1 | no | written by this attempt | passes | done | one, `{"exitCode":1}` |
| 1 | no | written by this attempt | fails | dead, `verify_red` | one, `{"exitCode":1}` |
| 1 | no | written by this attempt, with a `## Blocked` section | passes | dead, `blocked` | one, `{"exitCode":1}` |
| 1 | no | none | passes | dead, `crashed` | none |
| 1 | no | left from an earlier attempt only | passes | dead, `crashed` | none |
| 124 | yes | written by this attempt | passes | dead, `timeout` | none |
| 0 | no | written by this attempt | passes | done | none |
