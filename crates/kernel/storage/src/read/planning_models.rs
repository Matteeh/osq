//! The models of a change folder's planning sessions that recorded tokens.
//!
//! Implements: rust-storage/planning-token-models

use std::collections::{BTreeMap, BTreeSet};
use std::fs;
use std::path::Path;

use serde_json::{Map, Value};

/// The models of the planning sessions that recorded tokens, each once.
///
/// Implements: rust-storage/planning-token-models
#[must_use]
pub fn planning_token_models(folder: &Path) -> Vec<String> {
    let Ok(text) = fs::read_to_string(folder.join(".run").join("plan.jsonl")) else {
        return Vec::new();
    };
    let mut sessions: BTreeMap<String, Session> = BTreeMap::new();
    for line in text.lines().filter(|line| !line.trim().is_empty()) {
        let Some(record) = record(line) else {
            continue;
        };
        let session = sessions.entry(record.session).or_default();
        match record.outcome {
            Outcome::Started(model) => {
                if !session.started {
                    session.started = true;
                    session.model = model;
                }
            }
            Outcome::Exited(recorded) => {
                if session.exit.is_none() {
                    session.exit = Some(recorded);
                }
            }
        }
    }
    let mut models = BTreeSet::new();
    for session in sessions.values() {
        if !session.started || session.exit != Some(true) {
            continue;
        }
        if let Some(model) = &session.model {
            models.insert(model.as_str());
        }
    }
    models.into_iter().map(ToOwned::to_owned).collect()
}

/// One correlated planning session's first start and first exit.
#[derive(Default)]
struct Session {
    /// Whether the first start was read.
    started: bool,
    /// The first start's model, absent when it named none.
    model: Option<String>,
    /// Whether the first exit recorded tokens, absent before an exit.
    exit: Option<bool>,
}

/// One parsed `plan_started` or `plan_exited` record.
struct Record {
    /// The record's session id.
    session: String,
    /// The record's kind and what it means for its session.
    outcome: Outcome,
}

/// What one parsed record says about its session.
enum Outcome {
    /// A start, holding its model when the record names one.
    Started(Option<String>),
    /// An exit, holding whether it recorded tokens.
    Exited(bool),
}

/// One line as a record, or `None` when it is not a start or exit record.
fn record(line: &str) -> Option<Record> {
    let value: Value = serde_json::from_str(line).ok()?;
    let object = value.as_object()?;
    let kind = object.get("type")?.as_str()?;
    let session = non_empty_text(object.get("sessionId"))?;
    non_empty_text(object.get("timestamp"))?;
    let data = object.get("data")?.as_object()?;
    let outcome = match kind {
        "plan_started" => {
            Outcome::Started(non_empty_text(data.get("model")).map(ToOwned::to_owned))
        }
        "plan_exited" => Outcome::Exited(exited_tokens(data)),
        _ => return None,
    };
    Some(Record {
        session: session.to_owned(),
        outcome,
    })
}

/// Whether an exit's usage or slice recorded a token count.
fn exited_tokens(data: &Map<String, Value>) -> bool {
    let usage_tokens = data
        .get("usage")
        .and_then(Value::as_object)
        .is_some_and(|usage| {
            finite_non_negative(usage.get("inputTokens"))
                || finite_non_negative(usage.get("outputTokens"))
        });
    usage_tokens || data.get("slice").is_some_and(slice_tokens)
}

/// Whether a slice is valid and recorded an input or output token count.
fn slice_tokens(value: &Value) -> bool {
    let Some(slice) = value.as_object() else {
        return false;
    };
    if !valid_slice(slice) {
        return false;
    }
    let Some(tokens) = slice.get("tokens").and_then(Value::as_object) else {
        return false;
    };
    finite_non_negative(tokens.get("input")) || finite_non_negative(tokens.get("output"))
}

/// Whether a slice has every field `parsePlanningSlice` requires.
fn valid_slice(slice: &Map<String, Value>) -> bool {
    non_empty_text(slice.get("start")).is_some()
        && non_empty_text(slice.get("end")).is_some()
        && non_empty_text(slice.get("approvedAt")).is_some()
        && finite_non_negative(slice.get("turns"))
        && finite_non_negative(slice.get("activeMinutes"))
        && slice.get("tokens").is_some_and(Value::is_object)
        && valid_cost_source(slice.get("costSource"))
}

/// Whether a slice's cost source is absent, null, `harness` or `price_table`.
fn valid_cost_source(value: Option<&Value>) -> bool {
    match value {
        None | Some(Value::Null) => true,
        Some(Value::String(source)) => matches!(source.as_str(), "harness" | "price_table"),
        Some(_) => false,
    }
}

/// A value that is a non-empty string.
fn non_empty_text(value: Option<&Value>) -> Option<&str> {
    value?.as_str().filter(|text| !text.is_empty())
}

/// Whether a value is a finite number of 0 or more.
fn finite_non_negative(value: Option<&Value>) -> bool {
    value
        .and_then(Value::as_f64)
        .is_some_and(|number| number.is_finite() && number >= 0.0)
}
