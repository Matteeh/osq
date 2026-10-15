## ADDED Requirements

### Requirement: Tapped planner decision
osq's decisions SHALL include ADR 019, `decisions/019-tapped-planner.md`,
accepted, applying to `cli-foundation`, `watcher-and-harness` and
`web-inspection`, with the rule "A planner a human starts with a tap or osq
plan --run runs detached, as ADR 018 runs one; it writes only the change
folder, and a human approves." and no `checks`. `validateDecisions` SHALL
report no error and no warning for osq's decisions, and the index in
`decisions/README.md` SHALL link `019-tapped-planner.md` exactly once. ADR 019
does not apply to all, so AGENTS.md's project rules block SHALL not change.

#### Scenario: Tapped planner ADR is accepted
- **WHEN** osq's own decisions are read with `readDecisions` and `DEFAULT_CONFIG`
- **THEN** ADR 019 is listed and not ignored, with status `accepted`, `appliesTo` `["cli-foundation", "watcher-and-harness", "web-inspection"]`, that rule and `checks` `[]`, and `validateDecisions` reports no error and no warning

#### Scenario: Rules block without ADR 019
- **WHEN** `renderRulesBlock` renders osq's own decisions
- **THEN** no line ends in `ADR 019` and `checkProjectRules` reports nothing

### Requirement: Planner run command
`osq plan <id> --run` SHALL start a planner for one change in a detached osq
process and return. `--notes <text>` SHALL be valid only with `--run`, and
`--run` SHALL not combine with `--print`, `--session`, `--next` or `--brief`;
each such combination SHALL fail with exit code 1 before anything is written,
naming the two options. `planCommand(name, options)` SHALL hand a request
with `run` to `planRunCommand(name, options)` in `src/cli/plan-run.ts`, which
SHALL:

1. Resolve the change with `resolveChangeFolder`, derive its state, and read
   its `readNextStep`. When `canStartPlanner(next, location, config)` is
   false it SHALL fail with exit code 1 and
   `Error: <folder> has nothing for a planner to do; its next step is <formatted next step>`.
2. When `readLivePlanner(state)` returns a planner, fail with exit code 1 and
   `Error: a planner is already running for <folder> since <time>`, with
   `<time>` from `formatPauseUntil`.
3. Spawn the planner process through `spawnPlanWorker`, an option that
   defaults to starting `process.execPath` with `process.execArgv`,
   `process.argv[1]`, `plan`, the id, `--run`, and `--notes <text>` when
   given, in the project root, detached, with `OSQ_PLAN_RUN_ROLE=worker` added
   to the environment and its output appended to the change folder's
   `.run/logs/plan-run.log`, and unreferenced. It resolves to the child's pid.
4. Write the `running` record with that pid and the current time: for a
   change whose state has `steering`, `.run/auto-steer.md` with the change's
   current `steeringKey`; otherwise `.run/plan-run.md`.
5. Print `Planner started for <folder> (pid <pid>). osq show <id> shows its progress.`

With `OSQ_PLAN_RUN_ROLE` set to `worker`, or the `planRunRole` option set to
`worker`, `planRunCommand` SHALL instead run the planner in this process, as
"Planner run process" says, and exit zero whatever the outcome.

#### Scenario: Start for an unplanned change
- **WHEN** unapproved change 001 in the checkout has a brief and the planning sentinel verify, `vcs.enabled` is on, and `osq plan 001 --run` runs with a `spawnPlanWorker` that resolves 4242
- **THEN** `spawnPlanWorker` was called once with id `001` and no notes, `.run/plan-run.md` records outcome `running` with pid `4242`, and stdout is `Planner started for 001-demo (pid 4242). osq show 001 shows its progress.`

#### Scenario: Start refused while one runs
- **WHEN** the same change's `.run/plan-run.md` holds a `running` record whose pid is the test's own process
- **THEN** `osq plan 001 --run` exits 1 with `Error: a planner is already running for 001-demo since <time>`, and `spawnPlanWorker` is not called

#### Scenario: Nothing to plan
- **WHEN** approved change 001 runs in its worktree with no dead task and no steering
- **THEN** `osq plan 001 --run` exits 1 with `Error: 001-demo has nothing for a planner to do; its next step is running — osq show 001`, and `spawnPlanWorker` is not called

#### Scenario: Run option combinations
- **WHEN** `osq plan` runs with each option set below
- **THEN** it exits 1 before any file is written, with the error below:

| Options | Error |
|---|---|
| `001 --run --print` | `` Error: `--run` cannot be combined with `--print` `` |
| `001 --run --session` | `` Error: `--run` cannot be combined with `--session` `` |
| `001 --run --brief brief.md` | `` Error: `--run` cannot be combined with `--brief` `` |
| `001 --notes "use the cache"` | `` Error: `--notes` is valid only with `--run` `` |

