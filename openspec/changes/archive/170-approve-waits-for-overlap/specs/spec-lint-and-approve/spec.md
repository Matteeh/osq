# Spec Delta: spec-lint-and-approve

## ADDED Requirements

### Requirement: Capability overlap
With `vcs.enabled` and `GitVcs` selected, `overlappingChanges(projectRoot,
config, vcs, folderPath, folderName)` in `src/core/spec/stack-overlap.ts`
SHALL return the changes the folder overlaps. A change overlaps when it is
another change folder that `listChanges` returns in any location and tree,
counted once by folder name, whose state through "Stack dependency state" is
`approved` or `archived`, and whose `listDeltaCapabilities` shares at least
one capability with the folder's. Each entry is `{ folder, hash, overlap }`:
the state's hash, and the shared capabilities sorted. Entries are sorted by
folder name. A folder with no delta overlaps nothing.

`awaitedForApproval(projectRoot, config, vcs, folderPath, folderName)` there
SHALL return what approve stacks on: first `awaitedDependencies` of the
folder, then each overlapping change that no earlier entry names. It SHALL
leave out an overlapping change that another returned entry already awaits,
directly or through others, following "Awaited dependencies" of each
entry's own folder, so a change that overlaps a chain stacks only on its
tip.

#### Scenario: Which changes overlap
- **WHEN** the change `003-c`, which writes the capabilities below, is approved while the other changes below exist
- **THEN** `awaitedForApproval` returns the entries below:

| Other changes | `003-c` writes | Entries |
|---|---|---|
| `001-a` approved, writes `orders` | `orders` | `001-a` with overlap `orders` |
| `001-a` approved, writes `billing` | `orders` | none |
| `001-a` landed, writes `orders` | `orders` | none |
| `001-a` a draft without `.run/approved`, writes `orders` | `orders` | none |
| `001-a` archived, writes `billing` and `orders` | `billing`, `orders` | `001-a` with overlap `billing, orders` |
| `001-a` archived and `002-b` stacked on it, both write `orders` | `orders` | `002-b` with overlap `orders` |
| `001-a` approved, writes `orders`; `002-b` approved, writes `billing` | `billing`, `orders` | `001-a` with overlap `orders`, then `002-b` with overlap `billing` |
| `002-b` approved and stacked on `001-a`, both write `orders`; `003-c` has `depends_on: ["002"]` | `orders` | `002-b` with no overlap |

### Requirement: Awaited dependencies
`awaitedDependencies(projectRoot, config, vcs, folderPath)` in
`src/core/spec/stack-dependencies.ts` SHALL return, first, each `depends_on`
entry of the folder's proposal whose state through "Stack dependency state"
is `approved` or `archived`, in `depends_on` order, as `{ folder, hash }`.
Then it SHALL return each overlap line of the folder's `.run/stacked-on` that
no `depends_on` entry names and whose change reads `approved` or `archived`
with the hash the line records, as `{ folder, hash, overlap }`, in line
order. It SHALL leave out an overlap line whose change reads `landed` or
`unapproved`, or reads `approved` or `archived` with another hash. A line of
`.run/stacked-on` is `<folder> <hash>` for a declared dependency, or
`<folder> <hash> overlap <capability>[,<capability>...]` for an overlap.
`parseStackedOn` SHALL read both, giving `overlap` only for the second.
`formatStackedOn` SHALL write each entry back in the same form.

#### Scenario: Overlap lines count while their change waits to land
- **WHEN** `003-c`'s `.run/stacked-on` reads `002-b <hash> overlap orders` and `002-b` is in the state below
- **THEN** `awaitedDependencies` for `003-c` returns the entries below:

| `002-b` | Entries |
|---|---|
| approved with `<hash>` | `002-b` with overlap `orders` |
| archived with `<hash>` | `002-b` with overlap `orders` |
| approved with another hash | none |
| unapproved after a rejection | none |
| landed | none |

#### Scenario: Stacked-on lines read back
- **WHEN** `parseStackedOn` reads `001-a aaa` and `002-b bbb overlap billing,orders` on two lines
- **THEN** it returns `{ folder: '001-a', hash: 'aaa' }` and `{ folder: '002-b', hash: 'bbb', overlap: ['billing', 'orders'] }`, and `formatStackedOn` of those entries gives the same two lines

