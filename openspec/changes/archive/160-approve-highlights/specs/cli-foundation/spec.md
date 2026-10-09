## MODIFIED Requirements

### Requirement: One proposal format
The osq schema's proposal template SHALL be byte-identical to
`templates/proposal.md`, the template `osq new` writes. The schema's proposal
instruction and the proposal rules in `templates/openspec/config.yaml` SHALL
name the sections Goal, Verify, Non-goals, Surface, Decisions, Assumptions,
Contract, Human steps, and Delta in that order, the frontmatter `verify`
command, and `features.reads`, and SHALL NOT ask for Why, What Changes,
Capabilities, or Impact sections. The template's `## Surface` section SHALL
hold an HTML comment naming the categories commands, flags, config keys,
frontmatter fields, document sections, dead reasons, and event types, followed
by the line `None`. The template's `## Decisions` section SHALL hold an HTML
comment describing decision lines and departure lines, followed by the line
`None`. The template's `## Assumptions` section SHALL hold an HTML comment
asking for one line per assumption the plan rests on that the human should
check before approving, followed by the line `None`. The managed `PLANNER.md`
block SHALL tell the planner to fill `## Surface` after `## Non-goals`, list
the same categories, and allow a single `None`, and to write `## Assumptions`
after `## Decisions` as `None` or one line per assumption.

#### Scenario: Both proposal entry points agree
- **WHEN** the schema's proposal template and `templates/proposal.md` are compared
- **THEN** they are byte-identical

#### Scenario: Instruction matches the planner
- **WHEN** the schema's proposal instruction and the managed `PLANNER.md` block are inspected
- **THEN** both name `## Goal`, `## Non-goals`, `## Surface`, and `## Human steps`, and the instruction contains no `What Changes` or `Capabilities` section

#### Scenario: Seeded surface section
- **WHEN** `osq new` seeds a proposal
- **THEN** its `## Surface` section follows `## Non-goals`, precedes `## Contract`, and holds the categories comment followed by `None`

#### Scenario: Seeded decisions section
- **WHEN** `osq new` seeds a proposal
- **THEN** its `## Decisions` section follows `## Surface`, precedes `## Contract`, and holds a comment followed by `None`

#### Scenario: Seeded assumptions section
- **WHEN** `osq new` seeds a proposal, or the template file is unreadable and the fallback seeds it
- **THEN** its `## Assumptions` section follows `## Decisions`, precedes `## Contract`, and holds a comment followed by `None`

## ADDED Requirements

### Requirement: Notices configuration
`osq.config.ts` MAY set `notices.maxShown`, `notices.maxTasks` and
`notices.maxResolvedFiles`, each a positive integer, and `notices.rulePaths`, a
list of non-empty scope patterns. The resolved config SHALL always hold
`notices`, defaulting to
`{ maxShown: 5, maxTasks: 6, maxResolvedFiles: 15, rulePaths: [] }`, with a
partial block keeping each missing default. `defineConfig` SHALL throw
`notices configuration must be an object` for a block that is not an object,
`notices.<key> must be a positive integer` for a count that is not one, and
`notices.rulePaths must be a list of scope patterns` for any other
`rulePaths` value. osq's own `osq.config.ts` SHALL list
`src/harness/prompt.ts` and `src/core/foundation/init-blocks.ts`, where its
executor and planner prompts are written, in `notices.rulePaths`.

#### Scenario: Default notices
- **WHEN** `osq.config.ts` has no `notices` block
- **THEN** the resolved config holds `{ maxShown: 5, maxTasks: 6, maxResolvedFiles: 15, rulePaths: [] }`

#### Scenario: Invalid notices
- **WHEN** `defineConfig` receives the row's `notices` block
- **THEN** it throws the row's error

| block | error |
| --- | --- |
| `[]` | notices configuration must be an object |
| `{ maxShown: 0 }` | notices.maxShown must be a positive integer |
| `{ maxTasks: 2.5 }` | notices.maxTasks must be a positive integer |
| `{ rulePaths: ['a', ''] }` | notices.rulePaths must be a list of scope patterns |
