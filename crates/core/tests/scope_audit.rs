//! Proves scope coverage and the audit of changed paths against a task's scope.

use osq_core::{
    ChangedPath, DisallowReason, Disallowed, LockRule, PathChange, ScopeAudit, audit_scope,
    scope_covers_path,
};

/// One row of the scope audit cases: changes, `tests_modify` and expected.
type AuditRow = (Vec<ChangedPath>, bool, Vec<Disallowed>);

/// Builds a list of strings from entries.
fn strings(entries: &[&str]) -> Vec<String> {
    entries.iter().map(|entry| (*entry).to_owned()).collect()
}

/// Builds one changed path.
fn changed(path: &str, change: PathChange) -> ChangedPath {
    ChangedPath {
        path: path.to_owned(),
        change,
    }
}

/// Builds a list of changed paths from path and change pairs.
fn changed_paths(entries: &[(&str, PathChange)]) -> Vec<ChangedPath> {
    entries
        .iter()
        .map(|(path, change)| changed(path, *change))
        .collect()
}

/// Builds one lock rule from manifest and lock-file base names.
fn lock_rule(manifests: &[&str], lock_files: &[&str]) -> LockRule {
    LockRule {
        manifests: strings(manifests),
        lock_files: strings(lock_files),
    }
}

/// Builds the audit the scope audit cases share.
fn audit(tests_modify: bool, changes: Vec<ChangedPath>) -> ScopeAudit {
    ScopeAudit {
        scope: strings(&["crates/alpha/**", "src/a.ts"]),
        tests_modify,
        change_folder: "openspec/changes/001-a".to_owned(),
        test_folders: strings(&["crates/alpha/tests", "crates/beta/tests"]),
        lock_rules: vec![
            lock_rule(&["Cargo.toml"], &["Cargo.lock"]),
            lock_rule(
                &["package.json"],
                &["package-lock.json", "pnpm-lock.yaml", "yarn.lock"],
            ),
        ],
        changes,
    }
}

/// Builds one disallowed path and reason.
fn disallowed(path: &str, reason: DisallowReason) -> Disallowed {
    Disallowed {
        path: path.to_owned(),
        reason,
    }
}

/// Proves every row of "Scope coverage cases" and of rust-specs "Scope glob
/// cases".
///
/// Covers: rust-core/scope-coverage-cases
#[test]
fn scope_coverage_cases() {
    let rows: &[(&[&str], &str, bool)] = &[
        (&["src/alpha/**"], "src/alpha/a.ts", true),
        (&["src/alpha/**"], "src/alpha", false),
        (&["src/*.ts"], "src/x/a.ts", false),
        (&["src/**/*.ts"], "src/a.ts", true),
        (&["src/**.ts"], "src/x/a.ts", true),
        (&["src/?.ts"], "src//.ts", false),
        (&["src/alpha/"], "src/alpha/deep/a.ts", true),
        (&["src\\a.ts"], "src/a.ts", true),
        (&["  src/a.ts  "], "src/a.ts", true),
        (&["src/{a,b}.ts"], "src/a.ts", false),
        (&[], "src/a.ts", false),
    ];
    for (entries, path, expected) in rows {
        assert_eq!(
            *expected,
            scope_covers_path(&strings(entries), path),
            "scope {entries:?} of path {path:?}"
        );
    }

    let glob_rows: &[(&[&str], &str, bool)] = &[
        (&["src/alpha/**"], "src/alpha/a.ts", true),
        (&["src/alpha/**"], "src/alpha", false),
        (&["src/alpha/**"], "src/alphabet/a.ts", false),
        (&["src/*.ts"], "src/a.ts", true),
        (&["src/*.ts"], "src/x/a.ts", false),
        (&["src/*.ts"], "src/aXts", false),
        (&["src/**/*.ts"], "src/a.ts", true),
        (&["src/**/*.ts"], "src/x/y/a.ts", true),
        (&["src/**.ts"], "src/x/a.ts", true),
        (&["src/?.ts"], "src/a.ts", true),
        (&["src/?.ts"], "src/ab.ts", false),
        (&["src/?.ts"], "src//.ts", false),
        (&["src/alpha/"], "src/alpha/deep/a.ts", true),
        (&["src/alpha"], "src/alpha/a.ts", false),
        (&["./src/a.ts"], "src/a.ts", true),
        (&["src\\a.ts"], "src/a.ts", true),
        (&["src/a.ts"], "./src/a.ts", true),
        (&["  src/a.ts  "], "src/a.ts", true),
        (&["src/a.ts"], "src/a.tsx", false),
        (&[], "src/a.ts", false),
        (&["src/a.ts", "src/b/**"], "src/b/c.ts", true),
        (&["**"], "any/path.md", true),
    ];
    for (entries, path, expected) in glob_rows {
        assert_eq!(
            *expected,
            scope_covers_path(&strings(entries), path),
            "scope {entries:?} of path {path:?}"
        );
    }

    let edge_rows: &[(&[&str], &str, bool)] = &[
        (&["src/**/*.ts"], "src/a.md", false),
        (&["src/**/*.ts"], "src/x/y/a.md", false),
        (&["src/**/*.ts"], "src/x/y/a.js", false),
        (&["a/**/c"], "a/c", true),
        (&["a/**/c"], "a/b/c", true),
        (&["a/**/c"], "a/b/d", false),
        (&["**/a.ts"], "a.ts", true),
        (&["**/a.ts"], "x/y/a.ts", true),
        (&["**/a.ts"], "x/y/a.js", false),
    ];
    for (entries, path, expected) in edge_rows {
        assert_eq!(
            *expected,
            scope_covers_path(&strings(entries), path),
            "scope {entries:?} of path {path:?}"
        );
    }
}

