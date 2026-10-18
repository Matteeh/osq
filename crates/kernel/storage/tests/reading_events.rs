//! Proves the reading edges the mutation check needs beyond the scenario rows.

use std::collections::BTreeMap;
use std::fs;
use std::path::{Path, PathBuf};

use osq_core::{EventError, TaskId};
use osq_kernel_storage::{
    ChangeEntry, DeadAttempt, Location, StorageError, read_archive, read_change,
};

/// A task stream with one started event, one cost and one dead event.
const TASK_EVENTS: &str = "{\"type\":\"started\",\"timestamp\":\"2026-10-01T10:00:00.000Z\",\"data\":{\"attempt\":1}}\n\
{\"type\":\"tokens\",\"timestamp\":\"2026-10-01T10:00:01.000Z\",\"data\":{\"promptTokens\":1,\"candidateTokens\":1,\"cost\":0.5}}\n\
{\"type\":\"dead\",\"timestamp\":\"2026-10-01T10:00:02.000Z\",\"data\":{\"task\":\"1\",\"reason\":\"r\"}}\n";

/// A change stream whose started, cost and dead must not reach the facts.
const CHANGE_EVENTS: &str = "{\"type\":\"started\",\"timestamp\":\"2026-10-01T10:00:00.000Z\",\"data\":{\"attempt\":1}}\n\
{\"type\":\"tokens\",\"timestamp\":\"2026-10-01T10:00:01.000Z\",\"data\":{\"promptTokens\":1,\"candidateTokens\":1,\"cost\":99.0}}\n\
{\"type\":\"retry\",\"timestamp\":\"2026-10-01T10:00:02.000Z\",\"data\":{\"target\":\"change\",\"reason\":\"human\",\"attempt\":1}}\n\
{\"type\":\"retry\",\"timestamp\":\"2026-10-01T10:00:02.500Z\",\"data\":{\"target\":\"change\",\"reason\":\"human\",\"attempt\":2}}\n\
{\"type\":\"retry\",\"timestamp\":\"2026-10-01T10:00:03.000Z\",\"data\":{\"target\":\"change\",\"reason\":\"human\",\"attempt\":3,\"automatic\":true}}\n\
{\"type\":\"dead\",\"timestamp\":\"2026-10-01T10:00:04.000Z\",\"data\":{\"task\":\"change\",\"reason\":\"x\"}}\n\
{\"type\":\"archived\",\"timestamp\":\"2026-10-01T10:30:00.500Z\",\"data\":{\"archivePath\":\"p\"}}\n";

/// A validator stream no fact may read.
const VALIDATOR_EVENTS: &str = "{\"type\":\"started\",\"timestamp\":\"2026-10-01T10:00:00.000Z\",\"data\":{}}\n\
{\"type\":\"tokens\",\"timestamp\":\"2026-10-01T10:00:01.000Z\",\"data\":{\"promptTokens\":1,\"candidateTokens\":1,\"cost\":7.0}}\n\
{\"type\":\"retry\",\"timestamp\":\"2026-10-01T10:00:02.000Z\",\"data\":{\"target\":\"1\",\"reason\":\"human\",\"attempt\":2}}\n\
{\"type\":\"dead\",\"timestamp\":\"2026-10-01T10:00:03.000Z\",\"data\":{\"task\":\"1\",\"reason\":\"v\"}}\n\
{\"type\":\"archived\",\"timestamp\":\"2026-12-31T00:00:00.000Z\",\"data\":{\"archivePath\":\"v\"}}\n";

/// A fresh temporary project root, with anything at that name removed.
fn temp_root(name: &str) -> PathBuf {
    let root = Path::new(env!("CARGO_TARGET_TMPDIR")).join(name);
    let _ = fs::remove_dir_all(&root);
    root
}

/// A change entry of a temporary project root.
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

/// Writes a file, creating its parent folders.
fn write(path: &Path, text: &str) {
    fs::create_dir_all(path.parent().unwrap()).unwrap();
    fs::write(path, text).unwrap();
}

/// Proves each fact comes from its own stream and from no other.
///
/// Covers: rust-storage/archived-change-snapshot
#[test]
fn facts_ignore_other_streams() {
    let root = temp_root("facts_other_streams");
    let dir = root.join("openspec/changes/archive/001-x");
    write(&dir.join("tasks/1.md"), "---\ntitle: \"One\"\n---\n");
    write(&dir.join(".run/events/1.jsonl"), TASK_EVENTS);
    write(&dir.join(".run/events/change.jsonl"), CHANGE_EVENTS);
    write(&dir.join(".run/events/validator.jsonl"), VALIDATOR_EVENTS);
    let snapshot = read_change(&entry(&root, "001-x", Location::Archived)).unwrap();
    let facts = snapshot.facts.as_ref().unwrap();
    assert_eq!(facts.started, BTreeMap::from([(TaskId::new("1"), 1)]));
    assert_eq!(facts.cost, Some(0.5));
    assert_eq!(facts.halts, 2);
    assert_eq!(
        facts.dead_attempts,
        [DeadAttempt {
            task: String::from("1"),
            reason: String::from("r"),
        }]
    );
    assert_eq!(
        facts.archived_at.as_deref(),
        Some("2026-10-01T10:30:00.500Z")
    );
}

