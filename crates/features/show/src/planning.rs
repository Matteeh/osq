//! The planning sessions section of one change.

use std::fs;
use std::path::Path;

use serde_json::Value;

use crate::model::Change;

/// One correlated planning session with the values the line prints.
///
/// Implements: rust-show/show-json
pub(crate) struct Session {
    /// The planning session identifier.
    pub(crate) id: String,
    /// The start record's timestamp.
    pub(crate) start: String,
    /// The start record's harness, or empty text.
    pub(crate) harness: String,
    /// The start record's model, when non-empty.
    pub(crate) model: Option<String>,
    /// The start record's agent, when non-empty.
    pub(crate) agent: Option<String>,
    /// The exit record's exit code, when recorded.
    pub(crate) exit_code: Option<f64>,
    /// The exit record's wall seconds, when an exit exists.
    pub(crate) wall_seconds: Option<f64>,
}

/// One lifecycle record that correlates into a session.
#[derive(Clone)]
struct Record {
    /// The planning session identifier.
    session_id: String,
    /// The record's timestamp.
    timestamp: String,
    /// Whether this is a `plan_started` record.
    started: bool,
    /// The start record's harness, or empty text.
    harness: String,
    /// The start record's model, when non-empty.
    model: Option<String>,
    /// The start record's agent, when non-empty.
    agent: Option<String>,
    /// The exit record's exit code, when recorded.
    exit_code: Option<f64>,
    /// The exit record's wall seconds, when recorded.
    wall_seconds: Option<f64>,
}

/// One session's lifecycle records still being correlated.
struct Draft {
    /// The planning session identifier.
    session_id: String,
    /// The first start record.
    started: Option<Record>,
    /// The first exit record.
    exited: Option<Record>,
}

/// The `Planning Sessions:` lines of one change.
pub(crate) fn section(change: &Change) -> Vec<String> {
    let mut lines = vec![String::new(), "Planning Sessions:".to_owned()];
    let sessions = sessions(&change.path);
    if sessions.is_empty() {
        lines.push("  (no planning sessions)".to_owned());
        return lines;
    }
    for session in sessions {
        lines.push(format_session(&session));
    }
    lines
}

/// Reads and correlates a change's `.run/plan.jsonl` into start-ordered sessions.
/// Implements: rust-show/show-json
pub(crate) fn sessions(folder: &Path) -> Vec<Session> {
    let Ok(text) = fs::read_to_string(folder.join(".run").join("plan.jsonl")) else {
        return Vec::new();
    };
    correlate(&records(&text))
}

/// Parses the lifecycle records of a plan log, skipping malformed lines.
fn records(text: &str) -> Vec<Record> {
    text.split('\n').filter_map(record).collect()
}

/// Parses one line as a lifecycle record, or `None` when it is not one.
fn record(line: &str) -> Option<Record> {
    if line.trim().is_empty() {
        return None;
    }
    let value: Value = serde_json::from_str(line).ok()?;
    let object = value.as_object()?;
    let data = object.get("data")?.as_object()?;
    let session_id = object.get("sessionId")?.as_str()?;
    let timestamp = object.get("timestamp")?.as_str()?;
    if session_id.is_empty() || timestamp.is_empty() {
        return None;
    }
    let kind = object.get("type")?.as_str()?;
    if kind == "plan_started" {
        return Some(Record {
            session_id: session_id.to_owned(),
            timestamp: timestamp.to_owned(),
            started: true,
            harness: text(data.get("harness")),
            model: text_or_null(data.get("model")),
            agent: text_or_null(data.get("agent")),
            exit_code: None,
            wall_seconds: None,
        });
    }
    if kind != "plan_exited" {
        return None;
    }
    Some(Record {
        session_id: session_id.to_owned(),
        timestamp: timestamp.to_owned(),
        started: false,
        harness: String::new(),
        model: None,
        agent: None,
        exit_code: finite(data.get("exitCode")),
        wall_seconds: Some(non_negative(data.get("wallSeconds")).unwrap_or(0.0)),
    })
}

/// A string value, or empty text for any other value.
fn text(value: Option<&Value>) -> String {
    value.and_then(Value::as_str).unwrap_or_default().to_owned()
}

/// A non-empty string value, or `None`.
fn text_or_null(value: Option<&Value>) -> Option<String> {
    value
        .and_then(Value::as_str)
        .filter(|text| !text.is_empty())
        .map(ToOwned::to_owned)
}

/// A finite JSON number, or `None`.
fn finite(value: Option<&Value>) -> Option<f64> {
    let number = value?.as_f64()?;
    number.is_finite().then_some(number)
}

/// A finite non-negative JSON number, or `None`.
fn non_negative(value: Option<&Value>) -> Option<f64> {
    finite(value).filter(|number| *number >= 0.0)
}

/// Correlates records by session id and returns started sessions in start order.
fn correlate(records: &[Record]) -> Vec<Session> {
    let mut drafts: Vec<Draft> = Vec::new();
    for record in records {
        let index = drafts
            .iter()
            .position(|draft| draft.session_id == record.session_id);
        let index = if let Some(index) = index {
            index
        } else {
            drafts.push(Draft {
                session_id: record.session_id.clone(),
                started: None,
                exited: None,
            });
            drafts.len().saturating_sub(1)
        };
        let draft = &mut drafts[index];
        if record.started {
            if draft.started.is_none() {
                draft.started = Some(record.clone());
            }
        } else if draft.exited.is_none() {
            draft.exited = Some(record.clone());
        }
    }
    let mut sessions: Vec<Session> = drafts
        .into_iter()
        .filter_map(|draft| {
            let started = draft.started?;
            Some(Session {
                id: started.session_id,
                start: started.timestamp,
                harness: started.harness,
                model: started.model,
                agent: started.agent,
                exit_code: draft.exited.as_ref().and_then(|exit| exit.exit_code),
                wall_seconds: draft.exited.as_ref().and_then(|exit| exit.wall_seconds),
            })
        })
        .collect();
    sessions.sort_by(|left, right| left.start.cmp(&right.start));
    sessions
}

/// One session's line as TypeScript formats it.
fn format_session(session: &Session) -> String {
    let model = session.model.as_deref().unwrap_or("unavailable");
    let agent = session
        .agent
        .as_deref()
        .map(|agent| format!(" agent: {agent}"))
        .unwrap_or_default();
    let exit = session
        .exit_code
        .map_or_else(|| "unavailable".to_owned(), crate::events::js_number);
    let wall = session
        .wall_seconds
        .map_or_else(|| "unavailable".to_owned(), format_duration);
    format!(
        "  {} {}/{}{} exit: {} wall: {}",
        session.start, session.harness, model, agent, exit, wall
    )
}

/// TypeScript's `formatDuration` for a wall time in seconds.
fn format_duration(seconds: f64) -> String {
    let total = seconds.round();
    if total <= 0.0 {
        return "0s".to_owned();
    }
    if total < 60.0 {
        return format!("{total:.0}s");
    }
    let minutes = (total / 60.0).floor();
    let rest = total % 60.0;
    if rest > 0.0 {
        format!("{minutes:.0}m {rest:.0}s")
    } else {
        format!("{minutes:.0}m")
    }
}
