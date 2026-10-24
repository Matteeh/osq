## ADDED Requirements

### Requirement: Task scope hash
`task_scope_hash(project: &Path, scope: &[String]) -> ScopeHash` in
`osq-kernel-storage` SHALL resolve a task's scope and hash its files as
TypeScript's `resolveScope` and `computeTaskScopeHash` do, and SHALL never
fail. `ScopeHash` and `ScopeFile` SHALL be public, exported from the crate
root, and derive `Debug`, `Clone`, `PartialEq` and `Eq`. `ScopeHash` holds
`hash: String` and `files: Vec<ScopeFile>`; `ScopeFile` holds `path:
String`, the project-relative POSIX path, and `hash: Option<String>`.

Each `scope` entry is trimmed, its `\` turned into `/` and its leading
`./` removed, repeatedly. An entry holding `*` or `?`, or ending in `/`, is
a pattern; any other entry is exact.

- A pattern searches below its root: the part before its first `*` or `?`
  up to its last `/`, or the project when that part has no `/`, or for an
  entry with neither the entry without its trailing `/`. A root that is
  `..`, starts with `../` or is absolute gives nothing. Otherwise the
  pattern gives every regular file below the root, symbolic links not
  followed, whose project-relative path rust-specs `scope_covers_path`
  matches with the entry, and a pattern that matches no file gives nothing.
- An exact entry that starts with `/` or `../`, or is `..`, gives itself
  with no hash. Otherwise it gives itself with the hash of the regular
  file at that path, or no hash when that path is not a regular file or
  is a symbolic link.

The first result for a path wins, and `files` is sorted by path bytes. A
file's hash is `sha256:` and the lowercase hex SHA-256 of its text read as
UTF-8 with invalid bytes replaced, or no hash when it cannot be read.
`hash` is `sha256:` and the lowercase hex SHA-256 of one line
`<path>:<hash>` per file, with an empty hash for no hash, joined with a
newline.

Tests read `tests/fixtures/scope-project/`, whose `src/` is
`crates/features/retry/tests/fixtures/recert-project/src/` copied byte for
byte.

#### Scenario: Scope hash of a task's entries
- **WHEN** `task_scope_hash` runs on a new copy of `tests/fixtures/scope-project/` with the row's entries
- **THEN** it gives the row's `hash`, and `files` holds the row's paths and hashes in this order, where `-` is no hash:

| Entries | `hash` | `files` |
|---|---|---|
| `../outside.txt` | `sha256:985bc8dcecaee4913c191e1d3b327a931d48951f486500edd41ab73a57918030` | `../outside.txt` - |
| `/abs/file.txt` | `sha256:d84705e84283af54e8d2e9a3d8f1a7f34c018c3aeb577b80d8186dd3577d841a` | `/abs/file.txt` - |
| `../*.txt`, `/abs/*.txt` | `sha256:e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855` | none |
| `src` | `sha256:7aaf195b39732b39c116a660cd4ffe54eae09e8fc8a4970b2d7e295e68ad4892` | `src` - |
| `src/missing.txt` | `sha256:1806de8892c7ca6bae45404c910a7d99b7218bbdbb988a01339e809e98c0f1dc` | `src/missing.txt` - |
| `.\src\one.txt` | `sha256:3cfb4fa0947b1fa72f558e0825b1115022423a0aeea283d1bef4ae6536db3a06` | `src/one.txt` `sha256:7ebb69bac93710c46aa44d35d31ef4965e35c47dd614e1305bfd4a9f96a411ae` |
| `src/one.txt`, `./src/one.txt` | `sha256:3cfb4fa0947b1fa72f558e0825b1115022423a0aeea283d1bef4ae6536db3a06` | `src/one.txt` `sha256:7ebb69bac93710c46aa44d35d31ef4965e35c47dd614e1305bfd4a9f96a411ae` |
| ` src/two/a.txt ` | `sha256:30f9c1fbb55d70fb0e7a241e42ceb8099db0c1fe1d5e8fe749159a2b7964bb7d` | `src/two/a.txt` `sha256:87428fc522803d31065e7bce3cf03fe475096631e5e07bbd7a0fde60c4cf25c7` |
| `src/two/*` | `sha256:30f9c1fbb55d70fb0e7a241e42ceb8099db0c1fe1d5e8fe749159a2b7964bb7d` | `src/two/a.txt` `sha256:87428fc522803d31065e7bce3cf03fe475096631e5e07bbd7a0fde60c4cf25c7` |
| `src/two/deep/?.txt` | `sha256:3515f8747e9ad61510ae928351f0d194a568fb85538f2a36a8cf865bcc42f53a` | `src/two/deep/b.txt` `sha256:0263829989b6fd954f72baaf2fc64bc2e2f01d692d4de72986ea808f6e99813f` |
| `src/two/` | `sha256:aa7da01efad91002a86deb7638a3a1648fea7b55632fc4b30e17e1bb57d74342` | `src/two/a.txt` `sha256:87428fc522803d31065e7bce3cf03fe475096631e5e07bbd7a0fde60c4cf25c7`, `src/two/deep/b.txt` `sha256:0263829989b6fd954f72baaf2fc64bc2e2f01d692d4de72986ea808f6e99813f` |
| `src/two/**/*.txt` | `sha256:aa7da01efad91002a86deb7638a3a1648fea7b55632fc4b30e17e1bb57d74342` | `src/two/a.txt` `sha256:87428fc522803d31065e7bce3cf03fe475096631e5e07bbd7a0fde60c4cf25c7`, `src/two/deep/b.txt` `sha256:0263829989b6fd954f72baaf2fc64bc2e2f01d692d4de72986ea808f6e99813f` |
| `src/**` | `sha256:d21bc7711678dcf1a2bd9bc1c5e7be5282b4baa70f6d001ba39ab0937d5ef4ac` | `src/one.txt` `sha256:7ebb69bac93710c46aa44d35d31ef4965e35c47dd614e1305bfd4a9f96a411ae`, `src/two/a.txt` `sha256:87428fc522803d31065e7bce3cf03fe475096631e5e07bbd7a0fde60c4cf25c7`, `src/two/deep/b.txt` `sha256:0263829989b6fd954f72baaf2fc64bc2e2f01d692d4de72986ea808f6e99813f` |

### Requirement: Done marker scope
`read_done_scope(folder: &Path, task: &str) -> Option<DoneScope>` in
`osq-kernel-storage` SHALL read the scope a task's done marker
`<folder>/.run/done/<task>` records, as TypeScript's `readDoneMarker`
does, and SHALL never fail. `DoneScope` SHALL be public, exported from the
crate root, and derive `Debug`, `Clone`, `PartialEq` and `Eq`. It holds
`scope_hash: String` and `scope_files: BTreeMap<String, Option<String>>`.

It SHALL give `None` when the marker cannot be read as text, when its
frontmatter does not parse through rust-specs `parse_frontmatter`, or when
`scope_hash` is not a non-empty string. Otherwise `scope_hash` is that
string, and `scope_files` holds one entry per key of a `scope_files`
mapping, the key as text (an integer key as its decimal text) and the value
when it is a string, else `None`; `scope_files` is empty when the key is
missing or not a mapping.

`differing_scope_paths(recorded: &BTreeMap<String, Option<String>>,
current: &ScopeHash) -> Vec<String>` in `osq-kernel-storage` SHALL give
the paths whose hash differs, as TypeScript's `findDifferingPaths` does:
for each path in `recorded` or in `current.files`, in byte order and once
each, where a path missing from one side counts as no hash there, it gives
nothing when both hashes are equal, and otherwise `<path> (added)` when the
recorded side has no hash, `<path> (deleted)` when the current side has
none, and `<path> (modified)` else.

#### Scenario: Done marker scope reads
- **WHEN** `read_done_scope` reads task `1` of a scratch change folder whose `.run/done/1` holds the row's text, written with `\n` escapes
- **THEN** it gives the row's result:

| Marker | Result |
|---|---|
| `---\nscope_hash: sha256:aa\nscope_files:\n  src/a.txt: sha256:1\n  src/b.txt: null\n  7: sha256:7\n  src/c.txt: 3\n---\nx\n` | `scope_hash` `sha256:aa`; `scope_files` `7` `sha256:7`, `src/a.txt` `sha256:1`, `src/b.txt` none, `src/c.txt` none |
| `---\nscope_hash: sha256:aa\nscope_files: [a]\n---\n` | `scope_hash` `sha256:aa`; no `scope_files` |
| `---\nscope_hash: sha256:aa\n---\n` | `scope_hash` `sha256:aa`; no `scope_files` |
| `---\nscope_hash: ""\n---\n` | `None` |
| `---\nscope_hash: 5\n---\n` | `None` |
| `no frontmatter\n` | `None` |
| `---\nscope_hash: [\n---\n` | `None` |
| no file | `None` |

#### Scenario: Differing scope paths
- **WHEN** `differing_scope_paths` compares the recorded `b.txt` `sha256:1`, `a.txt` `sha256:2`, `c.txt` none and `d.txt` `sha256:4` with a `ScopeHash` whose `files` are `a.txt` `sha256:9`, `c.txt` `sha256:3`, `d.txt` `sha256:4` and `e.txt` with no hash
- **THEN** it gives `a.txt (modified)`, `b.txt (deleted)` and `c.txt (added)`, in that order

### Requirement: Done marker refresh
`refresh_done_marker(folder: &Path, task: &str, recorded_hash: &str,
current: &ScopeHash, now: &str) -> Result<(), DoneMarkerError>` in
`osq-kernel-storage` SHALL rewrite `<folder>/.run/done/<task>` after a
passing recertification, as TypeScript's `refreshRecertifiedDoneMarker`
does. `DoneMarkerError` SHALL be public, exported from the crate root,
derive `Debug`, `Clone`, `PartialEq` and `Eq`, and implement `Display` and
`std::error::Error`; its display is `cannot read <path>: <io error>` when
the marker cannot be read, `line <n>: <message>` when its frontmatter does
not parse through rust-specs `parse_frontmatter`, and `cannot write
<path>: <io error>` when it cannot be written, where `<path>` is the
marker's path.

The rewrite SHALL keep the marker's body and every frontmatter key in its
place. It sets `original_scope_hash` to `recorded_hash` when that key is
not a non-empty string, then `scope_hash` to `current.hash`, `scope_files`
to a mapping of each of `current.files`' paths to its hash or null,
`scope_resolver` to 2, `recertified_at` to `now`, and
`recertification_count` to one more than its value when that is an integer
above 0, or 1. A key the marker lacks is added at the end in that order.
The marker is written as `---`, a newline, the frontmatter, `---`, a
newline and the body.

The frontmatter SHALL be written as the `yaml` package's `stringify`
writes it: one `<key>: <value>` line per key; a non-empty mapping or list
as a block on the lines below its key, indented two more spaces; a list
item as `- ` and its value, where a mapping or list item starts on the
dash's line and its later lines are indented two past the dash; `{}` for
an empty mapping, `[]` for an empty list, `null`, `true`, `false`, an
integer in decimal and a float as its source text. A key is written as a
string, an integer key as its decimal text. A string is written plain
when it is not empty, starts with an ASCII letter or digit, `.`, `_` or
`/`, holds only ASCII letters and digits and `.`, `_`, `/`, `-`, `+`, `:`
and `@`, does not end with `:`, and is not `null`, `Null`, `NULL`, `true`,
`True`, `TRUE`, `false`, `False`, `FALSE`, an integer, a `0o` octal or
`0x` hex integer, a float such as `1.5`, `.5` or `12e45`, `.inf`, `.Inf`,
`.INF`, `.nan`, `.NaN` or `.NAN`; any other string is written as a JSON
string.

#### Scenario: Refreshed marker text
- **WHEN** a scratch change folder's `.run/done/4` holds `---`, `scope_hash: sha256:2222222222222222222222222222222222222222222222222222222222222222`, the row's frontmatter lines, `---` and `2026-10-01T10:00:00.000Z`, each line followed by a newline, and `refresh_done_marker` runs for task `4` with that recorded hash, `task_scope_hash` of a new copy of `tests/fixtures/scope-project/` with the entry `src/one.txt`, and the time `2026-10-24T08:00:00.000Z`
- **THEN** the marker's lines start with `---`, `scope_hash: sha256:3cfb4fa0947b1fa72f558e0825b1115022423a0aeea283d1bef4ae6536db3a06` and the row's lines:

| Frontmatter lines | Lines |
|---|---|
| `flag: true` | `flag: true` |
| `note: ""` | `note: ""` |
| `stamp: "0x1f"` | `stamp: "0x1f"` |
| `stamp: "12e45"` | `stamp: "12e45"` |
| `stamp: "-1"` | `stamp: "-1"` |
| `stamp: "True"` | `stamp: "True"` |
| `stamp: "a:"` | `stamp: "a:"` |
| `stamp: a.b/c_d-e+f:g@h` | `stamp: a.b/c_d-e+f:g@h` |
| `stamp: 1.2.3` | `stamp: 1.2.3` |
| `nothing:` | `nothing: null` |
| `list: [{a: 1, b: [x]}, [y, z], {}, []]` | `list:`, `  - a: 1`, `    b:`, `      - x`, `  - - y`, `    - z`, `  - {}`, `  - []` |
| `nested: {a: {b: c}}` | `nested:`, `  a:`, `    b: c` |
| `codes: {7: seven}` | `codes:`, `  "7": seven` |
| `recertification_count: 0` | `recertification_count: 1`, `original_scope_hash: sha256:2222222222222222222222222222222222222222222222222222222222222222` |
| `recertification_count: "3"` | `recertification_count: 1`, `original_scope_hash: sha256:2222222222222222222222222222222222222222222222222222222222222222` |
| `original_scope_hash: ""` | `original_scope_hash: sha256:2222222222222222222222222222222222222222222222222222222222222222`, `scope_files:` |
| `recertification_count: 4`, `original_scope_hash: sha256:1111` | `recertification_count: 5`, `original_scope_hash: sha256:1111`, `scope_files:` |

#### Scenario: Refreshed marker tail
- **WHEN** `refresh_done_marker` runs as "Refreshed marker text" runs it with the frontmatter line `flag: true`
- **THEN** the marker is `---\nscope_hash: sha256:3cfb4fa0947b1fa72f558e0825b1115022423a0aeea283d1bef4ae6536db3a06\nflag: true\noriginal_scope_hash: sha256:2222222222222222222222222222222222222222222222222222222222222222\nscope_files:\n  src/one.txt: sha256:7ebb69bac93710c46aa44d35d31ef4965e35c47dd614e1305bfd4a9f96a411ae\nscope_resolver: 2\nrecertified_at: 2026-10-24T08:00:00.000Z\nrecertification_count: 1\n---\n2026-10-01T10:00:00.000Z\n`, written with `\n` escapes

#### Scenario: Marker that cannot refresh
- **WHEN** `refresh_done_marker` runs for task `4` of a scratch change folder whose `.run/done/4` is the row's
- **THEN** it gives a `DoneMarkerError` whose display starts with the row's text and leaves the folder's files as they were:

| Marker | Display starts |
|---|---|
| missing | `cannot read <folder>/.run/done/4: ` |
| `---\nscope_hash: [\n---\n` | `line ` |
| a folder | `cannot read <folder>/.run/done/4: ` |
