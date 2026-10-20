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
    let mut files = archived_event_files(&archive);
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

/// Collects the `.run/events/*.jsonl` files of each change folder under `archive`.
fn archived_event_files(archive: &Path) -> Vec<PathBuf> {
    let Ok(entries) = fs::read_dir(archive) else {
        return Vec::new();
    };
    let mut files = Vec::new();
    for entry in entries.flatten() {
        let folder = entry.path();
        if !folder.is_dir() {
            continue;
        }
        let events = folder.join(".run").join("events");
        let Ok(event_entries) = fs::read_dir(events) else {
            continue;
        };
        for event in event_entries.flatten() {
            let path = event.path();
            if path.is_file()
                && path
                    .extension()
                    .is_some_and(|extension| extension == "jsonl")
            {
                files.push(path);
            }
        }
    }
    files
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
