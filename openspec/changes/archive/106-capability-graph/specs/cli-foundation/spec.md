## ADDED Requirements

### Requirement: Graph command
<!-- source: src/cli/graph.ts, src/cli/index.ts, README.md, tests/web-graph-command.test.ts -->
`osq graph --json` SHALL print `serializeWebJson` of `getSystemGraph` for the
current project, followed by a newline, to stdout. `osq graph` without
`--json` SHALL print three lines:

```
Nodes: <kind> <count>, ...
Edges: <kind> <count>, ...
Gaps: untested <n>, unclaimed <n>, unowned <n>
```

`Nodes` and `Edges` SHALL list only kinds with a count above zero, in the
order "System graph document" and "System graph links" list the kinds, with
`owns`, `proves`, `covers`, `serves`, and `follows` after `imports` in that
order. A failure, such as a config error, SHALL print its message to stderr
and exit one. The command SHALL write no file. The README's command list SHALL
name `osq graph`.

#### Scenario: JSON output
- **WHEN** `osq graph --json` runs in a fixture project
- **THEN** stdout parses to the same document `getSystemGraph` returns for that project

#### Scenario: Summary output
- **WHEN** `osq graph` runs in a project with two capabilities without sidecars, three requirements, and one unowned file
- **THEN** stdout starts with `Nodes: capability 2, requirement 3,` and its last line is `Gaps: untested 0, unclaimed 0, unowned 1`
