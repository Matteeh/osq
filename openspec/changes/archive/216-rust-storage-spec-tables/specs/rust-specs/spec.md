## ADDED Requirements

### Requirement: Scope globs
`scope_covers_path(scope, path)` SHALL tell whether a list of scope entries
covers one project-relative path, as TypeScript's `scopeCoversPath` does. An
entry and the path are both normalized first: trimmed, every `\` turned into
`/`, and any leading `./` runs removed. The path is covered when it equals a
normalized entry, or when a pattern entry matches it. An entry is a pattern
when it holds `*` or `?`, or ends with `/`. A pattern ending with `/` gets
`**` appended, any trailing `/` is then dropped, and the pattern must match
the whole path: `**/` matches zero or more whole segments, any other `**`
matches any text across segments, `*` matches any text within one segment,
`?` matches one character other than `/`, and every other character, braces
included, matches only itself. The function never touches the disk.

#### Scenario: Scope glob cases
- **WHEN** `scope_covers_path` checks each scope and path below
- **THEN** it returns the given result:

| Scope | Path | Covered |
|---|---|---|
| `src/alpha/**` | `src/alpha/a.ts` | true |
| `src/alpha/**` | `src/alpha` | false |
| `src/alpha/**` | `src/alphabet/a.ts` | false |
| `src/*.ts` | `src/a.ts` | true |
| `src/*.ts` | `src/x/a.ts` | false |
| `src/*.ts` | `src/aXts` | false |
| `src/**/*.ts` | `src/a.ts` | true |
| `src/**/*.ts` | `src/x/y/a.ts` | true |
| `src/**.ts` | `src/x/a.ts` | true |
| `src/?.ts` | `src/a.ts` | true |
| `src/?.ts` | `src/ab.ts` | false |
| `src/?.ts` | `src//.ts` | false |
| `src/alpha/` | `src/alpha/deep/a.ts` | true |
| `src/alpha` | `src/alpha/a.ts` | false |
| `./src/a.ts` | `src/a.ts` | true |
| `src\a.ts` | `src/a.ts` | true |
| `src/a.ts` | `./src/a.ts` | true |
| `␠␠src/a.ts␠␠` | `src/a.ts` | true |
| `src/a.ts` | `src/a.tsx` | false |
| none | `src/a.ts` | false |
| `src/a.ts`, `src/b/**` | `src/b/c.ts` | true |
| `**` | `any/path.md` | true |

`␠` stands for one space.

### Requirement: Capability ownership
`read_capability_ownership(specs_dir)` SHALL return one `CapabilityOwnership
{ capability, globs }` per folder directly under `specs_dir` whose `spec.md`
has Code ownership globs, read with `code_ownership`, in folder name order by
bytes, as TypeScript's `readCapabilityOwnership` does. A folder without a
readable `spec.md`, a spec without globs, and a file directly under
`specs_dir` add nothing, and a missing `specs_dir` reads as no ownership.
`owner_capabilities(ownerships, path)` SHALL return the capability names
whose globs cover the path under "Scope globs", sorted by bytes.

#### Scenario: Ownership of the owners fixture
- **WHEN** `read_capability_ownership` reads `tests/fixtures/owners/specs/`
- **THEN** it returns, in this order:

| Capability | Globs |
|---|---|
| `alpha` | `src/alpha/**` |
| `beta` | `src/beta/**`, `src/shared.ts` |
| `gamma` | `src/shared.ts` |

#### Scenario: Missing specs folder
- **WHEN** `read_capability_ownership` reads a folder that does not exist
- **THEN** it returns no ownership

#### Scenario: Owners of a path
- **WHEN** `owner_capabilities` checks each path below against the ownership of the owners fixture
- **THEN** it returns the given capabilities:

| Path | Capabilities |
|---|---|
| `src/shared.ts` | `beta`, `gamma` |
| `src/alpha/a.ts` | `alpha` |
| `./src/beta/b.ts` | `beta` |
| `notes/z.md` | none |
