//! Proves the events, plan records, manifest notices and history storage reads.

use std::fs;
use std::path::{Path, PathBuf};

use osq_core::{ChangeStatus, Stream};
use osq_kernel_storage::{
    ChangeEntry, LinkEntry, Location, Notice, PlanRecord, TableEvent, read_change, read_history,
};

/// The directory holding every fixture project.
fn fixtures() -> PathBuf {
    Path::new(env!("CARGO_MANIFEST_DIR")).join("tests/fixtures")
}

/// A change entry under one location of a project root.
fn entry(root: &Path, folder: &str, location: Location) -> ChangeEntry {
    let dir = match location {
        Location::Active => root.join("openspec/changes"),
        Location::Archived => root.join("openspec/changes/archive"),
        Location::Rejected => root.join("openspec/changes/rejected"),
    };
    ChangeEntry {
        folder: folder.to_owned(),
        location,
        path: dir.join(folder),
    }
}

/// Writes a file, creating its parent folders.
fn write(path: &Path, text: &str) {
    fs::create_dir_all(path.parent().unwrap()).unwrap();
    fs::write(path, text).unwrap();
}

/// A fresh temporary project root, with anything at that name removed.
fn temp_root(name: &str) -> PathBuf {
    let root = Path::new(env!("CARGO_TARGET_TMPDIR")).join(name);
    let _ = fs::remove_dir_all(&root);
    root
}

/// A notice with its id and severity.
fn notice(id: &str, severity: &str) -> Notice {
    Notice {
        id: id.to_owned(),
        severity: severity.to_owned(),
    }
}

/// A link finding with its severity, file and message.
fn link(severity: &str, file: &str, message: &str) -> LinkEntry {
    LinkEntry {
        severity: severity.to_owned(),
        file: file.to_owned(),
        message: message.to_owned(),
    }
}

/// One table event as `stream|type|timestamp`.
fn row(event: &TableEvent) -> (String, String, String) {
    let stream = match &event.stream {
        Stream::Task(id) => format!("task {id}"),
        Stream::Change => String::from("change"),
        Stream::Validator => String::from("validator"),
    };
    let typed = &event.event;
    let kind = format!("{typed:?}");
    (
        stream,
        kind.split('(').next().unwrap_or_default().to_owned(),
        event.timestamp.clone(),
    )
}

/// The kept table events of a change, as `stream|type|timestamp` rows.
fn table_rows(change: &ChangeEntry) -> Vec<(String, String, String)> {
    read_change(change)
        .unwrap()
        .facts
        .as_ref()
        .unwrap()
        .table_events
        .iter()
        .map(row)
        .collect()
}

/// Splits an expected `stream|type|timestamp` line into its three parts.
fn expected_row(line: &str) -> (String, String, String) {
    let mut parts = line.split('|');
    (
        parts.next().unwrap_or_default().to_owned(),
        parts.next().unwrap_or_default().to_owned(),
        parts.next().unwrap_or_default().to_owned(),
    )
}

/// The `stream|type|timestamp` rows the history fixture's `001-run` must keep.
#[rustfmt::skip]
const KEPT: &str = "\
task 1|Paused|2026-10-01T10:02:00.000Z
task 1|FocusedRan|2026-10-01T10:03:00.000Z
task 1|MutationRan|2026-10-01T10:04:00.000Z
task 1|Recertification|2026-10-01T10:05:00.000Z
task 2|FocusedRan|2026-10-01T10:07:00.000Z
task 2|MutationRan|2026-10-01T10:08:00.000Z
task 2|Recertification|2026-10-01T10:09:00.000Z
task 2|Recertification|2026-10-01T10:10:00.000Z
task 10|Paused|2026-10-01T10:12:00.000Z
change|ValidatorRan|2026-10-01T10:14:00.000Z
change|ValidatorRan|2026-10-01T10:15:00.000Z";

/// Proves the facts keep exactly the events the event tables read, in order.
///
/// Covers: rust-storage/kept-events-of-the-history-fixture
#[test]
#[rustfmt::skip]
fn kept_events_of_the_history_fixture() {
    let rows = table_rows(&entry(&fixtures().join("history"), "001-run", Location::Archived));
    let expected: Vec<(String, String, String)> = KEPT.lines().map(expected_row).collect();
    assert_eq!(rows, expected);
}

/// Proves the plan records keep their notices and link findings while dropping
/// the lines that are not records.
///
/// Covers: rust-storage/plan-records-of-the-history-fixture
#[test]
#[rustfmt::skip]
fn plan_records_of_the_history_fixture() {
    let records = read_change(&entry(&fixtures().join("history"), "001-run", Location::Archived)).unwrap().plan_records;
    let expected = [
        PlanRecord { notices: vec![notice("draft-only", "amber")], traceability: None },
        PlanRecord { notices: vec![notice("scope-wide", "red")], traceability: Some(vec![link("warning", "src/a.rs", "src/a.rs:3: tag is not valid")]) },
    ];
    assert_eq!(records, expected);
}

