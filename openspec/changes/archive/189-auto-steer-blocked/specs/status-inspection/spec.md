## ADDED Requirements

### Requirement: Revised plan from the automatic planner
For a change whose derived state has `steering` and for which
`currentAutoSteer` returns a record, this requirement SHALL take precedence
over "Steering inbox items", "Dispatch items", "Next step commands" and "Next
step detail and format" wherever they give `osq plan <id>`. Without such a
record, every item, card and next step SHALL be exactly as those requirements
say.

With outcome `ready`:

- The change's needs-you item SHALL have command `osq approve <id>` and
  `autoSteer: { outcome: "ready", changed }`, and keep its `steering`. Its
  text row SHALL be `<row> — revised plan ready after <trigger> (<reason>):
  changed <changed joined by ", "> — osq approve <id>`, with `<row>` as
  "Steering inbox items" defines it.
- Its one dispatch `halt` item SHALL carry the record as `autoSteer` and the
  commands `osq approve <id>`, `osq plan <id>` and `osq show <id>`, in that
  order, so `osq inbox` maps `a` to the approval and the dashboard's change
  view offers the `approve` action.
- `readNextStep` SHALL return state `dead`, command `osq approve <id>`, and
  detail `revised plan ready`.

With any other outcome, the item SHALL keep command `osq plan <id>`, carry
`autoSteer: { outcome, changed }`, and its text row SHALL put
` — automatic planner <outcome>` just before ` — osq plan <id>`. The next step
SHALL stay as "Next step commands" says.

In `osq inbox`, the card of a halt item with `autoSteer` SHALL print
`  automatic planner: <outcome>` on the line after `  needs steering:`, with
`, changed <changed joined by ", ">` appended when `changed` is not empty.

#### Scenario: Ready plan in the inbox
- **WHEN** change 001, titled `Order Flow`, has task 2, titled `Second task`, dead with `reason: blocked`, and a current `ready` record with `changed` `["tasks/2.md"]`
- **THEN** `readInbox` holds one needs-you item for 001, a `task-dead` item with command `osq approve 001`, `steering: { trigger: "blocked", reason: "blocked" }` and `autoSteer: { outcome: "ready", changed: ["tasks/2.md"] }`, and its text row is `  001: Order Flow — task 2: Second task — revised plan ready after blocked (blocked): changed tasks/2.md — osq approve 001`

#### Scenario: Ready plan offers approve
- **WHEN** change 001 has that current `ready` record
- **THEN** `readDispatchItems` gives one `halt` item for 001 with the commands `osq approve 001`, `osq plan 001`, `osq show 001`, `getWebActions` for 001 lists an `approve` action with command `osq approve 001`, and `formatNextStep` renders `dead (revised plan ready) — osq approve 001`

#### Scenario: Ready plan card
- **WHEN** `formatDispatchCardBody` renders the halt item of change 001 with that current `ready` record
- **THEN** the line after `  needs steering: task 2 blocked (blocked)` is `  automatic planner: ready, changed tasks/2.md`

#### Scenario: Automatic planner left lint red
- **WHEN** change 001's task 2 is dead with `reason: blocked`, its result file's `## Blocked` section is `Needs src/three.txt`, and the current record has outcome `lint_red` and `changed` `["tasks/2.md"]`
- **THEN** its needs-you item has command `osq plan 001` and `autoSteer: { outcome: "lint_red", changed: ["tasks/2.md"] }`, its text row is `  001: Order Flow — task 2: Second task — needs steering: blocked (blocked): Needs src/three.txt — automatic planner lint_red — osq plan 001`, and its dispatch commands are `osq plan 001` and `osq show 001`

#### Scenario: Record for an earlier trigger
- **WHEN** change 001's `.run/auto-steer.md` holds a `ready` record whose key does not match its current triggers
- **THEN** its needs-you item has command `osq plan 001` and no `autoSteer`, and its next step is `dead` with command `osq plan 001` and detail `needs steering`
