//! Proves the active sync's uncommitted stopped event.

use std::fs;
use std::path::Path;

use osq_core::event::SyncStopReason;
use osq_kernel_sync::{SyncStop, append_sync_stopped};
use serde_json::{Value, json};

/// Whether `text` is UTC in the form `YYYY-MM-DDTHH:MM:SS.mmmZ`.
fn is_utc_millis(text: &str) -> bool {
    let bytes = text.as_bytes();
    bytes.len() == 24
        && bytes[4] == b'-'
        && bytes[7] == b'-'
        && bytes[10] == b'T'
        && bytes[13] == b':'
        && bytes[16] == b':'
        && bytes[19] == b'.'
        && bytes[23] == b'Z'
        && [0, 1, 2, 3, 5, 6, 8, 9, 11, 12, 14, 15, 17, 18, 20, 21, 22]
            .iter()
            .all(|index| bytes[*index].is_ascii_digit())
}

/// Proves the stopped event's line, data and timestamp.
///
/// Covers: rust-sync/stopped-event-appended
#[test]
fn stopped_event_is_appended_uncommitted() {
    let folder = Path::new(env!("CARGO_TARGET_TMPDIR"))
        .join("sync_kernel")
        .join("stopped-event");
    let _ = fs::remove_dir_all(&folder);
    fs::create_dir_all(&folder).expect("the scratch folder is created");
    let stop = SyncStop {
        reason: SyncStopReason::SyncConflict,
        message: "m".to_owned(),
        conflicts: vec!["a".to_owned()],
    };

    append_sync_stopped(&folder, &stop, "main");

    let text = fs::read_to_string(folder.join(".run/events/change.jsonl"))
        .expect("the change stream is written");
    assert_eq!(text.lines().count(), 1, "{text}");
    let event: Value = serde_json::from_str(text.trim_end()).expect("the line is JSON");
    assert_eq!(event["type"], "sync_stopped");
    assert_eq!(
        event["data"],
        json!({"reason": "sync_conflict", "message": "m", "defaultBranch": "main"})
    );
    let timestamp = event["timestamp"].as_str().expect("the timestamp is text");
    assert!(is_utc_millis(timestamp), "{timestamp}");
}
