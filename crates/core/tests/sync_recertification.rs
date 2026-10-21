//! Proves TypeScript's sync recertification line, which has no output,
//! round-trips through the typed events.

use osq_core::event::{Event, RecertificationOutcome};
use osq_core::{event_line, parse_event_line};

/// The recertification line TypeScript's sync wrote, with no `output` key.
const SYNC_LINE: &str = r#"{"type":"recertification","timestamp":"2026-10-21T13:15:02.371Z","data":{"task":"2","outcome":"passed","differingPaths":["Cargo.lock (modified)"],"attribution":[{"path":"Cargo.lock (modified)","attribution":"sync"}],"command":"cargo test -p osq-kernel-harnesses","exitCode":0,"timedOut":false,"recordedHash":"sha256:b7","currentHash":"sha256:3d","automatic":true}}"#;

/// Covers: rust-core/sync-recertification-without-output
#[test]
fn sync_recertification_without_output() {
    let envelope = parse_event_line(SYNC_LINE).expect("the sync line parses");
    let Event::Recertification(data) = &envelope.event else {
        panic!("expected a recertification event, got {:?}", envelope.event);
    };
    assert_eq!(data.outcome, RecertificationOutcome::Passed);
    assert_eq!(data.output, None);
    assert_eq!(data.automatic, Some(true));

    let written = event_line(&envelope);
    let original: serde_json::Value = serde_json::from_str(SYNC_LINE).expect("the line is JSON");
    let round: serde_json::Value =
        serde_json::from_str(&written).expect("the written line is JSON");
    assert_eq!(round, original);
    assert!(
        round["data"].get("output").is_none(),
        "the written line has no output key"
    );
}
