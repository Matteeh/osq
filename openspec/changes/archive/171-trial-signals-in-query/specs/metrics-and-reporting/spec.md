# Spec Delta: metrics-and-reporting

## ADDED Requirements

### Requirement: Trial query tables
`osq query` SHALL also build these six tables on every call, of archived
changes in folder order, from the change files, reading event streams through
the index, and store them nowhere. In each, `change` is the folder name and
`<id>` in an `id` is the folder's leading number, such as `007`.

- `validator_runs(change, run, outcome, harness, model, duration, exit_code, scenarios, findings, reason, output)`:
  one row per `validator_ran` event in the change's `.run/events/change.jsonl`,
  `run` its 1-based position among them, `findings` the length of its
  `findings`, and `reason` and `output` null when absent.
- `validator_findings(id, change, run, finding, capability, requirement, scenario, problem, detail, label)`:
  one row per entry of each run's `findings`, `finding` its 1-based position,
  and `id` `<id>.v<run>.<finding>`.
- `focused_runs(change, task, run, outcome, exit_code, duration, timed_out, scenarios, files)`:
  one row per `focused_ran` event in each task stream `.run/events/<n>.jsonl`,
  `run` its 1-based position in that stream, `timed_out` 1 or 0, and
  `scenarios` and `files` joined with a newline.
- `mutation_picks(change, task, pick, file, function, outcome, reason, killed, survived, invalid, duration, scenarios)`:
  one row per `mutation_ran` event in each task stream, `pick` its 1-based
  position in that stream, `reason` null when absent, and `scenarios` joined
  with a newline.
- `mutation_survivors(id, change, task, pick, file, function, line, column, mutator, replacement, label)`:
  one row per entry of each pick's `survivors`, `file` the survivor's own,
  `function` the pick's, and `id` `<id>.<task>.m<pick>.<n>` with `n` its
  1-based position.
- `link_findings(id, change, severity, file, message, label)`: one row per
  entry of the `traceability` list of the change's last `plan_ready` record,
  and `id` `<id>.l<n>` with `n` its 1-based position.

A task stream is a file whose name is digits and `.jsonl`, in numeric order.
An event without object `data` SHALL add no row, and a field of the wrong
type SHALL read as null. `label` SHALL be null unless "Trial labels" gives it
a value. `osq query` without a statement SHALL list these six tables after
`notices`, in this order, each with its columns.

#### Scenario: Trial rows of one archived change
- **WHEN** the archive holds `007-pricing`, whose `change.jsonl` holds a `validator_ran` event with outcome `failed` and output `boom` and then one with outcome `validated` and two findings; whose `2.jsonl` holds a `focused_ran` event with outcome `passed`, scenarios `widgets: Count` and files `tests/count.test.ts`, then a `mutation_ran` event with outcome `measured` on `src/count.ts` function `count` with one survivor at line 4 column 9, then a `mutation_ran` event with outcome `not_measured` and reason `budget`; and whose last `plan_ready` record's `traceability` holds one warning
- **THEN** the six tables hold exactly these rows:

| table | rows |
| --- | --- |
| `validator_runs` | (`007-pricing`, 1, `failed`, findings 0, output `boom`), (`007-pricing`, 2, `validated`, findings 2, output null) |
| `validator_findings` | ids `007.v2.1` and `007.v2.2`, run 2, findings 1 and 2, label null |
| `focused_runs` | (`007-pricing`, task `2`, run 1, `passed`, scenarios `widgets: Count`, files `tests/count.test.ts`) |
| `mutation_picks` | (task `2`, pick 1, `src/count.ts`, `count`, `measured`, reason null), (task `2`, pick 2, `not_measured`, reason `budget`) |
| `mutation_survivors` | (id `007.2.m1.1`, task `2`, pick 1, `src/count.ts`, `count`, line 4, column 9, label null) |
| `link_findings` | (id `007.l1`, `007-pricing`, `warning`, label null) |

#### Scenario: No trial data
- **WHEN** an archived change has no `validator_ran`, `focused_ran` or `mutation_ran` event and no `plan_ready` record with `traceability`
- **THEN** none of the six tables holds a row for it

#### Scenario: Trial tables listed
- **WHEN** `osq query` runs without a statement
- **THEN** it prints the twelve tables, the six above after `notices` in order, each with its columns, and exits zero

