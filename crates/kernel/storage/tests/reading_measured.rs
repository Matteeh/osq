//! Proves the measured facts a task stream adds to its outcome.

use std::fs;
use std::path::{Path, PathBuf};

use osq_kernel_storage::{ChangeEntry, ChangeSnapshot, Location, read_change};

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

/// One event line with the given type, timestamp and data.
fn line(kind: &str, timestamp: &str, data: &str) -> String {
    format!("{{\"type\":\"{kind}\",\"timestamp\":\"{timestamp}\",\"data\":{{{data}}}}}\n")
}

/// One `measures` line with the given phase, timestamp and optional resolver.
fn measures(phase: &str, timestamp: &str, resolver: Option<u64>) -> String {
    let resolver = resolver.map_or_else(String::new, |value| format!(",\"scopeResolver\":{value}"));
    line(
        "measures",
        timestamp,
        &format!(
            "\"phase\":\"{phase}\",\"scopeFiles\":1,\"scopeLines\":1,\"repoFiles\":1,\
             \"repoLines\":1,\"importFanIn\":0,\"proposalWords\":1,\"taskWords\":1,\
             \"deltaRequirements\":1,\"deltaScenarios\":1{resolver}"
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

/// Proves each row of the measures table gives its resolver and duration.
///
/// Covers: rust-storage/measured-facts-of-task-streams
#[test]
fn measures_give_the_resolver_and_duration() {
    let cases = [
        (
            "resolver 2 pair",
            format!(
                "{}{}",
                measures("start", "2026-10-01T08:00:00.000Z", Some(2)),
                measures("end", "2026-10-01T08:07:20.000Z", None),
            ),
            Some(2),
            Some(440_000),
        ),
        (
            "legacy pair",
            format!(
                "{}{}",
                measures("start", "2026-10-01T08:00:00.000Z", None),
                measures("end", "2026-10-01T08:01:00.000Z", None),
            ),
            None,
            Some(60_000),
        ),
        (
            "two pairs",
            format!(
                "{}{}{}{}",
                measures("start", "2026-10-01T08:00:00.000Z", Some(3)),
                measures("end", "2026-10-01T08:00:30.000Z", None),
                measures("start", "2026-10-01T08:10:00.000Z", Some(2)),
                measures("end", "2026-10-01T08:10:45.500Z", None),
            ),
            Some(3),
            Some(75_500),
        ),
        (
            "pending start overwritten",
            format!(
                "{}{}{}",
                measures("start", "2026-10-01T08:00:00.000Z", Some(2)),
                measures("start", "2026-10-01T08:05:00.000Z", None),
                measures("end", "2026-10-01T08:06:00.000Z", None),
            ),
            Some(2),
            Some(60_000),
        ),
        (
            "end before start dropped",
            format!(
                "{}{}",
                measures("start", "2026-10-01T08:05:00.000Z", Some(2)),
                measures("end", "2026-10-01T08:04:00.000Z", None),
            ),
            Some(2),
            None,
        ),
        (
            "end without start",
            format!(
                "{}{}",
                measures("end", "2026-10-01T08:04:00.000Z", None),
                measures("start", "2026-10-01T08:05:00.000Z", Some(2)),
            ),
            Some(2),
            None,
        ),
        ("no measures", String::new(), None, None),
    ];
    for (index, (name, events, resolver, measured)) in cases.into_iter().enumerate() {
        let snapshot = snapshot_with(&format!("measured_{index}"), &events);
        let outcome = &snapshot.tasks[0].outcome;
        assert_eq!(
            outcome.start_scope_resolver, resolver,
            "{name} start_scope_resolver"
        );
        assert_eq!(outcome.measured_ms, measured, "{name} measured_ms");
    }
}

/// Proves a task without its own stream gets neither measured fact.
///
/// Covers: rust-storage/task-without-a-stream-has-no-measured-facts
#[test]
fn task_without_a_stream_has_no_measured_facts() {
    let root = temp_root("measured_without_stream");
    let dir = root.join("openspec/changes/archive/001-x");
    write(&dir.join("tasks/1.md"), "---\ntitle: \"One\"\n---\n");
    let snapshot = read_change(&entry(&root, "001-x")).unwrap();
    let outcome = &snapshot.tasks[0].outcome;
    assert_eq!(outcome.start_scope_resolver, None, "start_scope_resolver");
    assert_eq!(outcome.measured_ms, None, "measured_ms");
}
