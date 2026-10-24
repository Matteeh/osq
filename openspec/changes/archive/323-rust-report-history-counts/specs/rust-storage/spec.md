## ADDED Requirements

### Requirement: Task history
`read_task_history(folder: &Path, task: &str) -> TaskHistory` in
`osq-kernel-storage` SHALL read the lines of
`<folder>/.run/events/<task>.jsonl` in file order as TypeScript's report
reads a task stream. It skips a line that is blank after trimming and one
that is not a JSON object, and it gives an all-zero `TaskHistory` when the
file is missing or cannot be read. An event's type is its `type` member,
and its data is its `data` member when that is a JSON object, else none.
A number counts only when it is a finite JSON number.

`TaskHistory` SHALL be public, exported from the crate root, derive
`Debug`, `Clone`, `PartialEq` and `Default`, and hold:

- `attempts: u64`, the number of `started` events;
- `unexplained: u64`, the `started` events that follow an earlier
  `started` with no `dead` or `regressed` event between them;
- `dead_reasons: Vec<String>`, one entry per `dead` event in file order:
  its data's `reason`, trimmed, when that is a string that is not blank,
  else `unknown`;
- `verify_codes: Vec<Option<f64>>`, one entry per `verify_ran` event
  whose data's `phase` is not `pre_spawn`, in file order: its data's
  `exitCode` when that is a number, else `None`;
- `pre_spawn: PreSpawnHistory`, counted from the `verify_ran` events
  whose data's `phase` is `pre_spawn`;
- `costs: Vec<f64>`, every event's data `cost` that is a number, in file
  order, from events of any type;
- `cost_reported_attempts: u64`, the attempts holding a cost. An attempt
  runs from one `started` event to the next. A cost before the first
  `started` belongs to no attempt;
- `automatic: RetryGroup` and `manual: RetryGroup`, the attempts that
  `retry` events open. Each `retry` event opens an attempt that runs to
  the next `retry` event or the end of the file. The attempt is automatic
  when the data's `automatic` is exactly `true`, else manual;
- `stuck: u64`, the number of `stuck` events;
- `scope: ScopeHistory`, counted from `regressed` and `recertification`
  events.

`PreSpawnHistory` SHALL hold `runs`, `mismatches`, `missing_path_runs`
and `red`, `green` and `any`, each a `StartCount` of `runs` and `passed`,
all `u64`. A pre-spawn run counts in `runs`. It counts in `mismatches`
when its data's `mismatch` is exactly `true`, and in `missing_path_runs`
when its data's `missingPaths` is a non-empty array. When its data's
`expected` is exactly `red`, `green` or `any`, it counts in that start's
`runs`, and in its `passed` when its data's `exitCode` is the number 0.

`RetryGroup` SHALL hold `count: u64`, `reached_done: u64`, `cost: f64`
and `cost_reported_attempts: u64`. Each retry-opened attempt adds 1 to its
group's `count`. A first `done` event inside it adds 1 to `reached_done`,
and every later `done` in it changes nothing. The data `cost` of any event
inside it, except `retry`, `stuck` and `done` events, is added to the
group's `cost` in file order, and the attempt's first such cost adds 1 to
`cost_reported_attempts`.

`ScopeHistory` SHALL hold `detected`, `passed_at_detection`,
`failed_at_detection`, `recertified_by_human`,
`recertified_automatically` and `requeued_for_agent`, all `u64`. A
`regressed` event whose data's `reason` is `scope_regression` counts in
`detected`. It also counts in `passed_at_detection` when its data's
`exitCode` is the number 0, and in `failed_at_detection` when that is any
other number. A `recertification` event whose data's `outcome` is `passed`
counts in `recertified_automatically` when its data's `automatic` is
exactly `true`, else in `recertified_by_human`. One whose outcome is
`requeued` counts in `requeued_for_agent`.

#### Scenario: Task histories
- **WHEN** `read_task_history` reads task `1` of a scratch change folder whose `.run/events/1.jsonl` holds the row's lines, each followed by a newline, where `<type> <data>` is the line `{"type":"<type>","timestamp":"2026-10-21T08:00:00.000Z","data":<data>}` and `<type>` alone has the data `{}`
- **THEN** it returns the row's history, and every field the row leaves out is zero or empty:

