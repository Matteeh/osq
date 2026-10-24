//! The kind of each event, without its payload.
//!
//! An [`EventKind`] names one [`Event`](super::Event) variant. [`Event::kind`]
//! gives an event's kind, and [`EventKind::name`] gives the `type` string its
//! event lines carry, so a feature can list the kinds it reacts to as plain
//! data.
//!
//! Implements: rust-core/event-kinds

/// One kind of event, without its payload.
///
/// Implements: rust-core/event-kinds
#[non_exhaustive]
#[derive(Clone, Copy, Debug, PartialEq, Eq, Hash)]
pub enum EventKind {
    /// A `tool` event.
    Tool,
    /// A `tokens` event.
    Tokens,
    /// A `text` event.
    Text,
    /// A `file_changed` event.
    FileChanged,
    /// A `started` event.
    Started,
    /// A `verify_ran` event.
    VerifyRan,
    /// A `result_written` event.
    ResultWritten,
    /// An `exited` event.
    Exited,
    /// An `exit_continued` event.
    ExitContinued,
    /// A `measures` event.
    Measures,
    /// A `dependencies_added` event.
    DependenciesAdded,
    /// A `done` event.
    Done,
    /// A `done_manual` event.
    DoneManual,
    /// A `dead` event.
    Dead,
    /// A `regressed` event.
    Regressed,
    /// A `retry` event.
    Retry,
    /// A `stuck` event.
    Stuck,
    /// A `harness_retry` event.
    HarnessRetry,
    /// A `recertification` event.
    Recertification,
    /// A `rejected` event.
    Rejected,
    /// An `instructions_changed` event.
    InstructionsChanged,
    /// A `baseline_ran` event.
    BaselineRan,
    /// A `focused_ran` event.
    FocusedRan,
    /// A `format_ran` event.
    FormatRan,
    /// A `mutation_ran` event.
    MutationRan,
    /// A `validator_ran` event.
    ValidatorRan,
    /// An `auto_steer_ran` event.
    AutoSteerRan,
    /// A `vcs_violation` event.
    VcsViolation,
    /// A `scope_violation` event.
    ScopeViolation,
    /// A `usage_limit` event.
    UsageLimit,
    /// A `paused` event.
    Paused,
    /// A `change_verify_rerun` event.
    ChangeVerifyRerun,
    /// An `archived` event.
    Archived,
    /// A `synced` event.
    Synced,
    /// A `sync_stopped` event.
    SyncStopped,
    /// A `verification_recorded` event.
    VerificationRecorded,
}

impl EventKind {
    /// The `type` string this kind's event lines carry.
    ///
    /// Implements: rust-core/event-kinds
    #[must_use]
    pub fn name(self) -> &'static str {
        match self {
            Self::Tool => "tool",
            Self::Tokens => "tokens",
            Self::Text => "text",
            Self::FileChanged => "file_changed",
            Self::Started => "started",
            Self::VerifyRan => "verify_ran",
            Self::ResultWritten => "result_written",
            Self::Exited => "exited",
            Self::ExitContinued => "exit_continued",
            Self::Measures => "measures",
            Self::DependenciesAdded => "dependencies_added",
            Self::Done => "done",
            Self::DoneManual => "done_manual",
            Self::Dead => "dead",
            Self::Regressed => "regressed",
            Self::Retry => "retry",
            Self::Stuck => "stuck",
            Self::HarnessRetry => "harness_retry",
            Self::Recertification => "recertification",
            Self::Rejected => "rejected",
            Self::InstructionsChanged => "instructions_changed",
            Self::BaselineRan => "baseline_ran",
            Self::FocusedRan => "focused_ran",
            Self::FormatRan => "format_ran",
            Self::MutationRan => "mutation_ran",
            Self::ValidatorRan => "validator_ran",
            Self::AutoSteerRan => "auto_steer_ran",
            Self::VcsViolation => "vcs_violation",
            Self::ScopeViolation => "scope_violation",
            Self::UsageLimit => "usage_limit",
            Self::Paused => "paused",
            Self::ChangeVerifyRerun => "change_verify_rerun",
            Self::Archived => "archived",
            Self::Synced => "synced",
            Self::SyncStopped => "sync_stopped",
            Self::VerificationRecorded => "verification_recorded",
        }
    }
}
