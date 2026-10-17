## MODIFIED Requirements

### Requirement: Dependency baseline
When a task's resolved scope includes a dependency manifest, a path whose
file name is `package.json` or is a manifest of a language whose adapter has
`manifestDependencies` (today `Cargo.toml`), the `measures` start event of
every attempt SHALL carry `dependencies`, an object from each such
repository-relative path to its sorted distinct names: for `package.json` the
package names in its `dependencies`, `devDependencies`, `peerDependencies`,
and `optionalDependencies`, and for another manifest the names its language
adapter's `manifestDependencies` returns. A missing or unreadable file SHALL
map to an empty list. Without such a path the field SHALL be absent. The
watcher SHALL never read a manifest outside the task's resolved scope for
this.

#### Scenario: Scoped manifest
- **WHEN** a task's scope includes `package.json`, which depends on `chokidar` and dev-depends on `tsx`
- **THEN** its `measures` start event carries `dependencies: { "package.json": ["chokidar", "tsx"] }`

#### Scenario: Manifest outside scope
- **WHEN** a task's scope doesn't include `package.json`
- **THEN** its `measures` start event has no `dependencies` field and the file is not read

#### Scenario: Scoped Cargo manifest
- **WHEN** a task's scope includes `crates/core/Cargo.toml`, which depends on `serde` and dev-depends on `insta`
- **THEN** its `measures` start event carries `dependencies: { "crates/core/Cargo.toml": ["insta", "serde"] }`

### Requirement: Dependencies added
After the agent exits, after the blocked check and before the missing verify
path check, the watcher SHALL compare each path in the latest `measures` start
event's `dependencies` with the same file's current names, read as "Dependency
baseline" reads them. When any name is new, it SHALL append one
`dependencies_added` event with `data.added`, the `{ file, name }` pairs
sorted by file and then name. A name moved between sections or tables SHALL
NOT count, and without a baseline the comparison SHALL be skipped. A current
manifest that its language adapter cannot read SHALL add no pairs; "Denied
dependency" says when it fails the task.

#### Scenario: Allowed addition
- **WHEN** the agent adds `zod` to a scoped `package.json` and no accepted ADR denies it
- **THEN** one `dependencies_added` event names `zod` and the file, and the task goes on to its verify

#### Scenario: Allowed crate addition
- **WHEN** the agent adds `regex = "1"` under `[dependencies]` of a scoped `crates/core/Cargo.toml` and no accepted ADR denies it
- **THEN** one `dependencies_added` event names `regex` and `crates/core/Cargo.toml`, and the task goes on to its verify

### Requirement: Denied dependency
When an added name is listed in `denies` of an accepted ADR, the task SHALL
die with reason `denied_dependency` after the `dependencies_added` event is
appended, and SHALL run neither verify. The dead marker body SHALL start
`The task added packages an accepted ADR denies:` and hold one line per denied
pair and ADR, `- <name> in <file>: ADR <number>: <rule>`. Packages denied only
by proposed or superseded ADRs SHALL NOT be enforced.

When no added name is denied but some current manifest from the baseline
cannot be read by its language adapter, and some accepted ADR denies at least
one name, the task SHALL die with reason `denied_dependency` and run neither
verify. Its dead marker body SHALL start
`osq cannot read the dependency tables of these manifests:` and hold one line
per such file in path order, `- <file>: <error>`, and the error SHALL be
`Cannot read dependency tables: <file>, <file>`. When no accepted ADR denies
any name, an unreadable manifest SHALL not fail the task.

#### Scenario: Vue denied
- **WHEN** accepted ADR 007 denies `vue` and the agent adds `vue` to a scoped `package.json`
- **THEN** the task dies with `denied_dependency`, and the marker names `vue`, the file, ADR 007, and its rule

#### Scenario: Superseded denial
- **WHEN** only a superseded ADR denies `vue` and the agent adds it
- **THEN** the task doesn't die for it

#### Scenario: Crate denied
- **WHEN** accepted ADR 007 denies `openssl` and the agent adds `openssl = { version = "0.10" }` under `[target.'cfg(unix)'.dependencies]` of a scoped `crates/core/Cargo.toml`
- **THEN** the task dies with `denied_dependency`, and the marker holds `- openssl in crates/core/Cargo.toml: ADR 007: <rule>` with the ADR's rule

#### Scenario: Renamed crate denied
- **WHEN** accepted ADR 007 denies `openssl` and the agent adds `tls = { package = "openssl", version = "0.10" }` under `[dependencies]` of a scoped `crates/core/Cargo.toml`
- **THEN** the task dies with `denied_dependency`, and the marker names `openssl`

#### Scenario: Unreadable Cargo manifest
- **WHEN** accepted ADR 007 denies `openssl` and the agent leaves a scoped `crates/core/Cargo.toml` whose line 3 is `serde = "1.0` with no closing quote
- **THEN** the task dies with `denied_dependency`, its marker holds `- crates/core/Cargo.toml: line 3: ` followed by the reader's reason, and its error is `Cannot read dependency tables: crates/core/Cargo.toml`

#### Scenario: Unreadable manifest without denials
- **WHEN** no accepted ADR denies any name and the agent leaves a scoped `crates/core/Cargo.toml` that cannot be read
- **THEN** the task goes on to its verify
