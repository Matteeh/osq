//! Pi's account-limit errors become one `usage_limit` event.

use osq_core::event::{Event, TextData, TokensData, UsageLimitData};
use osq_kernel_harnesses::{PiStreamState, pi_line_events};
use serde_json::{Value, json};

/// Runs one line with a fresh state and returns its events.
fn events(line: &str) -> Vec<Event> {
    let mut state = PiStreamState::default();
    pi_line_events(line, "/work/project", &mut state)
}

/// Builds a `message_end` line from its message fields.
fn message_end(message: &Value) -> String {
    json!({"type": "message_end", "message": message}).to_string()
}

/// Builds the `usage_limit` event for an error message.
fn limit(error: &str) -> Event {
    Event::UsageLimit(UsageLimitData {
        resets_at: None,
        error: Some(error.to_owned()),
    })
}

/// Covers: rust-harnesses/pi-usage-limits
#[test]
fn account_limit_errors_give_usage_limits() {
    let rows = [
        (
            message_end(&json!({
                "role": "assistant",
                "content": [],
                "stopReason": "error",
                "errorMessage": "429 Monthly usage limit reached",
            })),
            vec![limit("429 Monthly usage limit reached")],
        ),
        (
            message_end(&json!({
                "role": "assistant",
                "content": [],
                "stopReason": "error",
                "errorMessage": "Error: INSUFFICIENT_QUOTA",
            })),
            vec![limit("Error: INSUFFICIENT_QUOTA")],
        ),
        (
            message_end(&json!({
                "role": "assistant",
                "content": [{"type": "text", "text": "partial"}],
                "usage": {"input": 1, "output": 2},
                "stopReason": "error",
                "errorMessage": "Out Of Budget this month",
            })),
            vec![
                Event::Text(TextData {
                    text: "partial".to_owned(),
                }),
                Event::Tokens(TokensData {
                    prompt_tokens: 1,
                    candidate_tokens: 2,
                    total_tokens: Some(3),
                    cached_tokens: None,
                    reasoning_tokens: None,
                    cost: None,
                    provider: None,
                    model: None,
                }),
                limit("Out Of Budget this month"),
            ],
        ),
        (
            message_end(&json!({
                "role": "assistant",
                "content": [],
                "stopReason": "error",
                "errorMessage": "402 Insufficient Balance",
            })),
            vec![limit("402 Insufficient Balance")],
        ),
    ];
    for (line, expected) in rows {
        assert_eq!(events(&line), expected, "line: {line}");
    }
}

/// Covers: rust-harnesses/pi-usage-limits
#[test]
fn every_account_limit_text_is_matched() {
    let texts = [
        "GoUsageLimitError",
        "FreeUsageLimitError",
        "Monthly usage limit reached",
        "available balance",
        "insufficient_quota",
        "out of budget",
        "quota exceeded",
        "billing",
        "insufficient balance",
    ];
    for text in texts {
        let line = message_end(&json!({
            "role": "assistant",
            "content": [],
            "stopReason": "error",
            "errorMessage": text,
        }));
        assert_eq!(events(&line), vec![limit(text)], "text: {text}");
    }
}

/// Covers: rust-harnesses/pi-usage-limits
#[test]
fn other_errors_give_no_usage_limit() {
    let rows = [
        message_end(&json!({
            "role": "assistant",
            "content": [],
            "stopReason": "error",
            "errorMessage": "503 overloaded",
        })),
        message_end(&json!({
            "role": "assistant",
            "content": [],
            "stopReason": "stop",
            "errorMessage": "quota exceeded",
        })),
        message_end(&json!({
            "role": "assistant",
            "content": [],
            "stopReason": "error",
        })),
        message_end(&json!({
            "role": "assistant",
            "content": [],
            "stopReason": "error",
            "errorMessage": "",
        })),
        message_end(&json!({
            "role": "assistant",
            "content": [],
            "stopReason": "error",
            "errorMessage": 42,
        })),
        message_end(&json!({
            "role": "user",
            "content": [],
            "stopReason": "error",
            "errorMessage": "billing",
        })),
    ];
    for line in rows {
        assert_eq!(events(&line), Vec::<Event>::new(), "line: {line}");
    }
}
