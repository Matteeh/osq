//! The outcome codes TypeScript writes into event `outcome` fields.
//!
//! Each enum lists exactly the values TypeScript writes, in the order the
//! rust-core "Reason and outcome values" table lists them, and every variant
//! reads from and writes back as its string.
//!
//! Implements: rust-core/event-types
//! Implements: rust-core/task-fold

use serde::{Deserialize, Serialize};

/// What a recertification decided about a regressed task.
///
/// Implements: rust-core/event-types
#[derive(Clone, Copy, Debug, PartialEq, Eq, Hash, Deserialize, Serialize)]
#[serde(rename_all = "snake_case")]
pub enum RecertificationOutcome {
    /// The task still verifies, so it is done.
    Passed,
    /// The task must run again.
    Requeued,
}

impl RecertificationOutcome {
    /// Every recertification outcome, in "Reason and outcome values" order.
    pub const ALL: [Self; 2] = [Self::Passed, Self::Requeued];

    /// The string TypeScript writes for this outcome.
    ///
    /// Implements: rust-core/event-types
    #[must_use]
    pub const fn as_str(self) -> &'static str {
        match self {
            Self::Passed => "passed",
            Self::Requeued => "requeued",
        }
    }
}

/// What a baseline run found.
///
/// Implements: rust-core/event-types
#[derive(Clone, Copy, Debug, PartialEq, Eq, Hash, Deserialize, Serialize)]
#[serde(rename_all = "snake_case")]
pub enum BaselineOutcome {
    /// The baseline verify passed.
    Passed,
    /// The baseline verify failed.
    Failed,
    /// A green baseline was reused from another change.
    Reused,
}

impl BaselineOutcome {
    /// Every baseline outcome, in "Reason and outcome values" order.
    pub const ALL: [Self; 3] = [Self::Passed, Self::Failed, Self::Reused];

    /// The string TypeScript writes for this outcome.
    ///
    /// Implements: rust-core/event-types
    #[must_use]
    pub const fn as_str(self) -> &'static str {
        match self {
            Self::Passed => "passed",
            Self::Failed => "failed",
            Self::Reused => "reused",
        }
    }
}

/// What a focused test run found.
///
/// Implements: rust-core/event-types
#[derive(Clone, Copy, Debug, PartialEq, Eq, Hash, Deserialize, Serialize)]
#[serde(rename_all = "snake_case")]
pub enum FocusedOutcome {
    /// The focused tests passed.
    Passed,
    /// The focused tests ran and reported a problem.
    Problem,
    /// The focused tests failed to run.
    Failed,
}

impl FocusedOutcome {
    /// Every focused outcome, in "Reason and outcome values" order.
    pub const ALL: [Self; 3] = [Self::Passed, Self::Problem, Self::Failed];

    /// The string TypeScript writes for this outcome.
    ///
    /// Implements: rust-core/event-types
    #[must_use]
    pub const fn as_str(self) -> &'static str {
        match self {
            Self::Passed => "passed",
            Self::Problem => "problem",
            Self::Failed => "failed",
        }
    }
}

/// Whether a mutation pick was measured.
///
/// Implements: rust-core/event-types
#[derive(Clone, Copy, Debug, PartialEq, Eq, Hash, Deserialize, Serialize)]
#[serde(rename_all = "snake_case")]
pub enum MutationOutcome {
    /// The run measured the mutants.
    Measured,
    /// The run could not measure the mutants.
    NotMeasured,
}

impl MutationOutcome {
    /// Every mutation outcome, in "Reason and outcome values" order.
    pub const ALL: [Self; 2] = [Self::Measured, Self::NotMeasured];

    /// The string TypeScript writes for this outcome.
    ///
    /// Implements: rust-core/event-types
    #[must_use]
    pub const fn as_str(self) -> &'static str {
        match self {
            Self::Measured => "measured",
            Self::NotMeasured => "not_measured",
        }
    }
}

/// What a validator run found.
///
/// Implements: rust-core/event-types
#[derive(Clone, Copy, Debug, PartialEq, Eq, Hash, Deserialize, Serialize)]
#[serde(rename_all = "snake_case")]
pub enum ValidatorOutcome {
    /// The validator judged the scenarios.
    Validated,
    /// The validator failed.
    Failed,
    /// The validator timed out.
    TimedOut,
    /// The validator's output could not be read.
    Unreadable,
    /// The validator did not run.
    NotRun,
}

impl ValidatorOutcome {
    /// Every validator outcome, in "Reason and outcome values" order.
    pub const ALL: [Self; 5] = [
        Self::Validated,
        Self::Failed,
        Self::TimedOut,
        Self::Unreadable,
        Self::NotRun,
    ];

    /// The string TypeScript writes for this outcome.
    ///
    /// Implements: rust-core/event-types
    #[must_use]
    pub const fn as_str(self) -> &'static str {
        match self {
            Self::Validated => "validated",
            Self::Failed => "failed",
            Self::TimedOut => "timed_out",
            Self::Unreadable => "unreadable",
            Self::NotRun => "not_run",
        }
    }
}

/// What an auto-steer run found.
///
/// Implements: rust-core/event-types
#[derive(Clone, Copy, Debug, PartialEq, Eq, Hash, Deserialize, Serialize)]
#[serde(rename_all = "snake_case")]
pub enum AutoSteerOutcome {
    /// Steering is still running.
    Running,
    /// Steering left the change ready.
    Ready,
    /// Steering changed nothing.
    Unchanged,
    /// Steering left the lint red.
    LintRed,
    /// Steering failed.
    Failed,
    /// Steering timed out.
    TimedOut,
}

impl AutoSteerOutcome {
    /// Every auto-steer outcome, in "Reason and outcome values" order.
    pub const ALL: [Self; 6] = [
        Self::Running,
        Self::Ready,
        Self::Unchanged,
        Self::LintRed,
        Self::Failed,
        Self::TimedOut,
    ];

    /// The string TypeScript writes for this outcome.
    ///
    /// Implements: rust-core/event-types
    #[must_use]
    pub const fn as_str(self) -> &'static str {
        match self {
            Self::Running => "running",
            Self::Ready => "ready",
            Self::Unchanged => "unchanged",
            Self::LintRed => "lint_red",
            Self::Failed => "failed",
            Self::TimedOut => "timed_out",
        }
    }
}

/// What a recorded verification found.
///
/// Implements: rust-core/event-types
#[derive(Clone, Copy, Debug, PartialEq, Eq, Hash, Deserialize, Serialize)]
#[serde(rename_all = "snake_case")]
pub enum VerificationOutcome {
    /// The recorded verification passed.
    Passed,
    /// The recorded verification failed.
    Failed,
}

impl VerificationOutcome {
    /// Every verification outcome, in "Reason and outcome values" order.
    pub const ALL: [Self; 2] = [Self::Passed, Self::Failed];

    /// The string TypeScript writes for this outcome.
    ///
    /// Implements: rust-core/event-types
    #[must_use]
    pub const fn as_str(self) -> &'static str {
        match self {
            Self::Passed => "passed",
            Self::Failed => "failed",
        }
    }
}
