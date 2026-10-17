//! The typed events today's osq writes to `.run/events/*.jsonl`.
//!
//! An event line is one JSON object with exactly `type`, `timestamp` and
//! `data`. Reading it gives an [`Envelope`]; writing it back gives the same
//! JSON value, and a line that cannot be read exactly is an [`EventError`]
//! rather than a guess.
//!
//! Implements: rust-core/event-types
//! Implements: rust-core/event-lines-round-trip
//! Implements: rust-core/event-read-errors

pub mod payload;

use serde::Serialize;
use serde::de::DeserializeOwned;
use serde_json::{Map, Value};

pub use payload::{
    ArchivedData, AutoSteerRanData, BaselineRanData, ChangeVerifyRerunData, DeadData,
    DependenciesAddedData, DoneData, DoneManualData, ExitedData, FileChangedData, FocusedRanData,
    FormatRanData, HarnessRetryData, InstructionsChangedData, MeasuresData, MutationRanData,
    Nullable, PausedData, RecertificationData, RegressedData, RejectedData, ResultWrittenData,
    RetryData, ScopeViolationData, StartedData, StuckData, SyncStoppedData, SyncedData, TextData,
    TokensData, ToolData, UsageLimitData, ValidatorRanData, VcsViolationData,
    VerificationRecordedData, VerifyRanData,
};

/// One typed event, with the data of its type.
#[derive(Clone, Debug, PartialEq)]
pub enum Event {
    /// A `tool` event.
    Tool(ToolData),
    /// A `tokens` event.
    Tokens(TokensData),
    /// A `text` event.
    Text(TextData),
    /// A `file_changed` event.
    FileChanged(FileChangedData),
    /// A `started` event.
    Started(StartedData),
    /// A `verify_ran` event.
    VerifyRan(VerifyRanData),
    /// A `result_written` event.
    ResultWritten(ResultWrittenData),
    /// An `exited` event.
    Exited(ExitedData),
    /// A `measures` event.
    Measures(MeasuresData),
    /// A `dependencies_added` event.
    DependenciesAdded(DependenciesAddedData),
    /// A `done` event.
    Done(DoneData),
    /// A `done_manual` event.
    DoneManual(DoneManualData),
    /// A `dead` event.
    Dead(DeadData),
    /// A `regressed` event.
    Regressed(RegressedData),
    /// A `retry` event.
    Retry(RetryData),
    /// A `stuck` event.
    Stuck(StuckData),
    /// A `harness_retry` event.
    HarnessRetry(HarnessRetryData),
    /// A `recertification` event.
    Recertification(RecertificationData),
    /// A `rejected` event.
    Rejected(RejectedData),
    /// An `instructions_changed` event.
    InstructionsChanged(InstructionsChangedData),
    /// A `baseline_ran` event.
    BaselineRan(BaselineRanData),
    /// A `focused_ran` event.
    FocusedRan(FocusedRanData),
    /// A `format_ran` event.
    FormatRan(FormatRanData),
    /// A `mutation_ran` event.
    MutationRan(MutationRanData),
    /// A `validator_ran` event.
    ValidatorRan(ValidatorRanData),
    /// An `auto_steer_ran` event.
    AutoSteerRan(AutoSteerRanData),
    /// A `vcs_violation` event.
    VcsViolation(VcsViolationData),
    /// A `scope_violation` event.
    ScopeViolation(ScopeViolationData),
    /// A `usage_limit` event.
    UsageLimit(UsageLimitData),
    /// A `paused` event.
    Paused(PausedData),
    /// A `change_verify_rerun` event.
    ChangeVerifyRerun(ChangeVerifyRerunData),
    /// An `archived` event.
    Archived(ArchivedData),
    /// A `synced` event.
    Synced(SyncedData),
    /// A `sync_stopped` event.
    SyncStopped(SyncStoppedData),
    /// A `verification_recorded` event.
    VerificationRecorded(VerificationRecordedData),
}

