## MODIFIED Requirements

### Requirement: Autopilot stopped item
The Needs you group SHALL also hold, as TypeScript's `autopilotStoppedItem`
does, one autopilot-stopped item when `read_autopilot_stop` gives a record.
Its id is the record's `change`, or its `item` when `change` is `None`.
With a `change`, its title is the title of the first listed change, in the
order "Inbox trees" lists every location, whose folder matches the
`change`, or the `change` when none matches or that title is empty. A
folder matches when rust-core `parse_change_id` reads the `change` with
`slug` false into an id that names the folder, as rust-core "Change ids"
says, and a `change` it refuses matches no folder. Without a `change`, its title
is the title `read_queue_titles` gives for the slug `item`, or the `item`
when it gives none. Its line is
`  <id>: <title> — autopilot stopped: <reason><detail> — <command>`, where
`<command>` is the record's `command` and `<detail>` is empty without a
detail, and otherwise `: ` followed by the detail with every run of
whitespace read as one space.

#### Scenario: Autopilot stops
- **WHEN** `InboxFeature::new()` runs `inbox` on a scratch project with no `osq.toml` whose one change is the archived `040-stopped`, titled `Stopped`, with no `archived` event, whose `openspec/queue.md` is `# q\n\n## [next-item] The next item\n\nDepends on: nothing\n\n### Goal\n\nX.\n` unless the row says otherwise, and whose `openspec/.run/autopilot-stop.md` is `---`, the row's frontmatter lines, `at: 2026-10-22T10:00:00.000Z`, `---` and the row's body
- **THEN** its output text is `Needs you`, the row's line, `Running`, `  (none)`, `Landed since last look` and `  (none)`, each followed by a newline, or `Inbox empty.` and a newline when the row has no line:

| Frontmatter | Body | Needs-you line |
|---|---|---|
| `reason: halted`, `item: stopped-item`, `change: "040"`, `command: osq retry 040 1` | `task 1 died:\n  verify_red\n` | `  040: Stopped — autopilot stopped: halted: task 1 died: verify_red — osq retry 040 1` |
| `reason: land_stopped`, `item: gone-item`, `change: "041"`, `command: osq land 041` | empty | `  041: 041 — autopilot stopped: land_stopped — osq land 041` |
| `reason: halted`, `item: stopped-item`, `change: "40"`, `command: osq retry 040 1` | empty | `  40: Stopped — autopilot stopped: halted — osq retry 040 1` |
| `reason: plan_refused`, `item: next-item`, `command: osq queue approve` | empty | `  next-item: The next item — autopilot stopped: plan_refused — osq queue approve` |
| `reason: queue_unreadable`, `item: next-item`, `command: osq queue approve`, with `## [Bad Slug] Broken\n\nDepends on: nothing\n\nY.\n` appended to the queue | `bad slug\n` | `  next-item: next-item — autopilot stopped: queue_unreadable: bad slug — osq queue approve` |
| `reason: not_approved`, `item: other-item`, `command: osq queue approve` | empty | `  other-item: other-item — autopilot stopped: not_approved — osq queue approve` |
| `reason: bogus`, `item: next-item`, `command: osq queue approve` | empty | none |

#### Scenario: Autopilot stop naming a change that is not a change id
- **WHEN** `InboxFeature::new()` runs `inbox` on the scratch project of "Autopilot stops", with `openspec/.run/autopilot-stop.md` holding the frontmatter lines `reason: halted`, `item: stopped-item`, the row's `change` line and `command: osq retry 040 1`, then `at: 2026-10-22T10:00:00.000Z`, and an empty body
- **THEN** its output text is `Needs you`, the row's line, `Running`, `  (none)`, `Landed since last look` and `  (none)`, each followed by a newline:

| Change line | Needs-you line |
|---|---|
| `change: "040]"` | `  040]: 040] — autopilot stopped: halted — osq retry 040 1` |
| `change: "040-stopped-x"` | `  040-stopped-x: 040-stopped-x — autopilot stopped: halted — osq retry 040 1` |
| `change: "040-stopped"` | `  040-stopped: Stopped — autopilot stopped: halted — osq retry 040 1` |
