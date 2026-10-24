//! Proves the `approved` event line reads into its variant and writes back
//! unchanged.

use osq_core::event::ApprovedData;
use osq_core::{Event, EventError, EventKind, event_line, parse_event_line};

/// Proves "Approved event lines", every row: the typed approval event keeps
/// its hash and targets, names its kind, round-trips, and refuses drifted
/// data.
///
/// Covers: rust-core/approved-event-lines
#[test]
fn approved_event_lines() {
    let line = r#"{"type":"approved","timestamp":"2026-10-25T10:00:00.000Z","data":{"hash":"sha256:ab","targets":["change","2"]}}"#;
    let envelope = parse_event_line(line).unwrap_or_else(|error| panic!("{line}: {error}"));
    assert_eq!(envelope.event.kind(), EventKind::Approved);
    assert_eq!(EventKind::Approved.name(), "approved");
    let Event::Approved(data) = &envelope.event else {
        panic!("{line}: wrong variant");
    };
    assert_eq!(data.hash, "sha256:ab");
    assert_eq!(data.targets, vec!["change", "2"]);
    let written: serde_json::Value =
        serde_json::from_str(&event_line(&envelope)).expect("the written line is JSON");
    let original: serde_json::Value =
        serde_json::from_str(line).expect("the original line is JSON");
    assert_eq!(written, original);

    let empty = r#"{"type":"approved","timestamp":"2026-10-25T10:00:00.000Z","data":{"hash":"sha256:ab","targets":[]}}"#;
    let envelope = parse_event_line(empty).unwrap_or_else(|error| panic!("{empty}: {error}"));
    assert_eq!(
        envelope.event,
        Event::Approved(ApprovedData {
            hash: "sha256:ab".to_owned(),
            targets: Vec::new(),
        })
    );

    let refused = [
        r#"{"type":"approved","timestamp":"2026-10-25T10:00:00.000Z","data":{"hash":"sha256:ab"}}"#,
        r#"{"type":"approved","timestamp":"2026-10-25T10:00:00.000Z","data":{"targets":["1"]}}"#,
        r#"{"type":"approved","timestamp":"2026-10-25T10:00:00.000Z","data":{"hash":"sha256:ab","targets":["1"],"extra":1}}"#,
    ];
    for line in refused {
        assert!(
            matches!(
                parse_event_line(line),
                Err(EventError::InvalidData { ref kind }) if kind == "approved"
            ),
            "{line}: not refused as invalid approved data"
        );
    }
}
