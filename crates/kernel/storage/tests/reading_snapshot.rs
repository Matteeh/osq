//! Proves reading one change folder and the archive, on the fixture projects.

use std::path::{Path, PathBuf};

use osq_core::event::DeadReason;
use osq_core::{ChangeStatus, EventError, TaskId, TaskStatus};
use osq_kernel_storage::{
    ChangeEntry, ChangeSnapshot, DeadAttempt, Location, StorageError, read_archive, read_change,
};

/// The directory holding every fixture project.
fn fixtures() -> PathBuf {
    Path::new(env!("CARGO_MANIFEST_DIR")).join("tests/fixtures")
}

/// A change entry of a fixture project.
fn entry(root: &Path, folder: &str, location: Location) -> ChangeEntry {
    let changes = root.join("openspec").join("changes");
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

/// The folded status of one task of a snapshot.
fn task_status(snapshot: &ChangeSnapshot, id: &str) -> TaskStatus {
    snapshot.state.tasks()[&TaskId::new(id)].status
}

/// Proves the snapshot of the archived fixture `001-alpha`.
///
/// Covers: rust-storage/archived-change-snapshot
#[test]
fn archived_change_snapshot() {
    let snapshot = read_change(&entry(
        &fixtures().join("project"),
        "001-alpha",
        Location::Archived,
    ))
    .unwrap();
    assert_eq!(snapshot.id, "001");
    assert_eq!(snapshot.folder, "001-alpha");
    assert_eq!(snapshot.title.as_deref(), Some("Alpha"));
    assert_eq!(snapshot.goal.as_deref(), Some("Ship alpha."));
    assert_eq!(snapshot.planner.as_deref(), Some("opus"));
    assert!(snapshot.approved);
    let ids: Vec<String> = snapshot
        .tasks
        .iter()
        .map(|task| task.id.to_string())
        .collect();
    assert_eq!(ids, ["1", "2", "10"]);
    let titles: Vec<&str> = snapshot
        .tasks
        .iter()
        .map(|task| task.title.as_str())
        .collect();
    assert_eq!(
        titles,
        ["When one, first", "When two, second", "When ten, tenth"]
    );
    let done: Vec<bool> = snapshot.tasks.iter().map(|task| task.done).collect();
    assert_eq!(done, [true, true, false]);
    let started: Vec<u64> = snapshot.tasks.iter().map(|task| task.started).collect();
    assert_eq!(started, [1, 2, 0]);
    assert_eq!(task_status(&snapshot, "1"), TaskStatus::Done);
    assert_eq!(task_status(&snapshot, "2"), TaskStatus::Done);
    assert_eq!(task_status(&snapshot, "10"), TaskStatus::Pending);
    assert_eq!(
        snapshot.state.record().archived.as_deref(),
        Some("openspec/changes/archive/001-alpha")
    );
    assert_eq!(snapshot.status, ChangeStatus::Archived);
    assert_eq!(
        snapshot.approved_at.as_deref(),
        Some("2026-10-01T10:00:00.000Z")
    );
    assert_eq!(
        snapshot.archive_time.as_deref(),
        Some("2026-10-01T10:30:00.500Z")
    );
    let facts = snapshot.facts.as_ref().unwrap();
    assert_eq!(facts.halts, 1);
    assert_eq!(facts.cost, Some(0.75));
    assert_eq!(
        facts.dead_attempts,
        [DeadAttempt {
            task: String::from("2"),
            reason: DeadReason::VerifyRed,
        }]
    );
}

/// Proves the snapshot of the active fixture `003-beta`.
///
/// Covers: rust-storage/active-change-snapshot
#[test]
fn active_change_snapshot() {
    let snapshot = read_change(&entry(
        &fixtures().join("project"),
        "003-beta",
        Location::Active,
    ))
    .unwrap();
    assert_eq!(snapshot.id, "003");
    assert_eq!(snapshot.title.as_deref(), Some("Beta"));
    assert!(!snapshot.approved);
    assert!(snapshot.facts.is_none());
    assert_eq!(snapshot.tasks.len(), 1);
    assert_eq!(snapshot.tasks[0].id.as_str(), "1");
    assert_eq!(snapshot.tasks[0].title, "When beta, waits");
    assert_eq!(task_status(&snapshot, "1"), TaskStatus::Pending);
    assert_eq!(snapshot.status, ChangeStatus::Unapproved);
}

/// Proves a malformed event line fails with its file, line and refusal.
///
/// Covers: rust-storage/malformed-event-line
#[test]
fn malformed_event_line() {
    let error = read_change(&entry(
        &fixtures().join("broken"),
        "001-broken",
        Location::Active,
    ))
    .unwrap_err();
    let StorageError::EventLine { path, line, source } = error else {
        panic!("expected an event line error, got {error:?}");
    };
    assert!(path.ends_with("1.jsonl"), "path was {}", path.display());
    assert_eq!(line, 3);
    assert_eq!(source, EventError::NotJson);
}

/// Proves a blank line between two events is skipped.
///
/// Covers: rust-storage/blank-lines-are-allowed
#[test]
fn blank_lines_are_allowed() {
    let snapshot = read_change(&entry(
        &fixtures().join("project"),
        "001-alpha",
        Location::Archived,
    ))
    .unwrap();
    let facts = snapshot.facts.as_ref().unwrap();
    assert_eq!(facts.started[&TaskId::new("2")], 2);
}

/// Proves stale `running` and `regressed` markers lose to the archive location.
///
/// Covers: rust-storage/stale-markers-in-an-archived-change
#[test]
fn stale_markers_in_an_archived_change() {
    let snapshot = read_change(&entry(
        &fixtures().join("project"),
        "010-late",
        Location::Archived,
    ))
    .unwrap();
    assert_eq!(snapshot.status, ChangeStatus::Archived);
}

/// Proves a rejected folder reads as rejected.
///
/// Covers: rust-storage/rejected-change
#[test]
fn rejected_change() {
    let snapshot = read_change(&entry(
        &fixtures().join("project"),
        "004-gamma",
        Location::Rejected,
    ))
    .unwrap();
    assert_eq!(snapshot.status, ChangeStatus::Rejected);
}

/// Proves `read_archive` reads the fixture archive in listing order.
///
/// Covers: rust-storage/fixture-archive-reads
#[test]
fn fixture_archive_reads() {
    let snapshots = read_archive(&fixtures().join("project")).unwrap();
    let folders: Vec<&str> = snapshots
        .iter()
        .map(|snapshot| snapshot.folder.as_str())
        .collect();
    assert_eq!(folders, ["001-alpha", "002-plain", "010-late"]);
    for snapshot in &snapshots {
        assert_eq!(snapshot.status, ChangeStatus::Archived);
    }
}