### Requirement: Planner run process
The planner process, `planRunCommand` in the worker role, SHALL run one
planner for the change and write its outcome. Its harness and model SHALL be
the ones `resolvePlannerSelection(config)` selects, its timeout
`autoSteer.timeoutSeconds` or `DEFAULT_AUTO_STEER_TIMEOUT_SECONDS`, and its
adapter the `adapter` option when given, else `getHarnessAdapter` for that
harness. When notes were given, the prompt SHALL end with a blank line,
`## Notes from the human`, a blank line, and the notes.

For a change whose state has `steering`, it SHALL find the change with
`findSteeringChange`, build the prompt with `buildSteeringPrompt`, and call
`executeRun` with the change's tree root and folder, the current
`steeringKey`, and each trigger's `describeTrigger` text, as `runAutoSteer`
does. A prompt that cannot be built SHALL be written with `recordFailure`.

For any other change it SHALL plan in a scratch worktree:

1. Record the content of every file in the change folder outside `.run/`,
   and write a `running` `.run/plan-run.md` with its own pid.
2. Remove any earlier scratch tree at
   `<vcs.worktreeRoot>/<repo>/.planning/<folder>`, then add a detached
   worktree there at the checkout's HEAD commit with `vcs.worktreeAdd`, run
   `runPrepare` in it, and copy the change folder outside `.run/` into it at
   the same relative path.
3. Run `planCommand(id)` with the scratch tree as `cwd` and its output
   discarded, and read the scratch folder's `plan-prompt.md` as the prompt.
   Record the scratch folder's files again.
4. Spawn the planner once with `spawnPlanner`, with the scratch tree as its
   tree root and the scratch folder as its change folder.
5. Copy back every file of the scratch folder outside `.run/` that differs
   from step 1's record, and remove each one from the change folder that the
   scratch folder no longer holds. Append the scratch folder's
   `.run/events/planner.jsonl` to the change folder's.
6. Decide the outcome with `decideOutcome`, where `changed` lists what the
   planner changed since step 3's record and the lint runs on the change
   folder in the project root.
7. Write `.run/plan-run.md` with the outcome, the paths step 5 copied back or
   removed as `changed`, the time, `hash` set to `hashChangeFolder` of the
   change folder, and the failure output or lint errors as its body.

The scratch tree SHALL be removed with `fs.rm` and `vcs.worktreePrune` after
the run, whatever its outcome. An error in any step SHALL be written as a
`failed` record whose body is its message. Nothing outside the change folder
in the checkout SHALL change, and the process SHALL never approve, run a task,
or commit.

#### Scenario: Planned in a scratch tree
- **WHEN** unapproved change 001 in a git checkout has a brief and the sentinel verify, and the worker runs with a mock planner that writes a lint-clean `proposal.md` and `tasks/1.md` in its change folder and writes `src/stray.txt` in its tree
- **THEN** the change folder holds the planner's `proposal.md` and `tasks/1.md`, the checkout has no `src/stray.txt`, `.run/plan-run.md` records outcome `ready` with a `hash` equal to `hashChangeFolder` of the folder, and no scratch tree is left under `.planning`

#### Scenario: Scratch planner outcomes
- **WHEN** the worker runs for that change with each mock planner below
- **THEN** `.run/plan-run.md` records the outcome below:

| planner | outcome |
|---|---|
| exits 1 | `failed` |
| returns `timedOut: true` | `timed_out` |
| exits 0 without an edit | `unchanged` |
| exits 0 after writing `tasks/1.md` that keeps the sentinel verify | `lint_red` |

#### Scenario: Steered in place
- **WHEN** approved change 001 runs in its worktree with task 2 dead with `reason: blocked`, `autoSteer` is off, and the worker runs with a mock planner that rewrites `tasks/2.md`
- **THEN** `.run/auto-steer.md` records outcome `ready` with `changed` `["tasks/2.md"]`, and the change's `.run/events/change.jsonl` holds one `auto_steer_ran` event

#### Scenario: Notes reach the prompt
- **WHEN** the worker runs for the unplanned change with notes `use the cache`
- **THEN** the mock planner's prompt ends with `\n\n## Notes from the human\n\nuse the cache`

### Requirement: Planner run on a server
With `OSQ_SERVER` set, `osq plan <id> --run` SHALL be forwarded to the server
as a whole command, as `osq approve` is, and SHALL not download a working
copy. The server SHALL run it with the same command function, so the planner
starts on the server's clone. `osq plan <id>` without `--run` SHALL keep
downloading the working copy as today.

#### Scenario: Forwarded start
- **WHEN** `OSQ_SERVER` names a test server and `osq plan 001 --run` runs
- **THEN** the server receives one forwarded command `plan` with args `["001"]` and option `run` true, and no working copy is written under `~/.osq/remote/`
