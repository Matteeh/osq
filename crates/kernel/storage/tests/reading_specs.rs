//! Proves the specs kernel readings a change snapshot carries.

use std::fs;
use std::path::{Path, PathBuf};

use osq_kernel_specs::VerifyStarts;
use osq_kernel_storage::{
    ChangeEntry, ChangeSnapshot, Location, StorageError, TaskFile, read_change,
};

/// The directory holding the spec tables fixture project.
fn project() -> PathBuf {
    Path::new(env!("CARGO_MANIFEST_DIR")).join("tests/fixtures/spec-tables")
}

/// A change entry of the spec tables fixture project.
fn entry(folder: &str, location: Location) -> ChangeEntry {
    let changes = project().join("openspec").join("changes");
    let path = match location {
        Location::Active => changes.join(folder),
        Location::Archived => changes.join("archive").join(folder),
        Location::Rejected => changes.join("rejected").join(folder),
    };
    ChangeEntry {
        folder: folder.to_owned(),
        location,
        path,
    }
}

/// One task of a snapshot by its id.
fn task<'a>(snapshot: &'a ChangeSnapshot, id: &str) -> &'a TaskFile {
    snapshot
        .tasks
        .iter()
        .find(|task| task.id.as_str() == id)
        .unwrap_or_else(|| panic!("no task {id}"))
}

/// The names of a list of requirement blocks.
fn names(requirements: &[osq_kernel_specs::Requirement]) -> Vec<&str> {
    requirements.iter().map(|req| req.name.as_str()).collect()
}

/// The sorted path keys of one task's outcome.
fn hash_paths(task: &TaskFile) -> Option<Vec<&str>> {
    task.outcome
        .scope_hash_paths
        .as_ref()
        .map(|paths| paths.iter().map(String::as_str).collect())
}

/// Proves the delta specs of the archived fixture `001-planned`.
///
/// Covers: rust-storage/deltas-of-the-spec-tables-fixture
#[test]
fn deltas_of_the_spec_tables_fixture() {
    let snapshot = read_change(&entry("001-planned", Location::Archived)).unwrap();
    let capabilities: Vec<&str> = snapshot
        .deltas
        .iter()
        .map(|delta| delta.capability.as_str())
        .collect();
    assert_eq!(capabilities, ["alpha", "beta"]);

    let alpha = &snapshot.deltas[0].delta;
    assert_eq!(names(&alpha.added), ["Alpha added", "Alpha second added"]);
    assert_eq!(names(&alpha.modified), ["Alpha modified"]);
    assert_eq!(alpha.removed, ["Alpha removed"]);
    assert_eq!(alpha.renamed.len(), 1);
    assert_eq!(alpha.renamed[0].from, "Alpha old name");
    assert_eq!(alpha.renamed[0].to, "Alpha new name");

    let beta = &snapshot.deltas[1].delta;
    assert_eq!(names(&beta.added), ["Beta added"]);
    assert_eq!(beta.modified, Vec::<osq_kernel_specs::Requirement>::new());
    assert_eq!(beta.removed, Vec::<String>::new());
    assert_eq!(beta.renamed, Vec::<osq_kernel_specs::Rename>::new());
}

/// Proves a change without a `specs/` folder has no deltas.
///
/// Covers: rust-storage/no-delta-folder
#[test]
fn no_delta_folder() {
    let snapshot = read_change(&entry("002-bare", Location::Archived)).unwrap();
    assert_eq!(
        snapshot.deltas,
        Vec::<osq_kernel_storage::CapabilityDelta>::new()
    );
}

/// Proves the proposal verify and each task's specs kernel plan.
///
/// Covers: rust-storage/plans-of-the-spec-tables-fixture
#[test]
fn plans_of_the_spec_tables_fixture() {
    let snapshot = read_change(&entry("001-planned", Location::Archived)).unwrap();
    assert_eq!(snapshot.verify, "node verify.cjs");

    let one = task(&snapshot, "1");
    assert_eq!(one.plan.scope, ["src/alpha/**", "tests/alpha.test.ts"]);
    assert_eq!(
        one.plan.verify,
        "node --test tests/alpha.test.ts tests/alpha.test.ts"
    );
    assert!(!one.plan.tests_modify);
    assert_eq!(one.plan.verify_starts, VerifyStarts::Red);

    let two = task(&snapshot, "2");
    assert_eq!(two.plan.scope, ["src/beta/**"]);
    assert_eq!(
        two.plan.verify,
        "node --test 'tests/a.test.ts' \"src/b.spec.ts\""
    );
    assert!(two.plan.tests_modify);
    assert_eq!(two.plan.verify_starts, VerifyStarts::Red);

    let three = task(&snapshot, "3");
    assert_eq!(three.plan.scope, ["src/alpha/**"]);
    assert_eq!(three.plan.verify, "node --test tests/*.test.ts");
    assert!(!three.plan.tests_modify);
    assert_eq!(three.plan.verify_starts, VerifyStarts::Green);

    let four = task(&snapshot, "4");
    assert_eq!(four.plan.scope, Vec::<String>::new());
    assert_eq!(four.plan.verify, "node verify.cjs");
    assert_eq!(four.plan.verify_starts, VerifyStarts::Any);

    let ten = task(&snapshot, "10");
    assert_eq!(ten.plan.scope, ["./src/alpha/**", "src/shared.ts"]);
    assert_eq!(ten.plan.verify, "cargo test -p alpha");
    assert_eq!(ten.plan.verify_starts, VerifyStarts::Red);
}

