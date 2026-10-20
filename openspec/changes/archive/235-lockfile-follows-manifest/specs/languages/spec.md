## ADDED Requirements

### Requirement: Lock file of a manifest
`lockfileFollowsManifest(lockfile, manifests)` SHALL return true when the
file name of the project-relative POSIX path `lockfile` is one of a preset's
lock files and some path in `manifests` has a file name that is one of the
same preset's manifests, in the lock file's folder or a folder below it. A
lock file at the project root follows a manifest in any folder. Otherwise it
SHALL return false. It reads no file.

#### Scenario: Lock files and the manifests they follow
- **WHEN** `lockfileFollowsManifest` reads the row's lock file and manifests
- **THEN** it returns the row's result

| lock file | manifests | result |
| --- | --- | --- |
| `Cargo.lock` | `crates/kernel/specs/Cargo.toml` | true |
| `Cargo.lock` | `Cargo.toml` | true |
| `pnpm-lock.yaml` | `packages/ui/package.json` | true |
| `packages/ui/package-lock.json` | `packages/ui/package.json` | true |
| `crates/a/Cargo.lock` | `crates/b/Cargo.toml` | false |
| `crates/a/Cargo.lock` | `Cargo.toml` | false |
| `Cargo.lock` | `package.json` | false |
| `pnpm-lock.yaml` | `crates/core/Cargo.toml` | false |
| `Cargo.lock` | (none) | false |
| `src/lib.rs` | `Cargo.toml` | false |