### Requirement: Trial labels
A human's labels SHALL live in two committed files under the openspec root:
`trials/validator.json` for validator findings, and
`trials/traceability.json` for mutation survivors and link findings. Each is
one JSON object from an id in "Trial query tables" to `true` or `false`.
osq SHALL read them on every `osq query` call and keep no copy, so a label
lives only in its file (ADR 008).

The `label` column of `validator_findings`, `mutation_survivors` and
`link_findings` SHALL hold 1 for an id labelled `true` in its file, 0 for
`false`, and null for an id with no label. A label whose id names no row
SHALL be kept and ignored. A missing file SHALL read as no labels. A file that is not
a JSON object whose values are all `true` or `false` SHALL make `osq query`
fail with the message
`<path> must be a JSON object of true or false labels`, the path relative to
the project root.

#### Scenario: Labels in the tables
- **WHEN** the archive holds the `007-pricing` change of "Trial rows of one archived change", `trials/validator.json` is `{"007.v2.1": true, "999.v1.1": false}`, and `trials/traceability.json` is `{"007.2.m1.1": false}`
- **THEN** `validator_findings` labels `007.v2.1` 1 and `007.v2.2` null, `mutation_survivors` labels `007.2.m1.1` 0, and `link_findings` labels `007.l1` null

#### Scenario: Malformed label file
- **WHEN** `trials/validator.json` is `{"007.v2.1": "yes"}`
- **THEN** `osq query "SELECT id FROM validator_findings"` exits 1 with the message `openspec/trials/validator.json must be a JSON object of true or false labels`

### Requirement: Label command
`osq label <id> <value>`, registered in `src/cli/query.ts` beside `osq query`,
SHALL record one label. A
`value` other than `true` or `false` SHALL fail with
`label must be true or false` before anything is read. It SHALL then build
the history tables. When no `validator_findings`, `mutation_survivors` or
`link_findings` row has that id, it SHALL fail with
`no validator finding, mutation survivor or link finding has id <id>` and
write nothing. Otherwise it SHALL set the id in the row's label file, creating the folder
and file when missing and replacing an earlier label for the same id, and
write the file as JSON with keys sorted, two-space indents and a trailing
newline. It SHALL print `<id>: <value> in <path>`, the path relative to the
project root, and exit zero. Each failure SHALL exit 1.

The root help SHALL list `label` in the Inspection group right after `query`,
and README's Inspection block SHALL list `osq label <id> <true|false>`. With
`OSQ_SERVER` set, `osq label` SHALL refuse as a local-only command.

#### Scenario: Labelling items
- **WHEN** each command below runs in order over the `007-pricing` archive of "Trial rows of one archived change", with no `trials` folder at first
- **THEN** it prints the output and leaves the files as shown:

| command | output | files after |
| --- | --- | --- |
| `osq label 007.v2.1 true` | `007.v2.1: true in openspec/trials/validator.json` | `validator.json` is `{\n  "007.v2.1": true\n}\n` |
| `osq label 007.l1 true` | `007.l1: true in openspec/trials/traceability.json` | `traceability.json` holds `007.l1` true |
| `osq label 007.2.m1.1 false` | `007.2.m1.1: false in openspec/trials/traceability.json` | `traceability.json` is `{\n  "007.2.m1.1": false,\n  "007.l1": true\n}\n` |
| `osq label 007.l1 false` | `007.l1: false in openspec/trials/traceability.json` | `traceability.json` holds `007.l1` false |
| `osq label 007.v9.9 true` | exit 1, `no validator finding, mutation survivor or link finding has id 007.v9.9` | unchanged |
| `osq label 007.v2.1 maybe` | exit 1, `label must be true or false` | unchanged |

#### Scenario: Label in the help and README
- **WHEN** the root help is printed and README's Inspection block is read
- **THEN** the help's Inspection group lists `label` right after `query`, and the block has a line that starts `osq label <id> <true|false>`

#### Scenario: Label stays local
- **WHEN** `osq label 007.v2.1 true` runs with `OSQ_SERVER` set
- **THEN** it fails with `osq label runs only locally; unset OSQ_SERVER to run it here, or run it on the server` before contacting the server
