## ADDED Requirements

### Requirement: Scope coverage
`scope_covers_path(scope: &[String], path: &str) -> bool` in `osq-core`
SHALL tell whether scope entries cover one project-relative path, as
TypeScript's `scopeCoversPath` does and rust-specs "Scope globs" spells out:
entry and path normalized (JavaScript-trimmed, `\` to `/`, leading `./`
runs removed), then an exact match or a whole-path match of a pattern entry,
one holding `*` or `?` or ending with `/`. It is the one glob matcher; the
specs kernel's `scope_covers_path` calls it.

#### Scenario: Scope coverage cases
- **WHEN** `osq_core::scope_covers_path` checks each scope and path below
- **THEN** it returns the given result:

| Scope | Path | Covered |
|---|---|---|
| `src/alpha/**` | `src/alpha/a.ts` | true |
| `src/alpha/**` | `src/alpha` | false |
| `src/*.ts` | `src/x/a.ts` | false |
| `src/**/*.ts` | `src/a.ts` | true |
| `src/**.ts` | `src/x/a.ts` | true |
| `src/?.ts` | `src//.ts` | false |
| `src/alpha/` | `src/alpha/deep/a.ts` | true |
| `src\a.ts` | `src/a.ts` | true |
| `␠␠src/a.ts␠␠` | `src/a.ts` | true |
| `src/{a,b}.ts` | `src/a.ts` | false |
| none | `src/a.ts` | false |

`␠` stands for one space.

### Requirement: Scope audit
`audit_scope(audit: &ScopeAudit) -> Vec<Disallowed>` in `osq-core` SHALL
give every changed path a task may not have changed, as TypeScript's
guards do. `ScopeAudit` holds `scope`,
`tests_modify`, `change_folder`, `test_folders`, `lock_rules` and
`changes`, each a `ChangedPath { path, change }` with `change` `Added`,
`Modified` or `Deleted`. Each `Disallowed { path, reason }` has
`OutsideScope`, `FrozenTestModified` or `FrozenTestDeleted`, sorted by
path, `OutsideScope` first.

#### Scenario: Scope audit cases
- **WHEN** `audit_scope` runs with the scope `crates/alpha/**` and `src/a.ts`, the change folder `openspec/changes/001-a`, the test folders `crates/alpha/tests` and `crates/beta/tests`, the lock rules of Rust (manifest `Cargo.toml`, lock file `Cargo.lock`) and TypeScript (manifest `package.json`, lock files `package-lock.json`, `pnpm-lock.yaml` and `yarn.lock`), and the row's changes and `tests_modify`
- **THEN** it returns exactly the row's disallowed paths:

| Changes | `tests_modify` | Disallowed |
|---|---|---|
| `src/a.ts` modified | false | none |
| `src/b.ts` modified | false | `src/b.ts` outside scope |
| `crates/alpha/src/lib.rs` deleted | false | none |
| `crates/alpha/Cargo.toml` modified, `Cargo.lock` modified | false | none |
| `Cargo.lock` modified | false | `Cargo.lock` outside scope |
| `crates/beta/Cargo.toml` modified, `Cargo.lock` modified | false | `Cargo.lock` outside scope, `crates/beta/Cargo.toml` outside scope |
| `crates/alpha/Cargo.toml` modified, `crates/gamma/Cargo.lock` modified | false | `crates/gamma/Cargo.lock` outside scope |
| `crates/alpha/Cargo.toml` modified, `pnpm-lock.yaml` modified | false | `pnpm-lock.yaml` outside scope |
| `crates/alpha/tests/a.rs` modified | false | `crates/alpha/tests/a.rs` frozen test modified |
| `crates/alpha/tests/a.rs` modified | true | none |
| `crates/alpha/tests/a.rs` deleted | false | `crates/alpha/tests/a.rs` frozen test deleted |
| `crates/alpha/tests/new.rs` added | false | none |
| `crates/beta/tests/a.rs` modified | true | `crates/beta/tests/a.rs` outside scope, `crates/beta/tests/a.rs` frozen test modified |
| `crates/beta/tests/new.rs` added | false | `crates/beta/tests/new.rs` outside scope |
| `tests/new.test.ts` added | false | none |
| `tests/old.test.ts` modified | true | `tests/old.test.ts` outside scope, `tests/old.test.ts` frozen test modified |
| `openspec/changes/001-a/.run/results/1.md` added | false | none |
| `openspec/changes/001-a/tasks.md` modified | false | none |
| `openspec/changes/001-ab/notes.md` added | false | `openspec/changes/001-ab/notes.md` outside scope |

### Requirement: Scope audit rules
A changed path SHALL be `OutsideScope` unless it is added under the root
`tests` folder, the scope covers it, it is in the change folder, or it is a
lock file following a covered changed manifest: a `LockRule { manifests,
lock_files }` names both base names and the manifest's folder is at or
below the lock file's. A modified or deleted path at or under `tests` or a
test folder is frozen unless `tests_modify` is set and the scope covers
it.

#### Scenario: Lock file at the root follows any covered manifest
- **WHEN** `audit_scope` runs with the scope `crates/alpha/deep/**`, the Rust lock rule and the changes `crates/alpha/deep/Cargo.toml` and `Cargo.lock`, both modified
- **THEN** it returns no disallowed path
