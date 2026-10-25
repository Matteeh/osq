# Spec Delta: spec-lint-and-approve

## MODIFIED Requirements

### Requirement: Awaited dependencies
`awaitedDependencies(projectRoot, config, vcs, folderPath)` in
`src/core/spec/stack-dependencies.ts` SHALL return, first, each `depends_on`
entry of the folder's proposal whose state through "Stack dependency state"
is `approved` or `archived`, in `depends_on` order, as `{ folder, hash }`.
Then it SHALL return each overlap line of the folder's `.run/stacked-on` that
no `depends_on` entry names and whose change reads `approved` or `archived`,
whatever hash the line records, as `{ folder, hash, overlap }` with the
line's hash, in line order. When the change's approved hash differs from the
line's, the entry SHALL also carry `reapproved: true`, and otherwise no
`reapproved` key. It SHALL leave out an overlap line whose change reads
`landed` or `unapproved`. A line of `.run/stacked-on` is `<folder> <hash>`
for a declared dependency, or
`<folder> <hash> overlap <capability>[,<capability>...]` for an overlap.
`parseStackedOn` SHALL read both, giving `overlap` only for the second.
`formatStackedOn` SHALL write each entry back in the same form, without the
`reapproved` mark.

#### Scenario: Overlap lines count while their change waits to land
- **WHEN** `003-c`'s `.run/stacked-on` reads `002-b <hash> overlap orders` and `002-b` is in the state below
- **THEN** `awaitedDependencies` for `003-c` returns the entries below:

| `002-b` | Entries |
|---|---|
| approved with `<hash>` | `002-b` with overlap `orders` |
| archived with `<hash>` | `002-b` with overlap `orders` |
| approved with another hash | `002-b` with hash `<hash>`, overlap `orders` and `reapproved: true` |
| unapproved after a rejection | none |
| landed | none |

#### Scenario: Stacked-on lines read back
- **WHEN** `parseStackedOn` reads `001-a aaa` and `002-b bbb overlap billing,orders` on two lines
- **THEN** it returns `{ folder: '001-a', hash: 'aaa' }` and `{ folder: '002-b', hash: 'bbb', overlap: ['billing', 'orders'] }`, and `formatStackedOn` of those entries gives the same two lines
