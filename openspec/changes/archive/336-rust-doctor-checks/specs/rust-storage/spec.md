## ADDED Requirements

### Requirement: Planning token models
`planning_token_models(folder: &Path) -> Vec<String>` in
`osq-kernel-storage`, exported from the crate root, SHALL return the models
of a change folder's planning sessions that recorded tokens, as
TypeScript's `findUnpricedPlanningModels` finds them before it drops the
priced ones. It reads `<folder>/.run/plan.jsonl`; a missing or unreadable
file gives no models.

As TypeScript's `parsePlanRecords` reads the file, each line that is not
blank is parsed as JSON, and it is a record only when it is an object
whose `type` is `plan_started` or `plan_exited`, whose `sessionId` and
`timestamp` are non-empty strings, and whose `data` is an object. Any
other line is skipped. As `correlatePlanSessions` does, the records form
sessions by `sessionId`: a session's start is its first `plan_started`
record and its exit its first `plan_exited` record.

A session counts when its start's `data.model` is a non-empty string and
its exit recorded tokens. An exit recorded tokens when its
`data.usage.inputTokens` or `data.usage.outputTokens` is a finite number
of 0 or more, or when its `data.slice` is a valid slice whose
`tokens.input` or `tokens.output` is a finite number of 0 or more. As
TypeScript's `parsePlanningSlice` reads it, a slice is valid when it is an
object whose `start`, `end` and `approvedAt` are non-empty strings, whose
`turns` and `activeMinutes` are finite numbers of 0 or more, whose
`tokens` is an object, and whose `costSource` is absent, `null`,
`harness` or `price_table`.

The result is the models of the sessions that count, each once, sorted by
bytes.

#### Scenario: Planning token models of a folder
- **WHEN** `planning_token_models` reads a scratch change folder whose `.run/plan.jsonl` holds the row's lines, where `S(<id>, <model>)` stands for `{"type":"plan_started","sessionId":"<id>","timestamp":"2026-01-01T00:00:00Z","data":{"harness":"claude","model":"<model>"}}`, `E(<id>, <data>)` for `{"type":"plan_exited","sessionId":"<id>","timestamp":"2026-01-01T00:01:00Z","data":<data>}`, and `<slice>` for `"start":"a","end":"b","approvedAt":"c","turns":1,"activeMinutes":2`
- **THEN** it returns the row's models:

| Lines | Models |
|---|---|
| no file | none |
| `S(s1, m-b)`, `E(s1, {"usage":{"inputTokens":5}})`, `S(s2, m-a)`, `E(s2, {"usage":{"outputTokens":0}})`, `S(s3, m-b)`, `E(s3, {"usage":{"inputTokens":1}})` | `m-a`, `m-b` |
| `S(s1, m)`, `E(s1, {"usage":{}})` | none |
| `S(s1, m)` | none |
| `S(s1, m)`, `E(s1, {"usage":{"inputTokens":-1,"outputTokens":"5"}})` | none |
| `S(s1, m)`, `E(s1, {"usage":{},"slice":{<slice>,"tokens":{"output":3},"costSource":null}})` | `m` |
| `S(s1, m)`, `E(s1, {"usage":{},"slice":{<slice>,"tokens":{"input":3},"costSource":"price_table"}})` | `m` |
| `S(s1, m)`, `E(s1, {"usage":{},"slice":{<slice>,"tokens":{"input":3},"costSource":"guess"}})` | none |
| `S(s1, m)`, `E(s1, {"usage":{},"slice":{"start":"a","end":"b","approvedAt":"","turns":1,"activeMinutes":2,"tokens":{"input":3}}})` | none |
| `S(s1, m)`, `E(s1, {"usage":{},"slice":{<slice>,"tokens":{"input":null,"reasoning":4}}})` | none |
| `S(s1, )`, `E(s1, {"usage":{"inputTokens":5}})` | none |
| `S(s1, first)`, `S(s1, second)`, `E(s1, {"usage":{}})`, `E(s1, {"usage":{"inputTokens":5}})` | none |
| `S(s1, first)`, `S(s1, second)`, `E(s1, {"usage":{"inputTokens":5}})` | `first` |
| `not json`, blank line, `{"type":"plan_started","sessionId":"","timestamp":"t","data":{"model":"x"}}`, `{"type":"plan_ready","sessionId":"s9","timestamp":"t","data":{}}`, `S(s1, m)`, `E(s1, {"usage":{"outputTokens":2}})` | `m` |
