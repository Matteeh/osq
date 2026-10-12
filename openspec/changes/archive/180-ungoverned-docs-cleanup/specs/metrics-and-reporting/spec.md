## MODIFIED Requirements

### Requirement: Inbox waiting report output
`getMetricsReport(projectRoot, config, options)` SHALL take `options` with
`home`, `since`, and `until`, defaulting to `os.homedir()` and no bounds,
and SHALL hold `collectInboxWait`'s result as `inboxWait` when it is not
null. The text SHALL print the `formatInboxWait` lines as its own section
after the `Mutation:` section's place, and the stable JSON SHALL hold
`inboxWait` with the fields `collectInboxWait` returns. With no wait log,
the JSON SHALL have no `inboxWait` key and the text no section, so the
report is unchanged.

`osq report` SHALL take `--since <date>` and `--until <date>`, read through
`parseReportPeriod(since, until)`, which reads each given value with
`Date.parse` and returns `{ since, until }` as dates or null. It SHALL throw
`--since is not a date: <value>` or `--until is not a date: <value>` for a
value `Date.parse` cannot read, and `--since must be before --until` when
both are given and `since` is not earlier. `reportCommand` SHALL call it
inside its existing error handling, so a bad value prints
`Report error: <message>` and exits 1. The flags SHALL affect only the
`Inbox waiting` section.

#### Scenario: Section printed
- **WHEN** `reportCommand` runs with the fixture log under a temporary home
- **THEN** the text holds `Inbox waiting (start to now):`, and with `json` the output holds `inboxWait.kinds.approval.handled`

#### Scenario: Period passed through
- **WHEN** `reportCommand` runs with `since` after every record in the fixture log
- **THEN** the text holds `  approval: not measured`

#### Scenario: No log unchanged
- **WHEN** `reportCommand` runs with a temporary home and no wait log
- **THEN** the JSON has no `inboxWait` key and the text no `Inbox waiting` line

#### Scenario: Bad date
- **WHEN** `parseReportPeriod('yesterday', null)` runs
- **THEN** it throws `--since is not a date: yesterday`

#### Scenario: Registered
- **WHEN** `createProgram` builds the CLI
- **THEN** the `report` command has `--json`, `--since`, and `--until` options

## ADDED Requirements

### Requirement: Harness-reported cost
The system SHALL sum finite harness-reported cost values from task events without estimating missing cost. Cost reporting SHALL identify harness-reported provenance, retain total, formatted-total, and per-change values, and state how many attempts contained at least one cost value out of all recorded attempts.

#### Scenario: Cost provenance and attempt coverage
- **WHEN** `osq report` renders cost history
- **THEN** output names harness-reported cost and states `n of m attempts reported cost`, counting each cost-bearing attempt once

#### Scenario: No reported cost
- **WHEN** no recorded attempt contains a finite cost value
- **THEN** history reports zero harness-reported cost with zero covered attempts and does not estimate a value

### Requirement: Label recording
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

The root help SHALL list `label` in the Inspection group right after `query`.
With `OSQ_SERVER` set, `osq label` SHALL refuse as a local-only command.

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

#### Scenario: Label in the help
- **WHEN** the root help is printed
- **THEN** its Inspection group lists `label` right after `query`

#### Scenario: Label stays local
- **WHEN** `osq label 007.v2.1 true` runs with `OSQ_SERVER` set
- **THEN** it fails with `osq label runs only locally; unset OSQ_SERVER to run it here, or run it on the server` before contacting the server

## REMOVED Requirements

### Requirement: Cost reporting and price table disclaimer
**Reason**: Its last sentence and its "Disclaimer display" scenario pin the README's price-table sentence, and the README is ungoverned.
**Migration**: "Harness-reported cost" keeps the rest of the text and the other two scenarios word for word.

### Requirement: Label command
**Reason**: It pins a line in the README's Inspection block, and the README is ungoverned.
**Migration**: "Label recording" keeps every other sentence and scenario, with "Label in the help and README" now "Label in the help".
