//! Reader tests: each kind reads its fixture, and every error names the file.

use osq_kernel_specs::{
    SpecsError, read_delta, read_living_spec, read_proposal, read_sidecar, read_task_file,
    read_task_list,
};
use std::fs;
use std::path::{Path, PathBuf};

/// A path under the test target's temporary folder.
fn temp(name: &str) -> PathBuf {
    Path::new(env!("CARGO_TARGET_TMPDIR"))
        .join("specs-reading")
        .join(name)
}

/// Writes `bytes` to a temporary file and returns its path.
fn write_temp(name: &str, bytes: &[u8]) -> PathBuf {
    let path = temp(name);
    fs::create_dir_all(path.parent().expect("a parent")).expect("a temporary folder");
    fs::write(&path, bytes).expect("a temporary file");
    path
}

/// Asserts that an error is a read error naming `path`.
fn assert_read_error(error: SpecsError, path: &Path) {
    match error {
        SpecsError::Read { path: named, .. } => assert_eq!(path, named),
        other => panic!("expected a read error, got {other:?}"),
    }
}

/// Asserts that an error is a syntax error naming `path` and `line`.
fn assert_syntax_error(error: SpecsError, path: &Path, line: usize) {
    match error {
        SpecsError::Syntax {
            path: named,
            line: named_line,
            ..
        } => {
            assert_eq!(path, named);
            assert_eq!(line, named_line);
        }
        other => panic!("expected a syntax error, got {other:?}"),
    }
}

/// Covers: rust-specs/reading-errors
#[test]
fn reading_errors() {
    let missing = temp("missing-task.md");
    assert_read_error(
        read_task_file(&missing).expect_err("a read error"),
        &missing,
    );

    let binary = write_temp("binary-task.md", &[0xff, 0xfe]);
    assert_read_error(read_task_file(&binary).expect_err("a read error"), &binary);

    let syntax = write_temp("syntax-task.md", b"---\ntitle: a\nb: : :\n---\n");
    assert_syntax_error(
        read_task_file(&syntax).expect_err("a syntax error"),
        &syntax,
        3,
    );

    let sidecar = write_temp("problem-osq.yml", b"group: \"\"\n");
    match read_sidecar(&sidecar).expect_err("a sidecar error") {
        SpecsError::Sidecar { path, problems } => {
            assert_eq!(sidecar, path);
            assert_eq!(vec!["group must be a non-empty string"], problems);
        }
        other => panic!("expected a sidecar error, got {other:?}"),
    }

    let bad_proposal = write_temp("bad-proposal.md", b"---\n- a\n---\n");
    assert_syntax_error(
        read_proposal(&bad_proposal).expect_err("a syntax error"),
        &bad_proposal,
        2,
    );

    let bad_sidecar = write_temp("bad-osq.yml", b"group: [\n");
    assert_syntax_error(
        read_sidecar(&bad_sidecar).expect_err("a syntax error"),
        &bad_sidecar,
        2,
    );
}

/// Covers: rust-specs/reading-errors
#[test]
fn reading_names_the_file() {
    let missing = temp("absent-task.md");
    let error = read_task_file(&missing).expect_err("a read error");
    assert!(
        error.to_string().contains(&missing.display().to_string()),
        "the error names the file: {error}"
    );

    let syntax = write_temp("named-syntax.md", b"---\ntitle: a\nb: : :\n---\n");
    let error = read_task_file(&syntax).expect_err("a syntax error");
    assert!(
        error
            .to_string()
            .starts_with(&format!("{}:3:", syntax.display())),
        "the error names the file and line: {error}"
    );
}

/// Covers: rust-specs/reading-errors
#[test]
fn reading_each_kind() {
    let folder = Path::new(env!("CARGO_MANIFEST_DIR")).join("tests/fixtures/documents");

    let living = read_living_spec(&folder.join("living.md")).expect("a living spec");
    assert_eq!("Sample Specification", living.title);
    assert_eq!("A sample capability.", living.purpose);
    assert_eq!(1, living.requirements.len());

    let delta = read_delta(&folder.join("delta.md")).expect("a delta spec");
    assert_eq!("sample", delta.title);
    assert_eq!(1, delta.added.len());

    let proposal = read_proposal(&folder.join("proposal.md")).expect("a proposal");
    assert_eq!("Sample proposal", proposal.title);
    assert_eq!("Do it.", proposal.goal);
    assert_eq!(1, proposal.contract_tables);

    let task = read_task_file(&folder.join("task.md")).expect("a task file");
    assert_eq!("Sample task", task.title);
    assert_eq!(vec!["It works."], task.acceptance);

    let items = read_task_list(&folder.join("tasks.md")).expect("a task list");
    assert_eq!(1, items.len());
    assert_eq!(Some(1), items[0].number);
    assert_eq!("Do it", items[0].title);

    let sidecar = read_sidecar(&folder.join("osq.yml")).expect("a sidecar");
    assert_eq!("sample", sidecar.group);
}
