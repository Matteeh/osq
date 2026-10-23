## ADDED Requirements

### Requirement: Lock file rebuild command
`lockRebuildCommand(lockfile)` in `src/kernel/languages/lockfiles.ts` SHALL
return the offline command that rebuilds a lock file from its manifests, run
in the lock file's folder, or `null` when osq knows none. It reads the lock
file's name only and reads no file. A lock file with no command keeps a merge
conflict a conflict.

#### Scenario: Rebuild command of a lock file
- **WHEN** `lockRebuildCommand` reads the lock file in the row
- **THEN** it returns the row's command

| lock file | command |
| --- | --- |
| `Cargo.lock` | `cargo update --workspace --offline` |
| `crates/tools/Cargo.lock` | `cargo update --workspace --offline` |
| `pnpm-lock.yaml` | `null` |
| `go.sum` | `null` |
| `src/app.txt` | `null` |
