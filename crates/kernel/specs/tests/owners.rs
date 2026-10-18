//! Scope glob and Code ownership tests, on the owners fixture.

use osq_kernel_specs::{
    CapabilityOwnership, owner_capabilities, read_capability_ownership, scope_covers_path,
};
use std::path::{Path, PathBuf};

/// The owners fixture's specs folder.
fn specs_dir() -> PathBuf {
    Path::new(env!("CARGO_MANIFEST_DIR")).join("tests/fixtures/owners/specs")
}

/// Builds the scope list of one test row.
fn scope(entries: &[&str]) -> Vec<String> {
    entries.iter().copied().map(str::to_string).collect()
}

/// Covers: rust-specs/scope-glob-cases
#[test]
fn scope_glob_cases() {
    let rows: &[(&[&str], &str, bool)] = &[
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
    for (entries, path, expected) in rows {
        assert_eq!(
            *expected,
            scope_covers_path(&scope(entries), path),
            "scope {entries:?} of path {path:?}"
        );
    }
}

/// Covers: rust-specs/scope-glob-cases
#[test]
fn scope_glob_edge_cases() {
    let rows: &[(&[&str], &str, bool)] = &[
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
    for (entries, path, expected) in rows {
        assert_eq!(
            *expected,
            scope_covers_path(&scope(entries), path),
            "scope {entries:?} of path {path:?}"
        );
    }
}

/// Covers: rust-specs/ownership-of-the-owners-fixture
#[test]
fn ownership_of_the_owners_fixture() {
    let expected = vec![
        CapabilityOwnership {
            capability: "alpha".to_string(),
            globs: scope(&["src/alpha/**"]),
        },
        CapabilityOwnership {
            capability: "beta".to_string(),
            globs: scope(&["src/beta/**", "src/shared.ts"]),
        },
        CapabilityOwnership {
            capability: "gamma".to_string(),
            globs: scope(&["src/shared.ts"]),
        },
    ];
    assert_eq!(expected, read_capability_ownership(&specs_dir()));
}

/// Covers: rust-specs/missing-specs-folder
#[test]
fn missing_specs_folder() {
    let absent = specs_dir().join("no-such-folder");
    assert_eq!(
        Vec::<CapabilityOwnership>::new(),
        read_capability_ownership(&absent)
    );
}

/// Covers: rust-specs/owners-of-a-path
#[test]
fn owners_of_a_path() {
    let ownerships = read_capability_ownership(&specs_dir());
    let rows: &[(&str, &[&str])] = &[
        ("src/shared.ts", &["beta", "gamma"]),
        ("src/alpha/a.ts", &["alpha"]),
        ("./src/beta/b.ts", &["beta"]),
        ("notes/z.md", &[]),
    ];
    for (path, expected) in rows {
        assert_eq!(
            scope(expected),
            owner_capabilities(&ownerships, path),
            "owners of {path:?}"
        );
    }
}
