## ADDED Requirements

### Requirement: Brace group refusal
Lint SHALL refuse a task whose `scope` or `entry` lists an entry holding a
brace group: a `{`, then text with at least one `,` and no other brace, then
a `}`. osq's scope matcher does not expand brace groups, so such an entry is
an exact path that never matches the files it means. For a `scope` entry, the
error SHALL be `Task in <n>.md scope entry "<entry>" holds a brace group,
which osq scope globs do not expand; they support only *, **, ? and a
trailing /. Use a folder glob such as dir/** or one entry per file`. For an
`entry` entry, it SHALL be the same text with `entry "<entry>"` in place of
`scope entry "<entry>"`. Brackets and a brace without a comma stay allowed,
since paths such as `app/[id]/page.tsx` are real.

#### Scenario: Brace group cases
- **WHEN** task 1's frontmatter lists each entry below in the given field
- **THEN** lint gives the given result:

| Field | Entry | Result |
|---|---|---|
| `scope` | `tests/golden/{a,b}.json` | error `Task in 1.md scope entry "tests/golden/{a,b}.json" holds a brace group, which osq scope globs do not expand; they support only *, **, ? and a trailing /. Use a folder glob such as dir/** or one entry per file` |
| `scope` | `src/{core,cli}/**` | error `Task in 1.md scope entry "src/{core,cli}/**" holds a brace group, which osq scope globs do not expand; they support only *, **, ? and a trailing /. Use a folder glob such as dir/** or one entry per file` |
| `entry` | `src/{a,b}.ts` | error `Task in 1.md entry "src/{a,b}.ts" holds a brace group, which osq scope globs do not expand; they support only *, **, ? and a trailing /. Use a folder glob such as dir/** or one entry per file` |
| `scope` | `app/[id]/page.tsx` | no brace group error |
| `scope` | `src/{single}.ts` | no brace group error |
| `scope` | `tests/golden/events/**` | no brace group error |
