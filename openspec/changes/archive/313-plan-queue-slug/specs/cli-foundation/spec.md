## MODIFIED Requirements

### Requirement: Next queue item planning
The planning command SHALL accept either ordinary `osq plan <name>` behavior or
`osq plan --next [slug] [--replan] [--print]`. Next mode SHALL select exactly the first
unplanned queue item in file order whose queue dependencies and fixed items are
landed, create one numerically identified folder using the queue slug, seed its
proposal title, numeric archived dependency ids, and the numeric archived ids of
the items it fixes as `fixes`, and write the item body to `brief.md` with
`queue_item` and `queue_hash` metadata before entering the existing planning
flow. A proposal seeded without fixes SHALL carry no `fixes` key.

With a slug, next mode SHALL select the queue item with that slug instead of
the first eligible one, after the same active-failure check, and plan it as
it plans the first: the same seeding, brief, `queue_hash`, `--replan` rule,
spend gates and handoff. Before any write it SHALL refuse, in this order,
with `Queue item "<slug>" is not in the queue.` when no item has the slug,
`Queue item "<slug>" already has change <id> (<state>).` when the item's
queue state is neither `unplanned` nor `rejected`, and `Queue item "<slug>"
is waiting on <slugs>.` when it has unmet dependencies or fixed items, the
slugs as `osq queue` lists them, joined with `, `. Without a slug next mode
behaves as above.

Numeric allocation SHALL consider active, archived, and rejected folders.
Print mode SHALL create the change and emit the prompt without launching a
planner or recording a planning session. The planner context SHALL identify
the selected item and landed dependency archive paths without exposing later
queue items or the complete queue file.

#### Scenario: One eligible item
- **WHEN** `plan --next` finds an unplanned item whose dependencies are landed
- **THEN** exactly one correctly named and seeded change enters the same print or interactive flow as ordinary planning

#### Scenario: No eligible item
- **WHEN** every queue item is active, landed, rejected without replan permission, or waiting on an unlanded dependency
- **THEN** planning explains why nothing is eligible and creates no change

#### Scenario: Item that fixes a landed item
- **WHEN** the selected item carries `Fixes: first-item` and `first-item` landed as change 007
- **THEN** the new proposal's frontmatter carries `fixes: ["007"]`

#### Scenario: Fixed item not landed
- **WHEN** an item's `Fixes:` names an item that has not landed
- **THEN** the item waits as it would on an unlanded dependency and the queue lists the fixed slug among its unmet dependencies

#### Scenario: Named queue item
- **WHEN** the queue holds the unplanned items `first` and `second`, neither with dependencies, and `osq plan --next second --print` runs
- **THEN** it creates exactly one change folder, `001-second`, whose `brief.md` carries `queue_item: second` and the `queue_hash` of `second`'s section, prints that change's opening prompt with `second`'s brief, and the queue still lists `first` as unplanned

#### Scenario: Named queue item refused
- **WHEN** `osq plan --next <slug> --print` runs with the row's queue and slug
- **THEN** it fails with the row's text and creates no change folder:

| Queue | Slug | Text |
|---|---|---|
| `first` unplanned | `missing` | `Queue item "missing" is not in the queue.` |
| `first` planned as change `001-first` | `first` | `Queue item "first" already has change 001 (planned).` |
| `first` unplanned, `second` depending on `first` | `second` | `Queue item "second" is waiting on first.` |