/// Proves a proposal without a verify reads as empty text.
///
/// Covers: rust-storage/proposal-without-a-verify
#[test]
fn proposal_without_a_verify() {
    let snapshot = read_change(&entry("002-bare", Location::Archived)).unwrap();
    assert_eq!(snapshot.verify, "");
}

/// Proves a task file the specs kernel refuses fails the read naming it.
///
/// Covers: rust-storage/refused-task-file
#[test]
fn refused_task_file() {
    let root = Path::new(env!("CARGO_TARGET_TMPDIR")).join("refused_task_file");
    let _ = fs::remove_dir_all(&root);
    let dir = root.join("openspec/changes/archive/001-bad");
    fs::create_dir_all(dir.join("tasks")).unwrap();
    fs::write(dir.join("proposal.md"), "---\ntitle: Bad\n---\n").unwrap();
    fs::write(dir.join("tasks/1.md"), "---\ntitle: [unclosed\n---\n").unwrap();
    let error = read_change(&ChangeEntry {
        folder: String::from("001-bad"),
        location: Location::Archived,
        path: dir,
    })
    .unwrap_err();
    let StorageError::Specs(source) = &error else {
        panic!("expected a specs error, got {error:?}");
    };
    assert!(
        source.to_string().contains("tasks/1.md"),
        "message was {source}"
    );
    assert!(std::error::Error::source(&error).is_some());
}

/// Proves each task's outcome facts, read from its own stream.
///
/// Covers: rust-storage/outcomes-of-the-spec-tables-fixture
#[test]
fn outcomes_of_the_spec_tables_fixture() {
    let snapshot = read_change(&entry("001-planned", Location::Archived)).unwrap();

    let one = task(&snapshot, "1").outcome.clone();
    assert_eq!(one.start_scope_files, Some(2));
    assert_eq!(
        hash_paths(task(&snapshot, "1")),
        Some(vec!["src/alpha/a.ts", "src/alpha/b.ts", "src/beta/c.ts"])
    );
    assert_eq!(one.changed_files, Some(3));
    assert!(one.first_attempt_passed);

    let two = task(&snapshot, "2").outcome.clone();
    assert_eq!(two.start_scope_files, Some(1));
    assert_eq!(hash_paths(task(&snapshot, "2")), None);
    assert_eq!(two.changed_files, Some(5));
    assert!(!two.first_attempt_passed);

    let three = task(&snapshot, "3").outcome.clone();
    assert_eq!(three.start_scope_files, None);
    assert_eq!(
        hash_paths(task(&snapshot, "3")),
        Some(vec!["src/shared.ts"])
    );
    assert_eq!(three.changed_files, None);
    assert!(!three.first_attempt_passed);

    let four = task(&snapshot, "4").outcome.clone();
    assert_eq!(four.start_scope_files, None);
    assert_eq!(hash_paths(task(&snapshot, "4")), None);
    assert_eq!(four.changed_files, None);
    assert!(!four.first_attempt_passed);

    let ten = task(&snapshot, "10").outcome.clone();
    assert_eq!(ten.start_scope_files, None);
    assert_eq!(
        hash_paths(task(&snapshot, "10")),
        Some(vec!["notes/z.md", "src/alpha/x.ts", "src/beta/y.ts"])
    );
    assert_eq!(ten.changed_files, Some(3));
    assert!(!ten.first_attempt_passed);
}

/// Proves a task without a stream gets the default outcome facts.
///
/// Covers: rust-storage/task-without-a-stream
#[test]
fn task_without_a_stream() {
    let snapshot = read_change(&entry("002-bare", Location::Archived)).unwrap();
    let outcome = task(&snapshot, "1").outcome.clone();
    assert_eq!(outcome.start_scope_files, None);
    assert_eq!(outcome.scope_hash_paths, None);
    assert_eq!(outcome.changed_files, None);
    assert!(!outcome.first_attempt_passed);
}