/// Proves a change without a readable plan file holds no plan records.
///
/// Covers: rust-storage/no-plan-file
#[test]
#[rustfmt::skip]
fn no_plan_file() {
    let quiet = read_change(&entry(&fixtures().join("history"), "002-quiet", Location::Archived)).unwrap().plan_records;
    assert!(quiet.is_empty(), "expected no records, got {quiet:?}");

    let root = temp_root("no_plan_file");
    let dir = root.join("openspec/changes/archive/001-x");
    write(&dir.join("proposal.md"), "---\ntitle: X\n---\n");
    fs::create_dir_all(dir.join(".run/plan.jsonl")).unwrap();
    let unreadable = read_change(&entry(&root, "001-x", Location::Archived)).unwrap().plan_records;
    assert!(unreadable.is_empty(), "expected no records, got {unreadable:?}");
}

/// Proves the manifest notices of each history fixture change.
///
/// Covers: rust-storage/manifest-notices-of-the-history-fixture
#[test]
#[rustfmt::skip]
fn manifest_notices_of_the_history_fixture() {
    let root = fixtures().join("history");
    let notices = |folder: &str, location| read_change(&entry(&root, folder, location)).unwrap().manifest_notices.map(|record| (record.items, record.opened));
    assert_eq!(notices("001-run", Location::Archived), Some((vec![notice("scope-wide", "red"), notice("no-tests", "grey")], Some(vec![String::from("scope-wide")]))));
    assert_eq!(notices("002-quiet", Location::Archived), Some((vec![notice("no-tests", "amber")], None)));
    assert_eq!(notices("003-dropped", Location::Rejected), None);
    assert_eq!(notices("004-noted", Location::Rejected), Some((vec![notice("scope-wide", "grey")], Some(Vec::new()))));
}

/// Proves `read_history` reads archived then rejected changes, in order.
///
/// Covers: rust-storage/history-of-the-history-fixture
#[test]
#[rustfmt::skip]
fn history_of_the_history_fixture() {
    let history = read_history(&fixtures().join("history")).unwrap();
    let rows: Vec<(&str, ChangeStatus)> = history.iter().map(|snapshot| (snapshot.folder.as_str(), snapshot.status)).collect();
    assert_eq!(rows, [("001-run", ChangeStatus::Archived), ("002-quiet", ChangeStatus::Archived), ("003-dropped", ChangeStatus::Rejected), ("004-noted", ChangeStatus::Rejected)]);
}

/// Proves the table events come from the task and change streams, not the
/// validator stream.
///
/// Covers: rust-storage/kept-events-of-the-history-fixture
#[test]
#[rustfmt::skip]
fn table_events_skip_the_validator_stream() {
    let root = temp_root("table_events_streams");
    let dir = root.join("openspec/changes/archive/001-x");
    let focused = "{\"type\":\"focused_ran\",\"timestamp\":\"2026-10-01T10:03:00.000Z\",\"data\":{\"command\":\"c\",\"files\":[],\"scenarios\":[],\"outcome\":\"passed\",\"exitCode\":0,\"duration\":1,\"timedOut\":false,\"output\":\"\"}}\n";
    let validator = "{\"type\":\"validator_ran\",\"timestamp\":\"2026-10-01T10:14:00.000Z\",\"data\":{\"outcome\":\"validated\",\"harness\":\"claude\",\"model\":\"m\",\"duration\":1,\"exitCode\":0,\"scenarios\":0,\"findings\":[],\"restored\":[]}}\n";
    write(&dir.join(".run/events/1.jsonl"), focused);
    write(&dir.join(".run/events/change.jsonl"), validator);
    write(&dir.join(".run/events/validator.jsonl"), validator);
    let rows = table_rows(&entry(&root, "001-x", Location::Archived));
    let expected = [("task 1", "FocusedRan", "2026-10-01T10:03:00.000Z"), ("change", "ValidatorRan", "2026-10-01T10:14:00.000Z")];
    assert_eq!(rows, expected.map(|(stream, kind, at)| (stream.to_owned(), kind.to_owned(), at.to_owned())));
}

/// Proves `read_history` skips active changes and fails on the first change it
/// cannot read.
///
/// Covers: rust-storage/history-of-the-history-fixture
#[test]
#[rustfmt::skip]
fn read_history_edges() {
    let root = temp_root("history_active");
    for folder in ["openspec/changes/001-a", "openspec/changes/archive/002-b", "openspec/changes/rejected/003-c"] {
        write(&root.join(folder).join("proposal.md"), "---\ntitle: X\n---\n");
    }
    let folders: Vec<String> = read_history(&root).unwrap().iter().map(|snapshot| snapshot.folder.clone()).collect();
    assert_eq!(folders, ["002-b", "003-c"]);

    let bad = temp_root("history_bad");
    let first = bad.join("openspec/changes/archive/001-bad");
    write(&first.join("proposal.md"), "---\ntitle: X\n---\n");
    write(&first.join(".run/events/1.jsonl"), "{not json\n");
    write(&bad.join("openspec/changes/rejected/002-good/proposal.md"), "---\ntitle: X\n---\n");
    let error = read_history(&bad).unwrap_err();
    assert!(error.to_string().contains("001-bad/.run/events/1.jsonl:1:"), "error was {error}");
}