| Lines | History |
|---|---|
| no event file | all zero |
| `started`, `started` | attempts 2, unexplained 1 |
| `started`, `dead {"reason":" timeout "}`, `started`, `regressed {"reason":"verify_red"}`, `started` | attempts 3, dead reasons `timeout` |
| `dead {"reason":"  "}`, `dead {"reason":7}`, `dead` | dead reasons `unknown`, `unknown`, `unknown` |
| `verify_ran {"exitCode":1}`, `verify_ran`, `verify_ran {"exitCode":"0"}`, `verify_ran {"exitCode":2.5}` | verify codes 1, none, none, 2.5 |
| `verify_ran {"phase":"pre_spawn","expected":"red","exitCode":0,"mismatch":true,"missingPaths":["a"]}`, `verify_ran {"phase":"pre_spawn","expected":"green","exitCode":1,"missingPaths":[]}`, `verify_ran {"phase":"pre_spawn","expected":"any","exitCode":0,"mismatch":"yes"}`, `verify_ran {"phase":"pre_spawn","expected":"blue","exitCode":0}` | pre-spawn runs 4, mismatches 1, missing path runs 1, red 1 passed of 1, green 0 passed of 1, any 1 passed of 1 |
| `tokens {"cost":0.5}`, `started {"cost":0.1}`, `tokens {"cost":0.2}`, `started`, `done {"cost":"1"}`, `started`, `tokens {"cost":0.3}` | attempts 3, unexplained 2, costs 0.5, 0.1, 0.2, 0.3, cost reported attempts 2 |
| `tokens {"cost":9}`, `retry {"automatic":true}`, `started {"cost":0.25}`, `done`, `done`, `retry`, `stuck`, `tokens {"cost":0.5}`, `tokens {"cost":0.5}`, `retry {"automatic":"true"}`, `done {"cost":2}` | attempts 1, costs 9, 0.25, 0.5, 0.5, 2, cost reported attempts 1, automatic count 1, reached done 1, cost 0.25, cost reported attempts 1, manual count 2, reached done 1, cost 1, cost reported attempts 1, stuck 1 |
| `regressed {"reason":"scope_regression","exitCode":0}`, `regressed {"reason":"scope_regression","exitCode":3}`, `regressed {"reason":"scope_regression"}`, `regressed {"reason":"verify_red","exitCode":0}`, `recertification {"outcome":"passed","automatic":true}`, `recertification {"outcome":"passed"}`, `recertification {"outcome":"passed","automatic":"true"}`, `recertification {"outcome":"requeued"}`, `recertification` | scope detected 3, passed at detection 1, failed at detection 1, recertified by human 2, recertified automatically 1, requeued for agent 1 |
| an empty line, `not json`, `[1]`, three spaces, `{"type":"started","data":[1]}`, `{"type":"dead","data":"x"}` | attempts 1, dead reasons `unknown` |

### Requirement: Rejection planner
`read_rejection_planner(folder: &Path) -> Option<String>` in
`osq-kernel-storage` SHALL return `None` unless
`<folder>/.run/events/change.jsonl` holds a line that is a JSON object
whose `type` is `rejected`. It skips blank lines and lines that are not
JSON objects, as `read_task_history` does. When there is such a line, it
SHALL return the `planner` string of `<folder>/brief.md`'s frontmatter as
`frontmatter_string` reads it, trimmed, when that is not blank, and
`unknown` otherwise.

#### Scenario: Rejection planners
- **WHEN** `read_rejection_planner` reads a scratch change folder holding the row's `change.jsonl` lines, each followed by a newline, and the row's `brief.md`
- **THEN** it returns the row's result:

| Lines | Brief | Result |
|---|---|---|
| no event file | `---\nplanner: claude-opus\n---\n` | none |
| `{"type":"archived","timestamp":"2026-10-21T08:00:00.000Z","data":{}}` | `---\nplanner: claude-opus\n---\n` | none |
| `{"type":"rejected","timestamp":"2026-10-21T08:00:00.000Z","data":{"reason":"x"}}` | `---\nplanner: " claude-opus "\n---\n` | `claude-opus` |
| `not json`, `{"type":"rejected"}` | none | `unknown` |
| `{"type":"rejected"}` | `---\nplanner: 7\n---\n` | `unknown` |
| `{"type":"rejected"}` | `---\nplanner: "  "\n---\n` | `unknown` |
