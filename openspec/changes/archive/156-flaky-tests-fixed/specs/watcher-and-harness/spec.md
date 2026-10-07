## MODIFIED Requirements

### Requirement: Reactive watcher loop and signal handling
The system SHALL watch specifications reactively and respond cleanly to termination signals. When `startWatcher` is given an abort signal and the signal fires, it SHALL start no cycle, file watcher or poll interval after the abort, and the promise it returns SHALL resolve once no cycle is running.

#### Scenario: SIGINT interruption handling
- **WHEN** SIGINT is received during task execution
- **THEN** watcher clears status line, restores cursor, awaits active task exit, and terminates immediately on second SIGINT

#### Scenario: Abort during setup
- **WHEN** a watcher's abort signal fires after its first cycle and before its file watcher and poll interval exist
- **THEN** neither is created, no further cycle runs, and `startWatcher`'s promise resolves

#### Scenario: Abort during a cycle
- **WHEN** a watcher's abort signal fires while a cycle is running
- **THEN** `startWatcher`'s promise resolves only after that cycle has finished, and no cycle starts after it
