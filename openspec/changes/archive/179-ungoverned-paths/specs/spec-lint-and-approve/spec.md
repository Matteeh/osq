# Spec Delta: spec-lint-and-approve

## MODIFIED Requirements

### Requirement: Capability write without delta warning
Lint SHALL warn once per resolved scope path whose owning capabilities, by Code
ownership globs, include none with a delta in the change. The warning SHALL be
on the task file and read `<path> is owned by <capabilities>, which has no
delta in this change. Add a delta or move the file out of scope`. It SHALL need
no import graph. A path the config's `ungoverned` globs match SHALL never get
this warning, whoever owns it.

#### Scenario: Write without delta
- **WHEN** a task scopes `src/other/x.ts`, owned only by `other`, and the change has no `specs/other/spec.md`
- **THEN** lint warns on that task's file naming `src/other/x.ts` and `other`

#### Scenario: Ungoverned path written without delta
- **WHEN** the config sets `ungoverned: ['notes/**']`, and a task scopes `notes/a.md`, owned only by `other`, and the change has no `specs/other/spec.md`
- **THEN** lint gives no write-without-delta warning for `notes/a.md`

### Requirement: One code ownership reader
`readCapabilityOwnership(projectRoot, openspecRoot)` SHALL be the one function
that reads living capabilities' Code ownership globs, and
`readDeltaOwnership(folderPath)` the one that reads a change's delta specs'
globs. Both SHALL live in `src/core/spec/capability-impact.ts`, the only code
under `src/` besides `parser.ts` that calls `parseCodeOwnership`, and every
reader of ownership SHALL call one of the two.

#### Scenario: One caller
- **WHEN** every `.ts` file under `src/` is scanned
- **THEN** `parseCodeOwnership(` appears only in `src/core/spec/parser.ts`, where it is defined, and `src/core/spec/capability-impact.ts`

## ADDED Requirements

### Requirement: Ungoverned ownership warning
Lint SHALL warn once per Code ownership source glob in a change's delta spec
that matches an ungoverned path: the config's `ungoverned` globs match the
glob read as a path, or the glob matches an `ungoverned` glob read as a path.
The warning SHALL be on that delta spec file and read `<capability> Code
ownership glob <glob> matches ungoverned paths. Ungoverned files belong to no
capability; drop the glob`. Living specs SHALL NOT be checked.

#### Scenario: Delta ownership globs
- **WHEN** the config sets `ungoverned: ['notes/**', 'NOTICE*']` and the change's delta for `other` declares Code ownership with the row's glob
- **THEN** lint's result for that glob is the row's

| glob | result |
| --- | --- |
| `notes/a.md` | warning |
| `notes/**` | warning |
| `NOTICE.md` | warning |
| `**` | warning |
| `src/**` | no warning |
| `src/notes/a.md` | no warning |

#### Scenario: Living ownership is left alone
- **WHEN** the config sets `ungoverned: ['notes/**']`, living `other` owns `notes/**`, and the change has no delta for `other`
- **THEN** lint gives no ungoverned ownership warning

### Requirement: Ungoverned name warning
Lint SHALL warn once per ADDED or MODIFIED requirement other than Code
ownership in a change's delta spec whose text names an ungoverned file: a word
that, stripped of surrounding backticks, quotes and brackets and of trailing
`.,;:`, holds none of `*?[]{}` and that `ungoverned` matches. The warning
SHALL be on the delta spec file and read `<capability> requirement "<name>"
names ungoverned files: <files>. Ungoverned files are not pinned by specs`,
the files sorted, unique, and joined by `, `.

#### Scenario: Requirement text naming files
- **WHEN** the config sets `ungoverned: ['notes/**', 'NOTICE*']` and an ADDED requirement `Notice` in the change's delta for `other` holds the row's text
- **THEN** lint's result is the row's

| text | result |
| --- | --- |
| ``The `NOTICE.md` SHALL list authors.`` | `other requirement "Notice" names ungoverned files: NOTICE.md. Ungoverned files are not pinned by specs` |
| `The system SHALL write notes/a.md, then NOTICE.` | `other requirement "Notice" names ungoverned files: NOTICE, notes/a.md. Ungoverned files are not pinned by specs` |
| ``The system SHALL skip `notes/**`.`` | no warning |
| ``The system SHALL write `src/notes/a.md`.`` | no warning |

#### Scenario: Removed requirement naming a file
- **WHEN** the config sets `ungoverned: ['NOTICE*']` and the change's delta removes a requirement whose living text names `NOTICE.md`
- **THEN** lint gives no ungoverned name warning

### Requirement: Ungoverned warnings never block
The ungoverned ownership and name warnings SHALL be warnings only: neither
SHALL change `valid`, `osq lint`'s exit code, or approval. With
`ungoverned: []`, lint SHALL give neither.

#### Scenario: Warnings never block
- **WHEN** the config sets `ungoverned: ['NOTICE*']` and a delta requirement names `NOTICE.md`
- **THEN** `osq lint` prints the warning, reports the change valid, and exits zero

#### Scenario: Everything governed
- **WHEN** the config sets `ungoverned: []`, a delta's Code ownership declares `NOTICE.md`, and a delta requirement names `NOTICE.md`
- **THEN** lint gives no ungoverned ownership or name warning