impl Event {
    /// The `type` string this event writes.
    fn type_name(&self) -> &'static str {
        match self {
            Self::Tool(_) => "tool",
            Self::Tokens(_) => "tokens",
            Self::Text(_) => "text",
            Self::FileChanged(_) => "file_changed",
            Self::Started(_) => "started",
            Self::VerifyRan(_) => "verify_ran",
            Self::ResultWritten(_) => "result_written",
            Self::Exited(_) => "exited",
            Self::Measures(_) => "measures",
            Self::DependenciesAdded(_) => "dependencies_added",
            Self::Done(_) => "done",
            Self::DoneManual(_) => "done_manual",
            Self::Dead(_) => "dead",
            Self::Regressed(_) => "regressed",
            Self::Retry(_) => "retry",
            Self::Stuck(_) => "stuck",
            Self::HarnessRetry(_) => "harness_retry",
            Self::Recertification(_) => "recertification",
            Self::Rejected(_) => "rejected",
            Self::InstructionsChanged(_) => "instructions_changed",
            Self::BaselineRan(_) => "baseline_ran",
            Self::FocusedRan(_) => "focused_ran",
            Self::FormatRan(_) => "format_ran",
            Self::MutationRan(_) => "mutation_ran",
            Self::ValidatorRan(_) => "validator_ran",
            Self::AutoSteerRan(_) => "auto_steer_ran",
            Self::VcsViolation(_) => "vcs_violation",
            Self::ScopeViolation(_) => "scope_violation",
            Self::UsageLimit(_) => "usage_limit",
            Self::Paused(_) => "paused",
            Self::ChangeVerifyRerun(_) => "change_verify_rerun",
            Self::Archived(_) => "archived",
            Self::Synced(_) => "synced",
            Self::SyncStopped(_) => "sync_stopped",
            Self::VerificationRecorded(_) => "verification_recorded",
        }
    }

    /// The `data` value this event writes.
    fn data_value(&self) -> Value {
        match self {
            Self::Tool(data) => payload_value(data),
            Self::Tokens(data) => payload_value(data),
            Self::Text(data) => payload_value(data),
            Self::FileChanged(data) => payload_value(data),
            Self::Started(data) => payload_value(data),
            Self::VerifyRan(data) => payload_value(data),
            Self::ResultWritten(data) => payload_value(data),
            Self::Exited(data) => payload_value(data),
            Self::Measures(data) => payload_value(data),
            Self::DependenciesAdded(data) => payload_value(data),
            Self::Done(data) => payload_value(data),
            Self::DoneManual(data) => payload_value(data),
            Self::Dead(data) => payload_value(data),
            Self::Regressed(data) => payload_value(data),
            Self::Retry(data) => payload_value(data),
            Self::Stuck(data) => payload_value(data),
            Self::HarnessRetry(data) => payload_value(data),
            Self::Recertification(data) => payload_value(data),
            Self::Rejected(data) => payload_value(data),
            Self::InstructionsChanged(data) => payload_value(data),
            Self::BaselineRan(data) => payload_value(data),
            Self::FocusedRan(data) => payload_value(data),
            Self::FormatRan(data) => payload_value(data),
            Self::MutationRan(data) => payload_value(data),
            Self::ValidatorRan(data) => payload_value(data),
            Self::AutoSteerRan(data) => payload_value(data),
            Self::VcsViolation(data) => payload_value(data),
            Self::ScopeViolation(data) => payload_value(data),
            Self::UsageLimit(data) => payload_value(data),
            Self::Paused(data) => payload_value(data),
            Self::ChangeVerifyRerun(data) => payload_value(data),
            Self::Archived(data) => payload_value(data),
            Self::Synced(data) => payload_value(data),
            Self::SyncStopped(data) => payload_value(data),
            Self::VerificationRecorded(data) => payload_value(data),
        }
    }
}

/// One event line: its timestamp as written and the typed [`Event`].
#[derive(Clone, Debug, PartialEq)]
pub struct Envelope {
    /// The timestamp string, as written.
    pub timestamp: String,
    /// The typed event.
    pub event: Event,
}

/// Why an event line could not be read.
#[derive(Clone, Debug, PartialEq, Eq)]
pub enum EventError {
    /// The line is not one JSON object.
    NotJson,
    /// The line's keys are not exactly `type`, `timestamp` and `data`, or
    /// `type` or `timestamp` is not a string.
    InvalidEnvelope,
    /// The `type` is not one osq writes.
    UnknownType {
        /// The unknown `type`.
        kind: String,
    },
    /// The `data` does not match the type: a required field is missing, an
    /// unlisted field is present, or a field has the wrong JSON kind.
    InvalidData {
        /// The `type` whose data is invalid.
        kind: String,
    },
}

impl std::fmt::Display for EventError {
    /// Writes the error's message.
    fn fmt(&self, formatter: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        match self {
            Self::NotJson => formatter.write_str("line is not one JSON object"),
            Self::InvalidEnvelope => {
                formatter.write_str("line is not a type/timestamp/data envelope")
            }
            Self::UnknownType { kind } => write!(formatter, "unknown event type `{kind}`"),
            Self::InvalidData { kind } => write!(formatter, "invalid data for event type `{kind}`"),
        }
    }
}

impl std::error::Error for EventError {}

