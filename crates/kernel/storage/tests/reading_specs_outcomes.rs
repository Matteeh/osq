//! Proves the task stream outcome edges beyond the spec tables fixture.

use std::fs;
use std::path::{Path, PathBuf};

use osq_kernel_storage::{ChangeEntry, ChangeSnapshot, Location, TaskOutcomeFacts, read_change};

/// A fresh temporary project root, with anything at that name removed.
fn temp_root(name: &str) -> PathBuf {
    let root = Path::new(env!("CARGO_TARGET_TMPDIR")).join(name);
    let _ = fs::remove_dir_all(&root);
    root
}

/// Writes a file, creating its parent folders.
fn write(path: &Path, text: &str) {
    fs::create_dir_all(path.parent().unwrap()).unwrap();
    fs::write(path, text).unwrap();
}

/// An archived change entry of a temporary project root.
fn entry(root: &Path, folder: &str) -> ChangeEntry {
    ChangeEntry {
        folder: folder.to_owned(),
        location: Location::Archived,
        path: root.join("openspec/changes/archive").join(folder),
    }
}

/// One event line with the given type and data.
fn line(kind: &str, data: &str) -> String {
    format!(
        "{{\"type\":\"{kind}\",\"timestamp\":\"2026-10-01T08:00:00.000Z\",\"data\":{{{data}}}}}\n"
    )
}

/// One `measures` line with the given phase and scope file count.
fn measures(phase: &str, scope_files: u64, extra: &str) -> String {
    line(
        "measures",
        &format!(
            "\"phase\":\"{phase}\",\"scopeFiles\":{scope_files},\"scopeLines\":1,\"repoFiles\":1,\
             \"repoLines\":1,\"importFanIn\":0,\"proposalWords\":1,\"taskWords\":1,\
             \"deltaRequirements\":1,\"deltaScenarios\":1{extra}"
        ),
    )
}

/// A change with one task and the given events, read into its snapshot.
fn snapshot_with(name: &str, events: &str) -> ChangeSnapshot {
    let root = temp_root(name);
    let dir = root.join("openspec/changes/archive/001-x");
    write(&dir.join("tasks/1.md"), "---\ntitle: \"One\"\n---\n");
    write(&dir.join(".run/events/1.jsonl"), events);
    read_change(&entry(&root, "001-x")).unwrap()
}

/// Proves the first `start` measure gives the scope files and a later one does not.
///
/// Covers: rust-storage/outcomes-of-the-spec-tables-fixture
#[test]
fn outcome_keeps_the_first_start() {
    let snapshot = snapshot_with(
        "outcome_first_start",
        &format!(
            "{}{}{}{}{}",
            measures("start", 2, ""),
            line("started", "\"attempt\":1"),
            measures("middle", 99, ""),
            measures("start", 7, ""),
            line("done", "\"task\":\"1\""),
        ),
    );
    let outcome = snapshot.tasks[0].outcome.clone();
    assert_eq!(outcome.start_scope_files, Some(2));
    assert!(outcome.first_attempt_passed);
}

/// Proves the last `end` hash object wins and its missing keys keep none.
///
/// Covers: rust-storage/outcomes-of-the-spec-tables-fixture
#[test]
fn outcome_takes_the_last_end_that_holds_one() {
    let snapshot = snapshot_with(
        "outcome_last_end",
        &format!(
            "{}{}{}",
            measures(
                "end",
                1,
                ",\"changedFiles\":3,\"scopeHashes\":{\"b\":1,\"a\":1}"
            ),
            measures("end", 1, ",\"changedFiles\":5"),
            measures("end", 1, ",\"scopeHashes\":null"),
        ),
    );
    let outcome = snapshot.tasks[0].outcome.clone();
    assert_eq!(outcome.changed_files, None);
    assert_eq!(
        outcome.scope_hash_paths,
        Some(vec![String::from("a"), String::from("b")])
    );
}

/// Proves a non-object `scopeHashes` gives no paths.
///
/// Covers: rust-storage/task-without-a-stream
#[test]
fn outcome_hashes_must_be_an_object() {
    let snapshot = snapshot_with(
        "outcome_hashes_object",
        &format!(
            "{}{}",
            measures("end", 1, ",\"scopeHashes\":null"),
            measures("end", 1, ",\"scopeHashes\":5"),
        ),
    );
    assert_eq!(snapshot.tasks[0].outcome.scope_hash_paths, None);
}

/// Proves a `done` before the first `started` counts for nothing.
///
/// Covers: rust-storage/outcomes-of-the-spec-tables-fixture
#[test]
fn outcome_ignores_events_before_the_first_start() {
    let snapshot = snapshot_with(
        "outcome_before_start",
        &format!(
            "{}{}{}{}",
            line("done", "\"task\":\"1\""),
            line("started", "\"attempt\":1"),
            line("done", "\"task\":\"1\""),
            line("started", "\"attempt\":2"),
        ),
    );
    assert!(snapshot.tasks[0].outcome.first_attempt_passed);
}

/// Proves a `dead` right after the first start ends the attempt without passing.
///
/// Covers: rust-storage/outcomes-of-the-spec-tables-fixture
#[test]
fn outcome_dead_ends_the_first_attempt() {
    let snapshot = snapshot_with(
        "outcome_dead_first",
        &format!(
            "{}{}{}",
            line("started", "\"attempt\":1"),
            line("dead", "\"task\":\"1\",\"reason\":\"r\""),
            line("done", "\"task\":\"1\""),
        ),
    );
    assert!(!snapshot.tasks[0].outcome.first_attempt_passed);
}

/// Proves only `<n>.jsonl` task streams give outcome facts.
///
/// Covers: rust-storage/task-without-a-stream
#[test]
fn outcome_ignores_the_change_stream() {
    let root = temp_root("outcome_change_stream");
    let dir = root.join("openspec/changes/archive/001-x");
    write(&dir.join("tasks/1.md"), "---\ntitle: \"One\"\n---\n");
    write(
        &dir.join(".run/events/change.jsonl"),
        &format!(
            "{}{}{}",
            measures("start", 5, ""),
            measures("end", 5, ",\"changedFiles\":9"),
            line("done", "\"task\":\"1\""),
        ),
    );
    let snapshot = read_change(&entry(&root, "001-x")).unwrap();
    assert_eq!(snapshot.tasks[0].outcome, TaskOutcomeFacts::default());
}
