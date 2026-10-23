## ADDED Requirements

### Requirement: Repository record sizes
The shared recent repository record SHALL take its three sizes from the
`planning.record` block: `minimumTasks`, the fewest measured tasks before
the record prints its lines; `recentChanges`, the most archived changes
its window holds; and `deadOutcomes`, the most dead outcome rows it
keeps. They SHALL default to 5, 20 and 10 and be positive integers; a
partial `planning.record` block keeps the other defaults, and an invalid
value SHALL fail configuration loading with
`planning.record.<key> must be a positive integer`. With fewer than
`minimumTasks` measured tasks the record SHALL print
`This repository's measured record is too small (fewer than <minimumTasks> tasks).`
With the defaults, every plan prompt SHALL stay byte for byte the same.
`src/core/report/report.ts` SHALL hold none of these numbers.

#### Scenario: Default record sizes
- **WHEN** configuration loads without a `planning.record` block
- **THEN** `planning.record` is `{ minimumTasks: 5, recentChanges: 20, deadOutcomes: 10 }`, and a record with 4 measured tasks prints `This repository's measured record is too small (fewer than 5 tasks).`

#### Scenario: Configured record sizes
- **WHEN** a temporary repository's archive holds the row's changes and configuration sets the row's `planning.record` block
- **THEN** the plan prompt's record body is the row's:

| `planning.record` | Archive | Record body |
|---|---|---|
| `{ minimumTasks: 6 }` | 5 measured tasks | `This repository's measured record is too small (fewer than 6 tasks).` |
| `{ minimumTasks: 1, recentChanges: 2 }` | 3 archived changes, each one measured task that died with `timeout` | first line `First-attempt passes: 0/2`, and two dead lines, of the two newest changes |
| `{ minimumTasks: 1, deadOutcomes: 1 }` | 3 archived changes, each one measured task that died with `timeout` | first line `First-attempt passes: 0/3`, and one dead line, of the newest change |

#### Scenario: Invalid record configuration
- **WHEN** `planning.record.minimumTasks`, `recentChanges` or `deadOutcomes` is zero, negative, or not an integer
- **THEN** configuration loading fails with `planning.record.<key> must be a positive integer`
