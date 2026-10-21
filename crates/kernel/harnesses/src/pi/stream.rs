//! Translating one pi stdout line into the core events it implies.

use osq_core::event::{Event, FileChangedData, HarnessRetryData, TextData, TokensData, ToolData};
use serde_json::{Map, Value};

use super::{PiStreamState, ToolCall, path, summary};

/// Turns one stdout line into the events TypeScript writes for it.
pub(super) fn events(line: &str, project_root: &str, state: &mut PiStreamState) -> Vec<Event> {
    let trimmed = line.trim();
    if trimmed.is_empty() {
        return Vec::new();
    }
    let Ok(Value::Object(event)) = serde_json::from_str::<Value>(trimmed) else {
        return Vec::new();
    };
    let Some(kind) = text_field(&event, "type") else {
        return Vec::new();
    };
    match kind {
        "tool_execution_start" => tool_start(&event, project_root, state),
        "tool_execution_end" => tool_end(&event, project_root, state),
        "message_end" => message_end(&event),
        "auto_retry_start" => vec![retry(&event, "start")],
        "auto_retry_end" => vec![retry(&event, "end")],
        "agent_settled" => {
            state.settled = true;
            Vec::new()
        }
        _ => Vec::new(),
    }
}

/// Builds the `tool` event for a `tool_execution_start` line.
fn tool_start(
    event: &Map<String, Value>,
    project_root: &str,
    state: &mut PiStreamState,
) -> Vec<Event> {
    let tool = text_field(event, "toolName").unwrap_or("tool");
    let args = object_field(event, "args");
    let raw = summary::tool_summary(tool, args);
    let summary = summary::relativize(&raw, project_root);
    if let Some(call_id) = text_field(event, "toolCallId") {
        let path = args
            .and_then(|args| text_field(args, "path"))
            .map(str::to_owned);
        state.tool_calls.insert(
            call_id.to_owned(),
            ToolCall {
                tool: tool.to_owned(),
                path,
            },
        );
    }
    vec![Event::Tool(ToolData {
        tool: tool.to_owned(),
        summary,
    })]
}

/// Builds the `file_changed` event for a successful edit or write.
fn tool_end(event: &Map<String, Value>, project_root: &str, state: &PiStreamState) -> Vec<Event> {
    if event.get("isError") != Some(&Value::Bool(false)) {
        return Vec::new();
    }
    let call = text_field(event, "toolCallId").and_then(|id| state.tool_calls.get(id));
    let tool = if let Some(call) = call {
        call.tool.as_str()
    } else {
        text_field(event, "toolName").unwrap_or("")
    };
    if tool != "edit" && tool != "write" {
        return Vec::new();
    }
    let path = call
        .and_then(|call| call.path.as_deref())
        .or_else(|| object_field(event, "args").and_then(|args| text_field(args, "path")));
    let Some(path) = path else {
        return Vec::new();
    };
    vec![Event::FileChanged(FileChangedData {
        path: path::project_relative(path, project_root),
    })]
}

/// Builds the `text` and `tokens` events for an assistant message.
fn message_end(event: &Map<String, Value>) -> Vec<Event> {
    let Some(message) = object_field(event, "message") else {
        return Vec::new();
    };
    if text_field(message, "role") != Some("assistant") {
        return Vec::new();
    }
    let mut events = Vec::new();
    if let Some(text) = assistant_text(message) {
        events.push(Event::Text(TextData { text }));
    }
    if let Some(data) = tokens(message) {
        events.push(Event::Tokens(data));
    }
    events
}

/// Joins the non-empty text parts of an assistant message.
fn assistant_text(message: &Map<String, Value>) -> Option<String> {
    let parts = message.get("content")?.as_array()?;
    let texts: Vec<&str> = parts
        .iter()
        .filter_map(Value::as_object)
        .filter(|part| text_field(part, "type") == Some("text"))
        .filter_map(|part| text_field(part, "text"))
        .collect();
    if texts.is_empty() {
        None
    } else {
        Some(texts.join("\n"))
    }
}

/// Builds the `tokens` event for an assistant message's usage.
fn tokens(message: &Map<String, Value>) -> Option<TokensData> {
    let usage = object_field(message, "usage")?;
    let prompt_tokens = count_field(usage, "input").unwrap_or(0);
    let candidate_tokens = count_field(usage, "output").unwrap_or(0);
    let total_tokens =
        count_field(usage, "totalTokens").unwrap_or(prompt_tokens + candidate_tokens);
    Some(TokensData {
        prompt_tokens,
        candidate_tokens,
        total_tokens: Some(total_tokens),
        cached_tokens: count_field(usage, "cacheRead"),
        reasoning_tokens: count_field(usage, "reasoning"),
        cost: cost(usage),
        provider: text_field(message, "provider").map(str::to_owned),
        model: text_field(message, "model").map(str::to_owned),
    })
}

/// Reads the total cost from usage as written, when it is a number.
fn cost(usage: &Map<String, Value>) -> Option<serde_json::Number> {
    object_field(usage, "cost")?
        .get("total")?
        .as_number()
        .cloned()
}

/// Builds the `harness_retry` event for an auto-retry line.
fn retry(event: &Map<String, Value>, phase: &str) -> Event {
    let error = text_field(event, "errorMessage")
        .or_else(|| text_field(event, "finalError"))
        .or_else(|| text_field(event, "error"))
        .map(str::to_owned);
    Event::HarnessRetry(HarnessRetryData {
        phase: phase.to_owned(),
        attempt: count_field(event, "attempt").unwrap_or(0),
        max_attempts: count_field(event, "maxAttempts"),
        delay_ms: count_field(event, "delayMs"),
        success: event.get("success").and_then(Value::as_bool),
        error,
    })
}

/// Reads a non-empty string field from a JSON object.
fn text_field<'a>(object: &'a Map<String, Value>, key: &str) -> Option<&'a str> {
    object
        .get(key)
        .and_then(Value::as_str)
        .filter(|text| !text.is_empty())
}

/// Reads an object field from a JSON object.
fn object_field<'a>(object: &'a Map<String, Value>, key: &str) -> Option<&'a Map<String, Value>> {
    object.get(key).and_then(Value::as_object)
}

/// Reads a whole non-negative number field, ignoring any other value.
fn count_field(object: &Map<String, Value>, key: &str) -> Option<u64> {
    let value = object.get(key)?;
    if let Some(count) = value.as_u64() {
        return Some(count);
    }
    let number = value.as_f64()?;
    if number.fract() != 0.0 {
        return None;
    }
    number.to_string().parse::<u64>().ok()
}
