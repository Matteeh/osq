//! Reading a task's retry context from its event lines and retained dead marker.
//!
//! Mirrors TypeScript's `readRetryContext`: the latest `retry` or requeued
//! `recertification` line wins, and a retry's output is the body of the dead
//! marker it kept.
//!
//! Implements: rust-storage/retry-context

use std::fs;
use std::path::Path;

use serde_json::{Map, Value};

use super::text::markdown_body;

/// The attempt, failure reason and failure output carried into a task's run.
#[derive(Clone, Debug, PartialEq, Eq)]
pub struct RetryContext {
    /// The target-wide execution attempt; a first execution is 1.
    pub attempt: u64,
    /// The failure reason of the latest retry or requeued recertification.
    pub reason: Option<String>,
    /// The failure output the latest retry or requeued recertification kept.
    pub output: Option<String>,
}

/// Reads the retry context of `task` in the change `folder`.
///
/// A missing event file gives the first attempt with no reason and no output.
///
/// Implements: rust-storage/retry-context
#[must_use]
pub fn read_retry_context(folder: &Path, task: &str) -> RetryContext {
    let path = folder
        .join(".run")
        .join("events")
        .join(format!("{task}.jsonl"));
    let file_text = fs::read_to_string(path).unwrap_or_default();
    let mut context = RetryContext {
        attempt: 1,
        reason: None,
        output: None,
    };
    for line in file_text.split('\n') {
        if line.trim().is_empty() {
            continue;
        }
        let Ok(value) = serde_json::from_str::<Value>(line) else {
            continue;
        };
        let Some(event) = value.as_object() else {
            continue;
        };
        match event.get("type").and_then(Value::as_str) {
            Some("retry") => {
                let data = event.get("data").and_then(Value::as_object);
                take_attempt(&mut context, data);
                take_reason(&mut context, data);
                context.output = retained_marker_body(folder, task, context.attempt);
            }
            Some("recertification") => {
                let Some(data) = event.get("data").and_then(Value::as_object) else {
                    continue;
                };
                if data.get("outcome").and_then(Value::as_str) != Some("requeued") {
                    continue;
                }
                take_attempt(&mut context, Some(data));
                take_reason(&mut context, Some(data));
                if let Some(output) = data.get("output").and_then(Value::as_str) {
                    context.output = Some(output.to_owned());
                }
            }
            _ => {}
        }
    }
    context.reason = context.reason.filter(|reason| !reason.is_empty());
    context.output = context.output.filter(|output| !output.is_empty());
    context
}

/// Takes a whole-number `attempt` from an event's data when it fits `u64`.
fn take_attempt(context: &mut RetryContext, data: Option<&Map<String, Value>>) {
    if let Some(attempt) = data
        .and_then(|data| data.get("attempt"))
        .and_then(Value::as_u64)
    {
        context.attempt = attempt;
    }
}

/// Takes a non-empty string `reason` from an event's data.
fn take_reason(context: &mut RetryContext, data: Option<&Map<String, Value>>) {
    if let Some(reason) = data
        .and_then(|data| data.get("reason"))
        .and_then(Value::as_str)
        .filter(|reason| !reason.is_empty())
    {
        context.reason = Some(reason.to_owned());
    }
}

/// The stripped body of the dead marker a retry kept, or none without one.
fn retained_marker_body(folder: &Path, task: &str, attempt: u64) -> Option<String> {
    let path = folder
        .join(".run")
        .join("dead")
        .join(format!("{task}.{}.md", attempt.saturating_sub(1)));
    let content = fs::read_to_string(path).ok()?;
    Some(strip_ansi(markdown_body(&content)))
}

/// One state of the single pass that removes ANSI escape sequences.
#[derive(Clone, Copy, PartialEq, Eq)]
enum AnsiState {
    /// Outside any escape sequence.
    Normal,
    /// After an escape byte, before its kind is known.
    Escape,
    /// Inside a CSI sequence's parameter bytes.
    CsiParam,
    /// Inside a CSI sequence's intermediate bytes.
    CsiIntermediate,
    /// Inside an OSC sequence's content.
    Osc,
    /// Inside an OSC sequence after a content escape byte.
    OscEscape,
}

/// Removes every CSI and OSC escape sequence from terminal text.
fn strip_ansi(text: &str) -> String {
    let mut kept = Vec::with_capacity(text.len());
    let mut pending = Vec::new();
    let mut state = AnsiState::Normal;
    for &byte in text.as_bytes() {
        state = match state {
            AnsiState::Normal => start(byte, &mut kept, &mut pending),
            AnsiState::Escape => match byte {
                b'[' => {
                    pending.push(byte);
                    AnsiState::CsiParam
                }
                b']' => {
                    pending.push(byte);
                    AnsiState::Osc
                }
                _ => restart(byte, &mut kept, &mut pending),
            },
            AnsiState::CsiParam => {
                if matches!(byte, b'0'..=b'9' | b';' | b'?') {
                    pending.push(byte);
                    AnsiState::CsiParam
                } else if (b' '..=b'/').contains(&byte) {
                    pending.push(byte);
                    AnsiState::CsiIntermediate
                } else if (b'@'..=b'~').contains(&byte) {
                    pending.clear();
                    AnsiState::Normal
                } else {
                    restart(byte, &mut kept, &mut pending)
                }
            }
            AnsiState::CsiIntermediate => {
                if (b' '..=b'/').contains(&byte) {
                    pending.push(byte);
                    AnsiState::CsiIntermediate
                } else if (b'@'..=b'~').contains(&byte) {
                    pending.clear();
                    AnsiState::Normal
                } else {
                    restart(byte, &mut kept, &mut pending)
                }
            }
            AnsiState::Osc => match byte {
                BEL => {
                    pending.clear();
                    AnsiState::Normal
                }
                ESC => {
                    pending.push(byte);
                    AnsiState::OscEscape
                }
                _ => {
                    pending.push(byte);
                    AnsiState::Osc
                }
            },
            AnsiState::OscEscape => match byte {
                b'\\' | BEL => {
                    pending.clear();
                    AnsiState::Normal
                }
                ESC => {
                    pending.push(byte);
                    AnsiState::OscEscape
                }
                _ => {
                    pending.push(byte);
                    AnsiState::Osc
                }
            },
        };
    }
    flush(&mut kept, &mut pending);
    String::from_utf8(kept).expect("stripping ASCII escapes keeps UTF-8")
}

/// Starts a normal byte, or a new escape sequence when it is the escape byte.
fn start(byte: u8, kept: &mut Vec<u8>, pending: &mut Vec<u8>) -> AnsiState {
    if byte == ESC {
        pending.clear();
        pending.push(byte);
        AnsiState::Escape
    } else {
        kept.push(byte);
        AnsiState::Normal
    }
}

/// Keeps an invalid sequence's bytes, then starts the byte that broke it.
fn restart(byte: u8, kept: &mut Vec<u8>, pending: &mut Vec<u8>) -> AnsiState {
    flush(kept, pending);
    start(byte, kept, pending)
}

/// Appends an unfinished sequence's bytes to the kept text.
fn flush(kept: &mut Vec<u8>, pending: &mut Vec<u8>) {
    kept.append(pending);
}

/// The escape byte that starts every ANSI sequence.
const ESC: u8 = 0x1B;
/// The bell byte that ends an OSC sequence.
const BEL: u8 = 0x07;