/// Reads one event line into its [`Envelope`].
///
/// Implements: rust-core/event-lines-round-trip
/// Implements: rust-core/event-read-errors
///
/// # Errors
///
/// Returns [`EventError::NotJson`] when the line is not one JSON object,
/// [`EventError::InvalidEnvelope`] when its keys are not exactly `type`,
/// `timestamp` and `data`, [`EventError::UnknownType`] when `type` is not one
/// osq writes, and [`EventError::InvalidData`] when `data` does not match it.
pub fn parse_event_line(line: &str) -> Result<Envelope, EventError> {
    let Ok(Value::Object(mut object)) = serde_json::from_str::<Value>(line) else {
        return Err(EventError::NotJson);
    };
    let well_formed = object.len() == 3
        && object.contains_key("type")
        && object.contains_key("timestamp")
        && object.contains_key("data");
    if !well_formed {
        return Err(EventError::InvalidEnvelope);
    }
    let (Some(Value::String(kind)), Some(Value::String(timestamp))) =
        (object.remove("type"), object.remove("timestamp"))
    else {
        return Err(EventError::InvalidEnvelope);
    };
    let Some(data) = object.remove("data") else {
        return Err(EventError::InvalidEnvelope);
    };
    let event = event_from_data(&kind, data)?;
    Ok(Envelope { timestamp, event })
}

/// Writes an [`Envelope`] back as one JSON line.
///
/// Implements: rust-core/event-lines-round-trip
#[must_use]
pub fn event_line(envelope: &Envelope) -> String {
    let mut object = Map::new();
    object.insert(
        "type".to_owned(),
        Value::String(envelope.event.type_name().to_owned()),
    );
    object.insert(
        "timestamp".to_owned(),
        Value::String(envelope.timestamp.clone()),
    );
    object.insert("data".to_owned(), envelope.event.data_value());
    Value::Object(object).to_string()
}

/// Builds the typed event for a `type` and its `data`.
fn event_from_data(kind: &str, data: Value) -> Result<Event, EventError> {
    let event = match kind {
        "tool" => Event::Tool(parse_data(kind, data)?),
        "tokens" => Event::Tokens(parse_data(kind, data)?),
        "text" => Event::Text(parse_data(kind, data)?),
        "file_changed" => Event::FileChanged(parse_data(kind, data)?),
        "started" => Event::Started(parse_data(kind, data)?),
        "verify_ran" => Event::VerifyRan(parse_data(kind, data)?),
        "result_written" => Event::ResultWritten(parse_data(kind, data)?),
        "exited" => Event::Exited(parse_data(kind, data)?),
        "measures" => Event::Measures(parse_data(kind, data)?),
        "dependencies_added" => Event::DependenciesAdded(parse_data(kind, data)?),
        "done" => Event::Done(parse_data(kind, data)?),
        "done_manual" => Event::DoneManual(parse_data(kind, data)?),
        "dead" => Event::Dead(parse_data(kind, data)?),
        "regressed" => Event::Regressed(parse_data(kind, data)?),
        "retry" => Event::Retry(parse_data(kind, data)?),
        "stuck" => Event::Stuck(parse_data(kind, data)?),
        "harness_retry" => Event::HarnessRetry(parse_data(kind, data)?),
        "recertification" => Event::Recertification(parse_data(kind, data)?),
        "rejected" => Event::Rejected(parse_data(kind, data)?),
        "instructions_changed" => Event::InstructionsChanged(parse_data(kind, data)?),
        "baseline_ran" => Event::BaselineRan(parse_data(kind, data)?),
        "focused_ran" => Event::FocusedRan(parse_data(kind, data)?),
        "format_ran" => Event::FormatRan(parse_data(kind, data)?),
        "mutation_ran" => Event::MutationRan(parse_data(kind, data)?),
        "validator_ran" => Event::ValidatorRan(parse_data(kind, data)?),
        "auto_steer_ran" => Event::AutoSteerRan(parse_data(kind, data)?),
        "vcs_violation" => Event::VcsViolation(parse_data(kind, data)?),
        "scope_violation" => Event::ScopeViolation(parse_data(kind, data)?),
        "usage_limit" => Event::UsageLimit(parse_data(kind, data)?),
        "paused" => Event::Paused(parse_data(kind, data)?),
        "change_verify_rerun" => Event::ChangeVerifyRerun(parse_data(kind, data)?),
        "archived" => Event::Archived(parse_data(kind, data)?),
        "synced" => Event::Synced(parse_data(kind, data)?),
        "sync_stopped" => Event::SyncStopped(parse_data(kind, data)?),
        "verification_recorded" => Event::VerificationRecorded(parse_data(kind, data)?),
        other => {
            return Err(EventError::UnknownType {
                kind: other.to_owned(),
            });
        }
    };
    Ok(event)
}

/// Reads a payload of the named type from its `data` value.
fn parse_data<T: DeserializeOwned>(kind: &str, data: Value) -> Result<T, EventError> {
    serde_json::from_value(data).map_err(|_| EventError::InvalidData {
        kind: kind.to_owned(),
    })
}

/// Serializes a payload to its JSON value.
fn payload_value<T: Serialize>(payload: &T) -> Value {
    serde_json::to_value(payload).unwrap_or(Value::Null)
}
