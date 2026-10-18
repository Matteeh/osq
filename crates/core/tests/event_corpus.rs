//! Round-trips every event line under `openspec/changes/archive/`.

use std::fs;
use std::path::{Path, PathBuf};

use osq_core::{event_line, parse_event_line};

/// Proves every archived event line parses and writes back the same value.
///
/// Covers: rust-core/archived-event-logs-round-trip
#[ignore = "corpus test: reads every archived event line"]
#[test]
fn archived_event_logs_round_trip() {
    let archive = Path::new(env!("CARGO_MANIFEST_DIR")).join("../../openspec/changes/archive");
    let mut files = Vec::new();
    collect_event_files(&archive, &mut files);
    files.sort();
    assert!(
        !files.is_empty(),
        "no event files under {}",
        archive.display()
    );
    for file in &files {
        round_trip_file(file);
    }
}

/// Collects every `.run/events/*.jsonl` file under a directory.
fn collect_event_files(dir: &Path, out: &mut Vec<PathBuf>) {
    let Ok(entries) = fs::read_dir(dir) else {
        return;
    };
    for entry in entries.flatten() {
        let path = entry.path();
        if path.is_dir() {
            collect_event_files(&path, out);
        } else if is_event_file(&path) {
            out.push(path);
        }
    }
}

/// Whether a path is an events-file `.jsonl`.
fn is_event_file(path: &Path) -> bool {
    let is_jsonl = path
        .extension()
        .is_some_and(|extension| extension == "jsonl");
    let in_events = path
        .parent()
        .and_then(Path::file_name)
        .is_some_and(|name| name == "events");
    is_jsonl && in_events
}

/// Parses and rewrites every line of one event file.
fn round_trip_file(path: &Path) {
    let text =
        fs::read_to_string(path).unwrap_or_else(|error| panic!("{}: {error}", path.display()));
    for (index, raw) in text.lines().enumerate() {
        let line = raw.trim();
        if line.is_empty() {
            continue;
        }
        let envelope = parse_event_line(line)
            .unwrap_or_else(|error| panic!("{}:{}: {error}", path.display(), index + 1));
        let written = event_line(&envelope);
        let original: serde_json::Value = serde_json::from_str(line)
            .unwrap_or_else(|error| panic!("{}:{}: {error}", path.display(), index + 1));
        let round: serde_json::Value = serde_json::from_str(&written)
            .unwrap_or_else(|error| panic!("{}:{}: {error}", path.display(), index + 1));
        assert_eq!(round, original, "{}:{}", path.display(), index + 1);
    }
}
