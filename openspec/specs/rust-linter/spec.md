# rust-linter Specification

## Purpose
The linter kernel holds osq's lint gates over Rust crates. Its first gate keeps Node out of the Rust runtime, as ADR 026 requires.

## Requirements

### Requirement: Code ownership
<!-- source: crates/kernel/linter/** -->
The rust-linter capability SHALL own the `osq-kernel-linter` crate: its
manifest, its source, its tests and their fixtures.

#### Scenario: Linter crate ownership
- **WHEN** file ownership is resolved for the no-runtime-Node gate of the linter kernel
- **THEN** system maps `crates/kernel/linter/**` to rust-linter

### Requirement: Node spawns
`node_spawns(file, source)` SHALL return every place the Rust source text
`source` spawns Node, as a `NodeSpawn { file, line, program }` with `file`
as given, in source order. It parses `source` with `syn`, and a spawn is
a call whose function is a path ending in the segments `Command` and
`new`, such as `Command::new` or `std::process::Command::new`, whose first
argument is a string literal. That literal's value is the `program`. It
names Node when its last part, after the last `/` or `\`, with a trailing
`.exe` or `.cmd` removed, is exactly `node`, `npx` or `openspec`. `line`
is the 1-based line where the call's path starts. A call with any other
program, a program that is not a string literal, and a string outside
such a call are not spawns. A source that does not parse is
`ScanError::Parse` naming the file and the line `syn` reports.

#### Scenario: Spawned programs
- **WHEN** the source `fn main() {\n    let _ = std::process::Command::new(<program>).status();\n}\n` is scanned with each program below
- **THEN** the result is as given:

| Program | Result |
|---|---|
| `"node"` | a spawn of `node` at line 2 |
| `"npx"` | a spawn of `npx` at line 2 |
| `"openspec"` | a spawn of `openspec` at line 2 |
| `"/usr/bin/node"` | a spawn of `/usr/bin/node` at line 2 |
| `"node.exe"` | a spawn of `node.exe` at line 2 |
| `"C:\\tools\\npx.cmd"` | a spawn of `C:\tools\npx.cmd` at line 2 |
| `"nodemon"` | none |
| `"openspec-lsp"` | none |
| `"Node"` | none |
| `"git"` | none |
| `program` | none |

#### Scenario: Unparsable source
- **WHEN** the source `fn main( {\n` is scanned
- **THEN** the result is a parse error naming the file

### Requirement: Workspace Node spawns
`workspace_node_spawns(root)` SHALL scan the runtime code of every member
of the Cargo workspace at `root`: each `.rs` file under the member's
`src/` folder, at any depth, in byte order of their paths, members in the
order the root `Cargo.toml` lists them. It returns the `NodeSpawn` of
each, with `file` the path relative to `root` written with `/`. Tests,
examples, benches and build scripts are not runtime code, so the parity
tests may run the OpenSpec CLI. The members are the double-quoted strings
of the `members` array of the `[workspace]` table, which may span lines
and carry `#` comments. A manifest without that array, or with a member
holding `*`, is `ScanError::Manifest` naming the manifest. A file that
cannot be read or is not UTF-8 is `ScanError::Read` naming it.

#### Scenario: Fixture workspace
- **WHEN** `workspace_node_spawns` scans `crates/kernel/linter/tests/fixtures/node-spawn/`
- **THEN** it returns exactly these spawns, in this order:

| File | Line | Program |
|---|---|---|
| `crates/spawner/src/lib.rs` | 9 | `node` |
| `crates/spawner/src/lib.rs` | 14 | `/usr/local/bin/npx` |
| `crates/spawner/src/run/mod.rs` | 5 | `openspec.cmd` |

#### Scenario: Workspace scan errors
- **WHEN** each workspace below, written under a temporary folder, is scanned
- **THEN** the result is as given:

| Workspace | Result |
|---|---|
| a `Cargo.toml` with no `[workspace]` table | a manifest error naming that `Cargo.toml` |
| a `Cargo.toml` whose members are `["crates/*"]` | a manifest error naming that `Cargo.toml` |
| a member whose `src/lib.rs` holds the bytes `0xff 0xfe` | a read error naming that `lib.rs` |

### Requirement: No runtime Node
No crate of this repository's Rust workspace SHALL spawn Node at runtime.
A corpus test runs `workspace_node_spawns` on the repository root and
fails, naming each file, line and program, when it finds any spawn, so
`sh scripts/verify-rust.sh` blocks a change that adds one. Its fast
counterpart is "Fixture workspace".

#### Scenario: Workspace spawns no Node
- **WHEN** `workspace_node_spawns` scans this repository's root
- **THEN** it returns no spawn