/// The scope audit rows about paths the scope does or does not cover.
fn scope_mismatch_rows() -> Vec<AuditRow> {
    use PathChange::{Deleted, Modified};

    vec![
        (changed_paths(&[("src/a.ts", Modified)]), false, vec![]),
        (
            changed_paths(&[("src/b.ts", Modified)]),
            false,
            vec![disallowed("src/b.ts", DisallowReason::OutsideScope)],
        ),
        (
            changed_paths(&[("crates/alpha/src/lib.rs", Deleted)]),
            false,
            vec![],
        ),
    ]
}

/// The scope audit rows about lock files and the manifests they follow.
fn lock_rule_rows() -> Vec<AuditRow> {
    use PathChange::Modified;

    vec![
        (
            changed_paths(&[
                ("crates/alpha/Cargo.toml", Modified),
                ("Cargo.lock", Modified),
            ]),
            false,
            vec![],
        ),
        (
            changed_paths(&[("Cargo.lock", Modified)]),
            false,
            vec![disallowed("Cargo.lock", DisallowReason::OutsideScope)],
        ),
        (
            changed_paths(&[
                ("crates/beta/Cargo.toml", Modified),
                ("Cargo.lock", Modified),
            ]),
            false,
            vec![
                disallowed("Cargo.lock", DisallowReason::OutsideScope),
                disallowed("crates/beta/Cargo.toml", DisallowReason::OutsideScope),
            ],
        ),
        (
            changed_paths(&[
                ("crates/alpha/Cargo.toml", Modified),
                ("crates/gamma/Cargo.lock", Modified),
            ]),
            false,
            vec![disallowed(
                "crates/gamma/Cargo.lock",
                DisallowReason::OutsideScope,
            )],
        ),
        (
            changed_paths(&[
                ("crates/alpha/Cargo.toml", Modified),
                ("pnpm-lock.yaml", Modified),
            ]),
            false,
            vec![disallowed("pnpm-lock.yaml", DisallowReason::OutsideScope)],
        ),
    ]
}