## MODIFIED Requirements

### Requirement: Stacked approval
With `vcs.enabled` and `GitVcs` selected, when `awaitedForApproval` returns
any entry, approve SHALL, after lint, the refusals, and the review, record a
stacked approval instead of creating a branch. It SHALL delete any stacked
approval of the folder, copy the checkout's folder to
`<changes>/<folder>` inside the stacked approval directory "Worktree
location" gives, and in that copy append observed planning records, write
`.run/approved` with the checkout copy's hash, the manifest, and
`.run/approver` as "Approval into a worktree" does, and write
`.run/stacked-on` with `formatStackedOn` of the entries, in the order
`awaitedForApproval` returns them: one `<dependency folder> <approved hash>`
line per awaited `depends_on` entry, then one
`<folder> <approved hash> overlap <capabilities>` line per overlap entry. It
SHALL create no branch, worktree, or commit, SHALL then remove the
checkout's folder as "Checkout copy removed at approval" says, SHALL write
nothing else to the checkout, and SHALL print `  Waiting for: <folders>`,
comma-separated, then for each overlap entry
`  Runs after <folder>, which also writes <capabilities>`, the capabilities
joined with `, `, then `  Stacked: <path>`. The approve result SHALL carry
the entries as `waitingFor`, the folders, and `overlaps`, each
`{ folder, capabilities }`. When no entry is returned, approve SHALL approve
into a worktree as "Approval into a worktree" says and then delete any
stacked approval of the folder. When the change locations module finds the
change in a stacked tree, approve SHALL first restore it to the checkout as
"Stacked draft restore" says, then lint, review, hash, and approve that
draft as above. When that approval fails, approve SHALL remove the restored
draft, so the stacked approval stays the change's only copy, unchanged.

#### Scenario: Approve a dependent of a running change
- **WHEN** `001-a` was approved into a worktree and the lint-clean draft `002-b` with `depends_on: ["001"]` is approved
- **THEN** approve prints `  Waiting for: 001-a` and `  Stacked: ` with the stacked path, that path holds `002-b` with `.run/approved`, `.run/approver`, and `.run/stacked-on` reading `001-a <001-a's hash>`, no branch `osq/002-b` exists, and the checkout no longer holds `002-b`

#### Scenario: Dependency already landed
- **WHEN** the default branch holds `001-a`'s archive and `002-b` is approved
- **THEN** approve creates `osq/002-b` and its worktree as before and prints no `Waiting for` line

#### Scenario: Approve a stacked change again
- **WHEN** `002-b` is stacked, a task file in its stacked copy is edited, and `002-b` is approved again
- **THEN** the stacked approval's `.run/approved` holds the edited copy's new hash and the edited task file, and the checkout holds no `002-b`

#### Scenario: Approve again after the dependency is rejected
- **WHEN** `002-b` is stacked on `001-a`, `001-a` is rejected on its branch, and `002-b` is approved again
- **THEN** approve creates `osq/002-b` at HEAD with its worktree, the stacked approval directory of `002-b` no longer exists, the worktree's `002-b` has no `.run/stacked-on`, and the checkout holds no `002-b`

#### Scenario: Approve a change that overlaps a running one
- **WHEN** `001-a`, which writes `orders`, was approved into a worktree, and the lint-clean draft `002-b` with `depends_on: []`, which also writes `orders`, is approved
- **THEN** approve prints `  Waiting for: 001-a`, `  Runs after 001-a, which also writes orders` and `  Stacked: ` with the stacked path, `.run/stacked-on` there reads `001-a <001-a's hash> overlap orders`, the result's `overlaps` is `[{ folder: '001-a', capabilities: ['orders'] }]`, and no branch `osq/002-b` exists

#### Scenario: Approve a change that shares no capability
- **WHEN** `001-a`, which writes `orders`, was approved into a worktree, and the draft `002-b`, which writes only `billing`, is approved
- **THEN** approve creates `osq/002-b` and its worktree from HEAD and prints no `Waiting for` or `Runs after` line
