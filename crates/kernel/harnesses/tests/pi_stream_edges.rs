//! Extra pi stream cases: root forms, path forms, and counts that do not count.

use osq_core::event::{Event, HarnessRetryData, TokensData};
use osq_kernel_harnesses::{PiStreamState, pi_line_events};
use serde_json::{Value, json};

/// Runs one line with a fresh state and returns its events.
fn events(line: &str, root: &str) -> Vec<Event> {
    let mut state = PiStreamState::default();
    pi_line_events(line, root, &mut state)
}

/// Builds a `tool_execution_start` line for a bash command.
fn bash_line(command: &str) -> String {
    json!({
        "type": "tool_execution_start",
        "toolName": "bash",
        "args": {"command": command},
    })
    .to_string()
}

/// Returns the summary of the only `tool` event a line gives.
fn tool_summary(line: &str, root: &str) -> String {
    let mut events = events(line, root);
    assert_eq!(events.len(), 1, "one tool event");
    match events.remove(0) {
        Event::Tool(data) => data.summary,
        other => panic!("expected a tool event, got {other:?}"),
    }
}

/// Runs a start and an end line and returns the `file_changed` path.
fn changed_path(target: &str, root: &str) -> String {
    let start = json!({
        "type": "tool_execution_start",
        "toolCallId": "call_1",
        "toolName": "edit",
        "args": {"path": target},
    })
    .to_string();
    let end = json!({
        "type": "tool_execution_end",
        "toolCallId": "call_1",
        "isError": false,
    })
    .to_string();
    let mut state = PiStreamState::default();
    let _ = pi_line_events(&start, root, &mut state);
    let mut events = pi_line_events(&end, root, &mut state);
    assert_eq!(events.len(), 1, "one file_changed event");
    match events.remove(0) {
        Event::FileChanged(data) => data.path,
        other => panic!("expected a file_changed event, got {other:?}"),
    }
}

/// Returns the only `tokens` event a line gives.
fn tokens(line: &str) -> TokensData {
    let mut events = events(line, "/work/project");
    let mut found: Vec<TokensData> = events
        .drain(..)
        .filter_map(|event| match event {
            Event::Tokens(data) => Some(data),
            _ => None,
        })
        .collect();
    assert_eq!(found.len(), 1, "one tokens event");
    found.remove(0)
}

/// Returns the only `harness_retry` event a line gives.
fn retry(line: &str) -> HarnessRetryData {
    let mut events = events(line, "/work/project");
    let mut found: Vec<HarnessRetryData> = events
        .drain(..)
        .filter_map(|event| match event {
            Event::HarnessRetry(data) => Some(data),
            _ => None,
        })
        .collect();
    assert_eq!(found.len(), 1, "one harness_retry event");
    found.remove(0)
}

/// Covers: rust-harnesses/edge-lines-match-typescript
#[test]
fn roots_that_cannot_be_stripped_leave_summaries_alone() {
    assert_eq!(tool_summary(&bash_line("cat /src"), "/"), "cat /src");
    assert_eq!(tool_summary(&bash_line("cat /src"), ""), "cat /src");
    assert_eq!(tool_summary(&bash_line("cat \\src"), "\\"), "cat \\src");
    assert_eq!(tool_summary(&bash_line("cat //src"), "//"), "cat //src");
}

/// Covers: rust-harnesses/edge-lines-match-typescript
#[test]
fn root_stripping_handles_separators_boundaries_and_trailing_slashes() {
    assert_eq!(
        tool_summary(&bash_line("cat /work/project/src"), "/work/project/"),
        "cat src"
    );
    assert_eq!(
        tool_summary(&bash_line("cat /work/project\\src"), "/work/project"),
        "cat src"
    );
    assert_eq!(
        tool_summary(&bash_line("cat /work/project"), "/work/project"),
        "cat ."
    );
    assert_eq!(
        tool_summary(
            &bash_line("ls /work/project;/work/project,/work/project"),
            "/work/project"
        ),
        "ls .;.,."
    );
    assert_eq!(
        tool_summary(&bash_line("ls \"/work/project\""), "/work/project"),
        "ls \".\""
    );
    assert_eq!(
        tool_summary(&bash_line("cat C:\\work\\src"), "C:\\work"),
        "cat src"
    );
    assert_eq!(
        tool_summary(&bash_line("cat /work/project2/src"), "/work/project"),
        "cat /work/project2/src"
    );
    assert_eq!(tool_summary(&bash_line(""), "/work/project"), "");
}