/// The scope audit rows about frozen tests.
fn frozen_test_rows() -> Vec<AuditRow> {
    use DisallowReason::{FrozenTestDeleted, FrozenTestModified, OutsideScope};
    use PathChange::{Added, Deleted, Modified};

    vec![
        (
            changed_paths(&[("crates/alpha/tests/a.rs", Modified)]),
            false,
            vec![disallowed("crates/alpha/tests/a.rs", FrozenTestModified)],
        ),
        (
            changed_paths(&[("crates/alpha/tests/a.rs", Modified)]),
            true,
            vec![],
        ),
        (
            changed_paths(&[("crates/alpha/tests/a.rs", Deleted)]),
            false,
            vec![disallowed("crates/alpha/tests/a.rs", FrozenTestDeleted)],
        ),
        (
            changed_paths(&[("crates/alpha/tests/new.rs", Added)]),
            false,
            vec![],
        ),
        (
            changed_paths(&[("crates/beta/tests/a.rs", Modified)]),
            true,
            vec![
                disallowed("crates/beta/tests/a.rs", OutsideScope),
                disallowed("crates/beta/tests/a.rs", FrozenTestModified),
            ],
        ),
        (
            changed_paths(&[("crates/beta/tests/new.rs", Added)]),
            false,
            vec![disallowed("crates/beta/tests/new.rs", OutsideScope)],
        ),
        (
            changed_paths(&[("tests/new.test.ts", Added)]),
            false,
            vec![],
        ),
        (
            changed_paths(&[("tests/old.test.ts", Modified)]),
            true,
            vec![
                disallowed("tests/old.test.ts", OutsideScope),
                disallowed("tests/old.test.ts", FrozenTestModified),
            ],
        ),
    ]
}

/// The scope audit rows about the change folder.
fn change_folder_rows() -> Vec<AuditRow> {
    use PathChange::{Added, Modified};

    vec![
        (
            changed_paths(&[("openspec/changes/001-a/.run/results/1.md", Added)]),
            false,
            vec![],
        ),
        (
            changed_paths(&[("openspec/changes/001-a/tasks.md", Modified)]),
            false,
            vec![],
        ),
        (
            changed_paths(&[("openspec/changes/001-ab/notes.md", Added)]),
            false,
            vec![disallowed(
                "openspec/changes/001-ab/notes.md",
                DisallowReason::OutsideScope,
            )],
        ),
    ]
}

/// Proves every row of "Scope audit cases".
///
/// Covers: rust-core/scope-audit-cases
#[test]
fn scope_audit_cases() {
    let mut rows = scope_mismatch_rows();
    rows.extend(lock_rule_rows());
    rows.extend(frozen_test_rows());
    rows.extend(change_folder_rows());
    for (changes, tests_modify, expected) in &rows {
        assert_eq!(
            *expected,
            audit_scope(&audit(*tests_modify, changes.clone())),
            "changes {changes:?}, tests_modify {tests_modify}"
        );
    }
}

/// Proves that a root lock file follows a covered manifest in a deep folder.
///
/// Covers: rust-core/lock-file-at-the-root-follows-any-covered-manifest
#[test]
fn lock_file_at_the_root_follows_any_covered_manifest() {
    let root_audit = ScopeAudit {
        scope: strings(&["crates/alpha/deep/**"]),
        tests_modify: false,
        change_folder: "openspec/changes/001-a".to_owned(),
        test_folders: vec![],
        lock_rules: vec![lock_rule(&["Cargo.toml"], &["Cargo.lock"])],
        changes: changed_paths(&[
            ("crates/alpha/deep/Cargo.toml", PathChange::Modified),
            ("Cargo.lock", PathChange::Modified),
        ]),
    };
    assert_eq!(Vec::<Disallowed>::new(), audit_scope(&root_audit));

    let same_folder_audit = ScopeAudit {
        changes: changed_paths(&[
            ("crates/alpha/Cargo.toml", PathChange::Modified),
            ("crates/alpha/Cargo.lock", PathChange::Modified),
        ]),
        scope: strings(&["crates/alpha/Cargo.toml"]),
        ..root_audit
    };
    assert_eq!(Vec::<Disallowed>::new(), audit_scope(&same_folder_audit));
}
