## ADDED Requirements

### Requirement: Steering planner decision
osq's decisions SHALL include ADR 018, `decisions/018-steering-planner.md`,
accepted, applying to `watcher-and-harness` and `cli-foundation`, with the rule
"With autoSteer on, the watcher runs one planner per run steering trigger; it
writes only the change folder, osq lints the plan, and a human approves." and
no `checks`. `validateDecisions` SHALL report no error and no warning for
osq's decisions, and the index in `decisions/README.md` SHALL link
`018-steering-planner.md` exactly once. ADR 018 does not apply to all, so
AGENTS.md's project rules block SHALL not change.

#### Scenario: Steering planner ADR is accepted
- **WHEN** osq's own decisions are read with `readDecisions` and `DEFAULT_CONFIG`
- **THEN** ADR 018 is listed and not ignored, with status `accepted`, `appliesTo` `["watcher-and-harness", "cli-foundation"]`, that rule and `checks` `[]`, and `validateDecisions` reports no error and no warning

#### Scenario: Rules block keeps its lines
- **WHEN** `renderRulesBlock` renders osq's own decisions
- **THEN** no line ends in `ADR 018` and `checkProjectRules` reports nothing

### Requirement: Automatic steering configuration
`osq.config.ts` MAY hold an `autoSteer` block with `enabled`, a boolean that
defaults to `false`, and `timeoutSeconds`, a number greater than zero that
defaults to `1800` (`DEFAULT_AUTO_STEER_TIMEOUT_SECONDS`).
`validateAutoSteerConfig(raw)` in `src/core/foundation/config-auto-steer.ts`
SHALL resolve it, and `defineConfig` SHALL put the resolved block, with both
keys, on the config. Without the block, the config SHALL have no `autoSteer`
key. On the `AutoSteerConfig` type `timeoutSeconds` SHALL be optional, so a
config may name only `enabled`, and readers SHALL fall back to
`DEFAULT_AUTO_STEER_TIMEOUT_SECONDS`. Keys SHALL be checked first, then
`enabled`, then `timeoutSeconds`.

`plannerRunConfig(config)` in the same module SHALL return the config the
steering planner's adapter runs with: `harness` set to the harness
`resolvePlannerSelection(config)` selects and, when that harness's catalog
entry names a config section, that section's `model` and `agent` set to the
selection's model and agent where the selection has them. Every other field
SHALL be unchanged.

#### Scenario: Auto steer values
- **WHEN** `defineConfig` resolves each `autoSteer` value below
- **THEN** the config holds the result, or `defineConfig` throws the message

| autoSteer | result |
|---|---|
| absent | no `autoSteer` key |
| `{}` | `{ enabled: false, timeoutSeconds: 1800 }` |
| `{ enabled: true }` | `{ enabled: true, timeoutSeconds: 1800 }` |
| `{ enabled: true, timeoutSeconds: 600 }` | `{ enabled: true, timeoutSeconds: 600 }` |
| `true` | throws `autoSteer must be an object` |
| `{ model: "x" }` | throws `autoSteer.model is not supported` |
| `{ enabled: "yes" }` | throws `autoSteer.enabled must be a boolean` |
| `{ enabled: true, timeoutSeconds: 0 }` | throws `autoSteer.timeoutSeconds must be a positive number` |

#### Scenario: Planner run config from the planner block
- **WHEN** a config has `harness: "agy"` and `planner: { harness: "opencode", model: "anthropic/claude-x", agent: "osq-planner" }`
- **THEN** `plannerRunConfig` returns `harness` `opencode`, `opencode.model` `anthropic/claude-x` and `opencode.agent` `osq-planner`, with `opencode.bin` and the `agy` section unchanged

#### Scenario: Planner run config without a planner block
- **WHEN** a config has `harness: "mock"` and no `planner` block
- **THEN** `plannerRunConfig` returns a config deeply equal to it

### Requirement: Steering prompt for the watcher
`buildSteeringPrompt(projectRoot, config, id)` in
`src/cli/plan-steer-prompt.ts` SHALL return exactly the prompt
`osq plan <id> --print` prints, without its final newline, for a change that
`readSteeringPlan` finds needing steering, and null when `readSteeringPlan`
returns null. It SHALL write nothing. `osq watch`, in every role and with
`--once`, SHALL pass it to `startWatcher` as `steeringPrompt`.

#### Scenario: Same prompt as osq plan
- **WHEN** approved change 001 runs in its worktree with task 1 done and task 2 dead with `reason: blocked`
- **THEN** `buildSteeringPrompt(repo, config, "001")` equals the stdout of `osq plan 001 --print` without its final newline, contains `## Steering`, and the change folder holds no `plan-prompt.md`

#### Scenario: Nothing to steer
- **WHEN** no change matches `042`
- **THEN** `buildSteeringPrompt(repo, config, "042")` returns null

#### Scenario: osq watch starts the planner
- **WHEN** `osq.config.ts` sets `harness: "mock"` and `autoSteer: { enabled: true }`, approved change 001 runs in its worktree with task 2 dead with `reason: blocked`, and `osq watch --once` runs twice
- **THEN** 001's `.run/auto-steer.md` records outcome `unchanged`, and its `.run/events/change.jsonl` holds exactly one `auto_steer_ran` event
