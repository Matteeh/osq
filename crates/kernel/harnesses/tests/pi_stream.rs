//! Pi stream tests: the captured run and edge lines against TypeScript's goldens.

use osq_core::event::{Envelope, Event, TokensData, event_line};
use osq_kernel_harnesses::{PiStreamState, pi_line_events};
use serde_json::{Value, json};

/// Compares every event from one fixture with its golden entries.
fn assert_golden(lines: &str, golden: &str) {
    let expected: Vec<Value> = serde_json::from_str(golden).expect("golden is JSON");
    let mut state = PiStreamState::default();
    let actual = collect(lines, &mut state);
    assert_entries(&actual, &expected);
}

/// Collects the fixture's events as `{ line, type, data }` values.
fn collect(lines: &str, state: &mut PiStreamState) -> Vec<Value> {
    let mut entries = Vec::new();
    for (index, line) in lines.lines().enumerate() {
        let number = index + 1;
        for event in pi_line_events(line, "/work/project", state) {
            entries.push(entry(number, event));
        }
    }
    entries
}

/// Turns one event into the golden entry shape, without a timestamp.
fn entry(line: usize, event: Event) -> Value {
    let envelope = Envelope {
        timestamp: "ignored".to_owned(),
        event,
    };
    let mut value: Value = serde_json::from_str(&event_line(&envelope)).expect("event is JSON");
    let object = value.as_object_mut().expect("event is an object");
    object.remove("timestamp");
    object.insert("line".to_owned(), json!(line));
    value
}

/// Compares actual and golden entries, naming the first difference.
fn assert_entries(actual: &[Value], expected: &[Value]) {
    for (index, (got, want)) in actual.iter().zip(expected).enumerate() {
        assert_eq!(got, want, "entry {index} differs");
    }
    assert_eq!(actual.len(), expected.len(), "event count differs");
}

/// Returns the only `tokens` event a line gives.
fn tokens(line: &str) -> TokensData {
    let mut state = PiStreamState::default();
    let mut found: Vec<TokensData> = pi_line_events(line, "/work/project", &mut state)
        .drain(..)
        .filter_map(|event| match event {
            Event::Tokens(data) => Some(data),
            _ => None,
        })
        .collect();
    assert_eq!(found.len(), 1, "one tokens event");
    found.remove(0)
}

/// Covers: rust-harnesses/captured-pi-run-matches-typescript
#[test]
fn captured_pi_run_matches_typescript() {
    let fixture = include_str!("fixtures/pi/pi-run.jsonl");
    let golden = include_str!("golden/pi-run-events.json");
    let expected: Vec<Value> = serde_json::from_str(golden).expect("golden is JSON");
    let mut state = PiStreamState::default();
    let lines: Vec<&str> = fixture.lines().collect();
    let mut entries = Vec::new();
    for (index, line) in lines.iter().enumerate() {
        if index + 1 < lines.len() {
            assert!(!state.settled(), "settled before line {}", index + 1);
        }
        for event in pi_line_events(line, "/work/project", &mut state) {
            entries.push(entry(index + 1, event));
        }
    }
    assert!(state.settled(), "not settled after the last line");
    assert_entries(&entries, &expected);
}

/// Covers: rust-harnesses/edge-lines-match-typescript
#[test]
fn edge_lines_match_typescript() {
    let fixture = include_str!("fixtures/pi/pi-edges.jsonl");
    let golden = include_str!("golden/pi-edges-events.json");
    assert_golden(fixture, golden);
}

/// Covers: rust-harnesses/counts-that-are-not-whole-numbers
#[test]
fn counts_that_are_not_whole_numbers() {
    let line = r#"{"type":"message_end","message":{"role":"assistant","usage":{"input":1.5,"output":-2,"totalTokens":3}}}"#;
    let data = tokens(line);
    assert_eq!(data.prompt_tokens, 0);
    assert_eq!(data.candidate_tokens, 0);
    assert_eq!(data.total_tokens, Some(3));
    assert_eq!(data.cached_tokens, None);
    assert_eq!(data.reasoning_tokens, None);
    assert_eq!(data.cost, None);
    assert_eq!(data.provider, None);
    assert_eq!(data.model, None);
}
