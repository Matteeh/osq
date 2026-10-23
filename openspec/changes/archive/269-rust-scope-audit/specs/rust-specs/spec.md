## MODIFIED Requirements

### Requirement: Scope globs
`scope_covers_path(scope, path)` SHALL tell whether a list of scope entries
covers one project-relative path, as TypeScript's `scopeCoversPath` does;
the specs kernel's function calls rust-core's `scope_covers_path`, the one
glob matcher. An entry and the path are both normalized first: trimmed, every
`\` turned into `/`, and any leading `./` runs removed. The path is covered
when it equals a normalized entry, or when a pattern entry matches it. An
entry is a pattern when it holds `*` or `?`, or ends with `/`. A pattern
ending with `/` gets `**` appended, any trailing `/` is then dropped, and
the pattern must match the whole path: `**/` matches zero or more whole
segments, any other `**` matches any text across segments, `*` matches any
text within one segment, `?` matches one character other than `/`, and
every other character, braces included, matches only itself. The function
never touches the disk.

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