/// Proves the validator stream is read and its refused line names the file.
///
/// Covers: rust-storage/malformed-event-line
#[test]
fn validator_stream_is_read() {
    let root = temp_root("validator_stream");
    let dir = root.join("openspec/changes/archive/001-x");
    write(
        &dir.join(".run/events/validator.jsonl"),
        "{\"type\":\"started\",\"timestamp\":\"2026-10-01T10:00:00.000Z\",\"data\":{}}\n{not json\n",
    );
    let error = read_change(&entry(&root, "001-x", Location::Archived)).unwrap_err();
    let StorageError::EventLine { path, line, source } = error else {
        panic!("expected an event line error, got {error:?}");
    };
    assert!(
        path.ends_with("validator.jsonl"),
        "path was {}",
        path.display()
    );
    assert_eq!(line, 2);
    assert_eq!(source, EventError::NotJson);
}

/// Proves an empty manifest planner falls back to the brief's.
///
/// Covers: rust-storage/archived-change-snapshot
#[test]
fn planner_falls_back_to_brief() {
    let root = temp_root("planner_fallback");
    let dir = root.join("openspec/changes/archive/001-x");
    write(&dir.join("proposal.md"), "---\ntitle: \"X\"\n---\n");
    write(
        &dir.join("brief.md"),
        "---\nplanner: \" brief-planner \"\n---\n",
    );
    write(&dir.join(".run/manifest.json"), "{\"planner\":\"   \"}");
    let snapshot = read_change(&entry(&root, "001-x", Location::Archived)).unwrap();
    assert_eq!(snapshot.planner.as_deref(), Some("brief-planner"));
}

/// Proves `approvedAt` needs both the marker and a readable timestamp.
///
/// Covers: rust-storage/archived-change-snapshot
#[test]
fn approved_at_needs_marker_and_timestamp() {
    let root = temp_root("approved_at_edges");
    let dir = root.join("openspec/changes/archive/001-x");
    write(&dir.join(".run/approved"), "sha256:x\n");
    write(&dir.join(".run/manifest.json"), "{\"approvedAt\":\"nope\"}");
    let snapshot = read_change(&entry(&root, "001-x", Location::Archived)).unwrap();
    assert_eq!(snapshot.approved_at, None);

    let root = temp_root("approved_at_unmarked");
    let dir = root.join("openspec/changes/archive/001-x");
    write(
        &dir.join(".run/manifest.json"),
        "{\"approvedAt\":\"2026-10-01T10:00:00.000Z\"}",
    );
    let snapshot = read_change(&entry(&root, "001-x", Location::Archived)).unwrap();
    assert!(!snapshot.approved);
    assert_eq!(snapshot.approved_at, None);
}

/// Proves task titles trim, a non-string title is empty and only `.md` counts.
///
/// Covers: rust-storage/archived-change-snapshot
#[test]
fn task_file_edges() {
    let root = temp_root("task_file_edges");
    let dir = root.join("openspec/changes/archive/001-x");
    write(&dir.join("tasks/1.md"), "---\ntitle: 12\n---\n");
    write(&dir.join("tasks/2.md"), "---\ntitle: \"  x  \"\n---\n");
    write(&dir.join("tasks/notes.txt"), "ignored\n");
    write(&dir.join(".run/done/1"), "done\n");
    let snapshot = read_change(&entry(&root, "001-x", Location::Archived)).unwrap();
    let ids: Vec<String> = snapshot
        .tasks
        .iter()
        .map(|task| task.id.to_string())
        .collect();
    let titles: Vec<&str> = snapshot
        .tasks
        .iter()
        .map(|task| task.title.as_str())
        .collect();
    let done: Vec<bool> = snapshot.tasks.iter().map(|task| task.done).collect();
    assert_eq!(ids, ["1", "2"]);
    assert_eq!(titles, ["", "x"]);
    assert_eq!(done, [true, false]);
}

/// Proves an event file that cannot be read is a `Read` error naming it.
///
/// Covers: rust-storage/malformed-event-line
#[test]
fn unreadable_event_file() {
    let root = temp_root("unreadable_event_file");
    let dir = root.join("openspec/changes/archive/001-x");
    fs::create_dir_all(dir.join(".run/events/1.jsonl")).unwrap();
    let error = read_change(&entry(&root, "001-x", Location::Archived)).unwrap_err();
    let StorageError::Read { path, .. } = error else {
        panic!("expected a read error, got {error:?}");
    };
    assert!(path.ends_with("1.jsonl"), "path was {}", path.display());
}

/// Proves `read_archive` fails on the first archived change it cannot read.
///
/// Covers: rust-storage/fixture-archive-reads
#[test]
fn read_archive_fails_on_the_first_bad_change() {
    let root = temp_root("archive_bad_change");
    let bad = root.join("openspec/changes/archive/001-bad");
    write(&bad.join("proposal.md"), "---\ntitle: \"Bad\"\n---\n");
    write(&bad.join(".run/events/1.jsonl"), "{not json\n");
    let good = root.join("openspec/changes/archive/002-good");
    write(&good.join("proposal.md"), "---\ntitle: \"Good\"\n---\n");
    let error = read_archive(&root).unwrap_err();
    let StorageError::EventLine { path, .. } = error else {
        panic!("expected an event line error, got {error:?}");
    };
    assert!(
        path.ends_with("001-bad/.run/events/1.jsonl"),
        "path was {}",
        path.display()
    );
}

/// Proves the error's message names its file, line and source.
///
/// Covers: rust-storage/malformed-event-line
#[test]
fn storage_error_messages() {
    let read = StorageError::Read {
        path: PathBuf::from("x.jsonl"),
        source: std::io::Error::other("boom"),
    };
    assert_eq!(read.to_string(), "failed to read x.jsonl: boom");
    assert!(std::error::Error::source(&read).is_some());

    let line = StorageError::EventLine {
        path: PathBuf::from("e.jsonl"),
        line: 3,
        source: EventError::NotJson,
    };
    assert_eq!(line.to_string(), "e.jsonl:3: line is not one JSON object");
    assert!(std::error::Error::source(&line).is_some());
}