/// Covers: rust-harnesses/edge-lines-match-typescript
#[test]
fn empty_tool_fields_fall_back() {
    let grep = json!({
        "type": "tool_execution_start",
        "toolName": "grep",
        "args": {"pattern": "", "path": "src"},
    })
    .to_string();
    assert_eq!(tool_summary(&grep, "/work/project"), "src");

    let unnamed = json!({
        "type": "tool_execution_start",
        "toolName": "",
        "args": {"command": "true"},
    })
    .to_string();
    let mut events = events(&unnamed, "/work/project");
    assert_eq!(events.len(), 1);
    match events.remove(0) {
        Event::Tool(data) => assert_eq!(data.tool, "tool"),
        other => panic!("expected a tool event, got {other:?}"),
    }

    let non_object = json!({
        "type": "tool_execution_start",
        "toolName": "todo",
        "args": [1, 2],
    })
    .to_string();
    assert_eq!(tool_summary(&non_object, "/work/project"), "{}");
}

/// Covers: rust-harnesses/edge-lines-match-typescript
#[test]
fn empty_remembered_paths_are_not_changes() {
    let start = json!({
        "type": "tool_execution_start",
        "toolCallId": "call_empty",
        "toolName": "write",
        "args": {"path": ""},
    })
    .to_string();
    let end = json!({
        "type": "tool_execution_end",
        "toolCallId": "call_empty",
        "isError": false,
    })
    .to_string();
    let mut state = PiStreamState::default();
    let _ = pi_line_events(&start, "/work/project", &mut state);
    assert_eq!(
        pi_line_events(&end, "/work/project", &mut state),
        Vec::<Event>::new()
    );
}

/// Covers: rust-harnesses/edge-lines-match-typescript
#[test]
fn remembered_calls_win_over_the_end_line() {
    let start = json!({
        "type": "tool_execution_start",
        "toolCallId": "call_remembered",
        "toolName": "edit",
        "args": {"path": "/work/project/remembered.txt"},
    })
    .to_string();
    let end = json!({
        "type": "tool_execution_end",
        "toolCallId": "call_remembered",
        "toolName": "bash",
        "args": {"path": "ignored.txt"},
        "isError": false,
    })
    .to_string();
    let mut state = PiStreamState::default();
    let _ = pi_line_events(&start, "/work/project", &mut state);
    let mut events = pi_line_events(&end, "/work/project", &mut state);
    assert_eq!(events.len(), 1);
    match events.remove(0) {
        Event::FileChanged(data) => assert_eq!(data.path, "remembered.txt"),
        other => panic!("expected a file_changed event, got {other:?}"),
    }
}

/// Covers: rust-harnesses/edge-lines-match-typescript
#[test]
fn other_is_error_values_give_no_change() {
    let line = json!({
        "type": "tool_execution_end",
        "toolName": "edit",
        "args": {"path": "a.txt"},
        "isError": "false",
    })
    .to_string();
    assert_eq!(events(&line, "/work/project"), Vec::<Event>::new());
}

/// Covers: rust-harnesses/edge-lines-match-typescript
#[test]
fn file_paths_follow_node_relative() {
    assert_eq!(
        changed_path("/work/project/src/main.rs", "/work/project"),
        "src/main.rs"
    );
    assert_eq!(
        changed_path("/work/other/notes.md", "/work/project"),
        "../other/notes.md"
    );
    assert_eq!(
        changed_path("/work/project2/x", "/work/project"),
        "../project2/x"
    );
    assert_eq!(
        changed_path("./src/lib.rs", "/work/project"),
        "./src/lib.rs"
    );
    assert_eq!(changed_path("../x", "/work/project"), "../x");
    assert_eq!(changed_path("/work/project", "/work/project"), "");
    assert_eq!(
        changed_path("/work/project/src/../lib.rs", "/work/project"),
        "lib.rs"
    );
    assert_eq!(
        changed_path("/work/project/./src//main.rs", "/work/project/"),
        "src/main.rs"
    );
    assert_eq!(
        changed_path("/work/./project/src/main.rs", "/work/project"),
        "src/main.rs"
    );
    assert_eq!(
        changed_path("/work/project/src/main.rs", "/"),
        "work/project/src/main.rs"
    );
}

