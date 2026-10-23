## ADDED Requirements

### Requirement: Frontmatter YAML errors
Frontmatter, the text between the opening and next `---` lines, SHALL not
parse exactly when `YAML.parse` throws on it. Its error's message is the
first `yaml` error's message without position, and its line is the file
line where that error starts, the opening `---` being line 1.
`parseFrontmatter` SHALL keep reading such frontmatter as empty data.

#### Scenario: Other readers of frontmatter that does not parse
- **WHEN** `parseFrontmatter` reads a file whose frontmatter does not parse
- **THEN** it returns empty data and the whole file as its body, as it did before

### Requirement: Change document frontmatter YAML error
When the change document's frontmatter does not parse, `osq lint` SHALL
report `<document> frontmatter is not valid YAML at line <line>: <message>`
on it, `<document>` being `proposal.md` or `spec.md`, and run no check that
reads that frontmatter: verify, `features.writes`, capability relations,
generated moves, sidecars, `depends_on`, `fixes` and undeclared reads. Body
and task checks still run.

#### Scenario: Proposal frontmatter that does not parse
- **WHEN** `osq lint` checks a change whose `proposal.md` starts with the lines `---`, `title: Lint: broken`, `depends_on: []` and `verify: pnpm verify`, and is otherwise one that lint accepts
- **THEN** lint fails with exactly one error on `proposal.md`, `proposal.md frontmatter is not valid YAML at line 2: Nested mappings are not allowed in compact mappings`, and no finding names a missing verify command

### Requirement: Task frontmatter YAML error
When a task file's frontmatter does not parse, `osq lint` SHALL report `Task
in <file> frontmatter is not valid YAML at line <line>: <message>` on it, run
none of that task's other checks apart from the control-character and
fused-acceptance checks, which read its raw text, and leave the task out of
every check across tasks.

#### Scenario: Task frontmatter that does not parse
- **WHEN** `osq lint` checks a change whose `tasks/1.md` starts with the lines `---`, `title: When a: b, c`, `verify: node --test tests/a.test.ts` and `scope:`, and is otherwise one that lint accepts
- **THEN** lint fails with exactly one error on `tasks/1.md`, `Task in 1.md frontmatter is not valid YAML at line 2: Nested mappings are not allowed in compact mappings`, and no other finding names `tasks/1.md`
