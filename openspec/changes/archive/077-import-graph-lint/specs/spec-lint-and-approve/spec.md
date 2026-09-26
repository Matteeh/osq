# Spec Delta: Spec Lint and Approve

## ADDED Requirements

### Requirement: Import graph
<!-- source: src/core/spec/import-graph.ts, tests/import-graph-build.test.ts -->
`buildImportGraph(projectRoot, options)` SHALL read every JavaScript and
TypeScript file outside ignored folders and `options.skip`, follow relative
`import`, `export from`, dynamic `import()`, and `require()` specifiers, resolve
them as TypeScript does, and record each file's imports and importers. A
repository without such files SHALL give an empty graph.

#### Scenario: .js specifier for a .ts file
- **WHEN** `src/a.ts` imports `./b.js` and only `src/b.ts` exists
- **THEN** the graph records that `src/a.ts` imports `src/b.ts`

#### Scenario: Python-only repository
- **WHEN** a repository holds only `.py` files
- **THEN** the graph is empty and building it raises nothing

### Requirement: Import specifier resolution
<!-- source: src/core/spec/import-graph.ts, tests/import-graph-build.test.ts -->
A relative specifier SHALL resolve to the first existing file among the exact
path; for `.js`, `.jsx`, `.mjs`, or `.cjs`, the same stem with `.ts` or `.tsx`,
`.tsx`, `.mts`, or `.cts`; the path plus each script extension; and the path's
`index` file with each extension. Bare and aliased specifiers SHALL not
resolve.

#### Scenario: Directory import
- **WHEN** `src/a.ts` imports `./lib` and `src/lib/index.ts` exists
- **THEN** the graph records that `src/a.ts` imports `src/lib/index.ts`

### Requirement: Frozen test reach warning
<!-- source: src/core/spec/test-impact.ts, tests/impact-lint.test.ts -->
Lint SHALL warn once per task whose existing scoped files are imported, within
`limits.importGraphDepth` levels, by preexisting files under `tests/` that no
task in the change may modify. The warning SHALL give their count and list up
to `limits.maxListedImporters` of them, nearest first, each with the scoped file
it reaches.

#### Scenario: Test two levels away
- **WHEN** `tests/a.test.ts` imports `src/b.ts`, which imports scoped `src/c.ts`
- **THEN** lint warns on that task's file naming `tests/a.test.ts (src/c.ts)`

#### Scenario: Test declared for modification
- **WHEN** a task declares `tests.modify: true` with `tests/a.test.ts` in scope
- **THEN** that test is left out and, with no other test, the warning goes away

### Requirement: Frozen test warning text
<!-- source: src/core/spec/test-impact.ts, tests/impact-lint.test.ts -->
The warning SHALL read `Task <n> scope is imported by <count> preexisting tests
that no task may modify, <direct> directly: <test> (<file>), ... and <rest>
more. Add each test the task will change to its scope with tests.modify:
true`, leaving out `and <rest> more` when nothing is left.

#### Scenario: Short list
- **WHEN** one test imports a scoped file directly
- **THEN** the warning says `1 preexisting tests` and `1 directly` and has no `more`

### Requirement: Undeclared capability read warning
<!-- source: src/core/spec/capability-impact.ts, tests/impact-lint.test.ts -->
Lint SHALL warn once per capability whose Code ownership globs cover a file a
scoped file imports directly, when no owner of that file is in
`features.reads` or has a delta, and the file is in no task's scope. The
warning SHALL be on `proposal.md`, name the capability and the importing files,
and say to add it to `features.reads`.

#### Scenario: Undeclared read
- **WHEN** scoped `src/a.ts` imports `src/other/x.ts`, owned by `other`, which the proposal neither reads nor writes
- **THEN** lint warns naming `other` and `src/a.ts`, and listing `other` in `features.reads` clears it

### Requirement: Capability write without delta warning
<!-- source: src/core/spec/capability-impact.ts, tests/impact-lint.test.ts -->
Lint SHALL warn once per resolved scope path whose owning capabilities, by Code
ownership globs, include none with a delta in the change. The warning SHALL be
on the task file and read `<path> is owned by <capabilities>, which has no
delta in this change. Add a delta or move the file out of scope`. It SHALL need
no import graph.

#### Scenario: Write without delta
- **WHEN** a task scopes `src/other/x.ts`, owned only by `other`, and the change has no `specs/other/spec.md`
- **THEN** lint warns on that task's file naming `src/other/x.ts` and `other`

### Requirement: Verify without scope test warning
<!-- source: src/core/spec/test-impact.ts, tests/impact-lint.test.ts -->
When every path a task's verify names under `tests/` exists and none imports,
at any depth, an existing JavaScript or TypeScript file in the task's scope,
lint SHALL warn on the task file: `Task <n> verify runs <tests> but none of
them imports a file in the task's scope`. A verify naming no such test SHALL not
warn.

#### Scenario: Verify tests something else
- **WHEN** task 1 scopes `src/a.ts` and its verify names only `tests/b.test.ts`, which imports nothing that reaches `src/a.ts`
- **THEN** lint warns naming `tests/b.test.ts`

### Requirement: Import graph built once per lint run
<!-- source: src/core/spec/impact-lint.ts, src/core/spec/linter.ts, src/cli/lint.ts, tests/impact-lint.test.ts -->
`lintCommand` SHALL build the import graph once and pass it to every
`lintChangeFolder` call through `LintOptions`; `lintChangeFolder` SHALL build
its own when none is passed. Every import-graph finding SHALL be a warning that
never affects validity. In a repository without JavaScript or TypeScript, only
the write warning can appear.

#### Scenario: Python-only repository
- **WHEN** a change in a Python-only repository is linted
- **THEN** it gets no frozen-test, read, or verify warning and no error