/// Covers: rust-harnesses/counts-that-are-not-whole-numbers
#[test]
fn bad_counts_fall_back_or_disappear() {
    let whole = r#"{"type":"message_end","message":{"role":"assistant","usage":{"input":3.0,"output":1e2,"totalTokens":3.0}}}"#;
    let data = tokens(whole);
    assert_eq!(data.prompt_tokens, 3);
    assert_eq!(data.candidate_tokens, 100);
    assert_eq!(data.total_tokens, Some(3));

    let line = json!({
        "type": "message_end",
        "message": {
            "role": "assistant",
            "usage": {
                "input": 1,
                "output": 2,
                "totalTokens": 1.5,
                "cacheRead": -1,
                "reasoning": 2.5,
            },
        },
    })
    .to_string();
    let data = tokens(&line);
    assert_eq!(data.prompt_tokens, 1);
    assert_eq!(data.candidate_tokens, 2);
    assert_eq!(data.total_tokens, Some(3));
    assert_eq!(data.cached_tokens, None);
    assert_eq!(data.reasoning_tokens, None);

    let empty = json!({
        "type": "message_end",
        "message": {"role": "assistant", "usage": {}},
    })
    .to_string();
    let data = tokens(&empty);
    assert_eq!(data.prompt_tokens, 0);
    assert_eq!(data.candidate_tokens, 0);
    assert_eq!(data.total_tokens, Some(0));
}

/// Covers: rust-harnesses/counts-that-are-not-whole-numbers
#[test]
fn retry_counts_that_are_not_whole_numbers_are_absent() {
    let line = json!({
        "type": "auto_retry_end",
        "attempt": -1,
        "maxAttempts": 1.5,
        "delayMs": 3,
        "success": "yes",
        "errorMessage": "",
        "finalError": "last",
    })
    .to_string();
    let data = retry(&line);
    assert_eq!(data.phase, "end");
    assert_eq!(data.attempt, 0);
    assert_eq!(data.max_attempts, None);
    assert_eq!(data.delay_ms, Some(3));
    assert_eq!(data.success, None);
    assert_eq!(data.error.as_deref(), Some("last"));

    let first = json!({
        "type": "auto_retry_start",
        "attempt": 2.5,
        "errorMessage": "first",
        "finalError": "second",
        "error": "third",
    })
    .to_string();
    let data = retry(&first);
    assert_eq!(data.phase, "start");
    assert_eq!(data.attempt, 0);
    assert_eq!(data.error.as_deref(), Some("first"));

    let whole = json!({
        "type": "auto_retry_start",
        "attempt": 2.0,
        "maxAttempts": 3.0,
        "delayMs": 0.0,
    })
    .to_string();
    let data = retry(&whole);
    assert_eq!(data.attempt, 2);
    assert_eq!(data.max_attempts, Some(3));
    assert_eq!(data.delay_ms, Some(0));

    let empty = json!({
        "type": "auto_retry_end",
        "errorMessage": "",
        "finalError": "",
        "error": "",
    })
    .to_string();
    let data = retry(&empty);
    assert_eq!(data.error, None);
}

/// Covers: rust-harnesses/edge-lines-match-typescript
#[test]
fn empty_provider_and_model_are_absent() {
    let line: Value = json!({
        "type": "message_end",
        "message": {
            "role": "assistant",
            "usage": {"input": 1, "output": 2},
            "provider": "",
            "model": "",
        },
    });
    let data = tokens(&line.to_string());
    assert_eq!(data.provider, None);
    assert_eq!(data.model, None);
}
