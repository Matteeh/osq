//! Proves resolving task scopes against the fixture repository.

use std::fs;
use std::path::{Path, PathBuf};

use osq_kernel_loop::scope_files;

/// The fixture repository every table row resolves against.
fn repository() -> PathBuf {
    Path::new(env!("CARGO_MANIFEST_DIR")).join("tests/fixtures/repo")
}

/// Builds one row's scope entries.
fn scope(entries: &[&str]) -> Vec<String> {
    entries.iter().copied().map(str::to_string).collect()
}

/// Proves every row of "Scope files of the fixture repository", and that a
/// search root outside the project is not walked.
///
/// Covers: rust-loop/scope-files-of-the-fixture-repository
#[test]
fn scope_files_of_the_fixture_repository() {
    let rows: &[(&[&str], &[&str])] = &[
        (&["src/a.ts"], &["src/a.ts"]),
        (&["./src/b.ts"], &["src/b.ts"]),
        (&["src\\b.ts"], &["src/b.ts"]),
        (&["src/missing.ts"], &["src/missing.ts"]),
        (
            &["crates/kernel/demo/src/*.rs"],
            &[
                "crates/kernel/demo/src/lib.rs",
                "crates/kernel/demo/src/read.rs",
            ],
        ),
        (
            &["crates/kernel/demo/"],
            &[
                "crates/kernel/demo/src/lib.rs",
                "crates/kernel/demo/src/read.rs",
                "crates/kernel/demo/tests/reading.rs",
            ],
        ),
        (
            &["crates/kernel/demo/**/*.rs"],
            &[
                "crates/kernel/demo/src/lib.rs",
                "crates/kernel/demo/src/read.rs",
                "crates/kernel/demo/tests/reading.rs",
            ],
        ),
        (
            &["crates/kernel/*/src/lib.rs"],
            &["crates/kernel/demo/src/lib.rs"],
        ),
        (&["src/?.ts"], &["src/a.ts", "src/b.ts"]),
        (&["docs/*.md"], &["docs/*.md"]),
        (&["../outside/*.ts"], &["../outside/*.ts"]),
        (
            &["src/b.ts", "src/a.ts", "src/a.ts"],
            &["src/a.ts", "src/b.ts"],
        ),
        (&["src/*.ts", "src/a.ts"], &["src/a.ts", "src/b.ts"]),
        (&[], &[]),
    ];
    for (entries, expected) in rows {
        assert_eq!(
            scope_files(&repository(), &scope(entries)),
            scope(expected),
            "scope {entries:?}"
        );
    }

    let root = Path::new(env!("CARGO_TARGET_TMPDIR")).join("scope_files_guards");
    let _ = fs::remove_dir_all(&root);
    let project = root.join("project");
    fs::create_dir_all(root.join("outside")).unwrap();
    fs::create_dir_all(project.join("src")).unwrap();
    fs::write(root.join("outside/out.ts"), "// data\n").unwrap();
    fs::write(project.join("src/a.ts"), "// data\n").unwrap();
    fs::write(project.join("top.ts"), "// data\n").unwrap();
    assert_eq!(scope_files(&project, &scope(&["*.ts"])), scope(&["top.ts"]));
    assert_eq!(
        scope_files(&project, &scope(&["../outside/*.ts"])),
        scope(&["../outside/*.ts"])
    );
    let absolute = format!("{}/*.ts", project.join("src").display());
    assert_eq!(
        scope_files(&project, &scope(&[absolute.as_str()])),
        scope(&[absolute.as_str()])
    );
}
