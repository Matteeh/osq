//! The reason codes TypeScript writes into event `reason` fields.
//!
//! Each enum lists exactly the values TypeScript writes, in the order the
//! rust-core "Reason and outcome values" table lists them, and every variant
//! reads from and writes back as its string.
//!
//! Implements: rust-core/event-types
//! Implements: rust-core/task-fold

use serde::{Deserialize, Serialize};

/// Why a task died, as today's watcher writes it.
///
/// Implements: rust-core/event-types
#[derive(Clone, Copy, Debug, PartialEq, Eq, Hash, Deserialize, Serialize)]
#[serde(rename_all = "snake_case")]
pub enum DeadReason {
    /// The task contradicts the specs it names.
    SpecConflict,
    /// Another attempt of the same task is still running.
    AlreadyRunning,
    /// The agent exited without writing its result file.
    NoResult,
    /// The watcher's verify failed.
    VerifyRed,
    /// The verify could not run as the task declares.
    VerifyPrecondition,
    /// The verify names a path that does not exist.
    VerifyPathMissing,
    /// The task's entry file is missing.
    EntryMissing,
    /// The task adds a dependency it does not declare.
    DeniedDependency,
    /// The change verify failed after the task.
    ChangeVerifyRed,
    /// The harness process crashed.
    Crashed,
    /// The attempt hit its timeout.
    Timeout,
    /// The model provider was unavailable.
    ProviderUnavailable,
    /// The agent changed a test the task may not change.
    UndeclaredTestChange,
    /// The agent reported itself blocked.
    Blocked,
    /// The baseline verify was red.
    BaselineRed,
    /// The change regressed while the task ran.
    Regressed,
    /// The agent moved version control state.
    VcsViolation,
    /// The agent changed files outside its scope.
    ScopeViolation,
}

impl DeadReason {
    /// Every dead reason, in "Reason and outcome values" order.
    pub const ALL: [Self; 18] = [
        Self::SpecConflict,
        Self::AlreadyRunning,
        Self::NoResult,
        Self::VerifyRed,
        Self::VerifyPrecondition,
        Self::VerifyPathMissing,
        Self::EntryMissing,
        Self::DeniedDependency,
        Self::ChangeVerifyRed,
        Self::Crashed,
        Self::Timeout,
        Self::ProviderUnavailable,
        Self::UndeclaredTestChange,
        Self::Blocked,
        Self::BaselineRed,
        Self::Regressed,
        Self::VcsViolation,
        Self::ScopeViolation,
    ];

    /// The string TypeScript writes for this reason.
    ///
    /// Implements: rust-core/event-types
    #[must_use]
    pub const fn as_str(self) -> &'static str {
        match self {
            Self::SpecConflict => "spec_conflict",
            Self::AlreadyRunning => "already_running",
            Self::NoResult => "no_result",
            Self::VerifyRed => "verify_red",
            Self::VerifyPrecondition => "verify_precondition",
            Self::VerifyPathMissing => "verify_path_missing",
            Self::EntryMissing => "entry_missing",
            Self::DeniedDependency => "denied_dependency",
            Self::ChangeVerifyRed => "change_verify_red",
            Self::Crashed => "crashed",
            Self::Timeout => "timeout",
            Self::ProviderUnavailable => "provider_unavailable",
            Self::UndeclaredTestChange => "undeclared_test_change",
            Self::Blocked => "blocked",
            Self::BaselineRed => "baseline_red",
            Self::Regressed => "regressed",
            Self::VcsViolation => "vcs_violation",
            Self::ScopeViolation => "scope_violation",
        }
    }
}

/// Why a task or change regressed, as today's watcher writes it.
///
/// Implements: rust-core/event-types
#[derive(Clone, Copy, Debug, PartialEq, Eq, Hash, Deserialize, Serialize)]
#[serde(rename_all = "snake_case")]
pub enum RegressionReason {
    /// The change verify failed.
    VerifyRed,
    /// The verify names a path that does not exist.
    VerifyPathMissing,
    /// The recorded scope no longer matches the task.
    ScopeRegression,
    /// The worktree is on another branch.
    WorktreeOffBranch,
    /// The worktree has uncommitted changes.
    WorktreeDirty,
    /// The task's commit failed.
    CommitFailed,
    /// A dependency changed since the task ran.
    DependencyChanged,
    /// A dependency diverged from the recorded one.
    DependencyDiverged,
    /// Cutting the stack failed.
    StackCutFailed,
    /// Syncing with the default branch hit a conflict.
    SyncConflict,
    /// A requirement the task named changed.
    RequirementChanged,
    /// The verify after syncing failed.
    SyncVerifyRed,
    /// Syncing failed.
    SyncFailed,
}

impl RegressionReason {
    /// Every regression reason, in "Reason and outcome values" order.
    pub const ALL: [Self; 13] = [
        Self::VerifyRed,
        Self::VerifyPathMissing,
        Self::ScopeRegression,
        Self::WorktreeOffBranch,
        Self::WorktreeDirty,
        Self::CommitFailed,
        Self::DependencyChanged,
        Self::DependencyDiverged,
        Self::StackCutFailed,
        Self::SyncConflict,
        Self::RequirementChanged,
        Self::SyncVerifyRed,
        Self::SyncFailed,
    ];

    /// The string TypeScript writes for this reason.
    ///
    /// Implements: rust-core/event-types
    #[must_use]
    pub const fn as_str(self) -> &'static str {
        match self {
            Self::VerifyRed => "verify_red",
            Self::VerifyPathMissing => "verify_path_missing",
            Self::ScopeRegression => "scope_regression",
            Self::WorktreeOffBranch => "worktree_off_branch",
            Self::WorktreeDirty => "worktree_dirty",
            Self::CommitFailed => "commit_failed",
            Self::DependencyChanged => "dependency_changed",
            Self::DependencyDiverged => "dependency_diverged",
            Self::StackCutFailed => "stack_cut_failed",
            Self::SyncConflict => "sync_conflict",
            Self::RequirementChanged => "requirement_changed",
            Self::SyncVerifyRed => "sync_verify_red",
            Self::SyncFailed => "sync_failed",
        }
    }
}

/// Why a task or change was retried, the union of every reason a marker
/// carries.
///
/// Implements: rust-core/event-types
#[derive(Clone, Copy, Debug, PartialEq, Eq, Hash, Deserialize, Serialize)]
#[serde(rename_all = "snake_case")]
pub enum FailureReason {
    /// The task contradicts the specs it names.
    SpecConflict,
    /// Another attempt of the same task is still running.
    AlreadyRunning,
    /// The agent exited without writing its result file.
    NoResult,
    /// The watcher's verify failed.
    VerifyRed,
    /// The verify could not run as the task declares.
    VerifyPrecondition,
    /// The verify names a path that does not exist.
    VerifyPathMissing,
    /// The task's entry file is missing.
    EntryMissing,
    /// The task adds a dependency it does not declare.
    DeniedDependency,
    /// The change verify failed after the task.
    ChangeVerifyRed,
    /// The harness process crashed.
    Crashed,
    /// The attempt hit its timeout.
    Timeout,
    /// The model provider was unavailable.
    ProviderUnavailable,
    /// The agent changed a test the task may not change.
    UndeclaredTestChange,
    /// The agent reported itself blocked.
    Blocked,
    /// The baseline verify was red.
    BaselineRed,
    /// The change regressed while the task ran.
    Regressed,
    /// The agent moved version control state.
    VcsViolation,
    /// The agent changed files outside its scope.
    ScopeViolation,
    /// The recorded scope no longer matches the task.
    ScopeRegression,
    /// The worktree is on another branch.
    WorktreeOffBranch,
    /// The worktree has uncommitted changes.
    WorktreeDirty,
    /// The task's commit failed.
    CommitFailed,
    /// A dependency changed since the task ran.
    DependencyChanged,
    /// A dependency diverged from the recorded one.
    DependencyDiverged,
    /// Cutting the stack failed.
    StackCutFailed,
    /// Syncing with the default branch hit a conflict.
    SyncConflict,
    /// A requirement the task named changed.
    RequirementChanged,
    /// The verify after syncing failed.
    SyncVerifyRed,
    /// Syncing failed.
    SyncFailed,
    /// The task has no reason its retry can carry.
    Dead,
}

impl FailureReason {
    /// Every failure reason, in "Reason and outcome values" order.
    pub const ALL: [Self; 30] = [
        Self::SpecConflict,
        Self::AlreadyRunning,
        Self::NoResult,
        Self::VerifyRed,
        Self::VerifyPrecondition,
        Self::VerifyPathMissing,
        Self::EntryMissing,
        Self::DeniedDependency,
        Self::ChangeVerifyRed,
        Self::Crashed,
        Self::Timeout,
        Self::ProviderUnavailable,
        Self::UndeclaredTestChange,
        Self::Blocked,
        Self::BaselineRed,
        Self::Regressed,
        Self::VcsViolation,
        Self::ScopeViolation,
        Self::ScopeRegression,
        Self::WorktreeOffBranch,
        Self::WorktreeDirty,
        Self::CommitFailed,
        Self::DependencyChanged,
        Self::DependencyDiverged,
        Self::StackCutFailed,
        Self::SyncConflict,
        Self::RequirementChanged,
        Self::SyncVerifyRed,
        Self::SyncFailed,
        Self::Dead,
    ];

    /// The string TypeScript writes for this reason.
    ///
    /// Implements: rust-core/event-types
    #[must_use]
    pub const fn as_str(self) -> &'static str {
        match self {
            Self::SpecConflict => "spec_conflict",
            Self::AlreadyRunning => "already_running",
            Self::NoResult => "no_result",
            Self::VerifyRed => "verify_red",
            Self::VerifyPrecondition => "verify_precondition",
            Self::VerifyPathMissing => "verify_path_missing",
            Self::EntryMissing => "entry_missing",
            Self::DeniedDependency => "denied_dependency",
            Self::ChangeVerifyRed => "change_verify_red",
            Self::Crashed => "crashed",
            Self::Timeout => "timeout",
            Self::ProviderUnavailable => "provider_unavailable",
            Self::UndeclaredTestChange => "undeclared_test_change",
            Self::Blocked => "blocked",
            Self::BaselineRed => "baseline_red",
            Self::Regressed => "regressed",
            Self::VcsViolation => "vcs_violation",
            Self::ScopeViolation => "scope_violation",
            Self::ScopeRegression => "scope_regression",
            Self::WorktreeOffBranch => "worktree_off_branch",
            Self::WorktreeDirty => "worktree_dirty",
            Self::CommitFailed => "commit_failed",
            Self::DependencyChanged => "dependency_changed",
            Self::DependencyDiverged => "dependency_diverged",
            Self::StackCutFailed => "stack_cut_failed",
            Self::SyncConflict => "sync_conflict",
            Self::RequirementChanged => "requirement_changed",
            Self::SyncVerifyRed => "sync_verify_red",
            Self::SyncFailed => "sync_failed",
            Self::Dead => "dead",
        }
    }
}

impl From<DeadReason> for FailureReason {
    /// Carries a dead reason into the same failure reason.
    ///
    /// Implements: rust-core/task-fold
    fn from(reason: DeadReason) -> Self {
        match reason {
            DeadReason::SpecConflict => Self::SpecConflict,
            DeadReason::AlreadyRunning => Self::AlreadyRunning,
            DeadReason::NoResult => Self::NoResult,
            DeadReason::VerifyRed => Self::VerifyRed,
            DeadReason::VerifyPrecondition => Self::VerifyPrecondition,
            DeadReason::VerifyPathMissing => Self::VerifyPathMissing,
            DeadReason::EntryMissing => Self::EntryMissing,
            DeadReason::DeniedDependency => Self::DeniedDependency,
            DeadReason::ChangeVerifyRed => Self::ChangeVerifyRed,
            DeadReason::Crashed => Self::Crashed,
            DeadReason::Timeout => Self::Timeout,
            DeadReason::ProviderUnavailable => Self::ProviderUnavailable,
            DeadReason::UndeclaredTestChange => Self::UndeclaredTestChange,
            DeadReason::Blocked => Self::Blocked,
            DeadReason::BaselineRed => Self::BaselineRed,
            DeadReason::Regressed => Self::Regressed,
            DeadReason::VcsViolation => Self::VcsViolation,
            DeadReason::ScopeViolation => Self::ScopeViolation,
        }
    }
}

impl From<RegressionReason> for FailureReason {
    /// Carries a regression reason into the same failure reason.
    ///
    /// Implements: rust-core/task-fold
    fn from(reason: RegressionReason) -> Self {
        match reason {
            RegressionReason::VerifyRed => Self::VerifyRed,
            RegressionReason::VerifyPathMissing => Self::VerifyPathMissing,
            RegressionReason::ScopeRegression => Self::ScopeRegression,
            RegressionReason::WorktreeOffBranch => Self::WorktreeOffBranch,
            RegressionReason::WorktreeDirty => Self::WorktreeDirty,
            RegressionReason::CommitFailed => Self::CommitFailed,
            RegressionReason::DependencyChanged => Self::DependencyChanged,
            RegressionReason::DependencyDiverged => Self::DependencyDiverged,
            RegressionReason::StackCutFailed => Self::StackCutFailed,
            RegressionReason::SyncConflict => Self::SyncConflict,
            RegressionReason::RequirementChanged => Self::RequirementChanged,
            RegressionReason::SyncVerifyRed => Self::SyncVerifyRed,
            RegressionReason::SyncFailed => Self::SyncFailed,
        }
    }
}

impl From<RequeueReason> for FailureReason {
    /// Carries a requeue reason into the same failure reason.
    ///
    /// Implements: rust-core/task-fold
    fn from(reason: RequeueReason) -> Self {
        match reason {
            RequeueReason::ScopeRegression => Self::ScopeRegression,
        }
    }
}

/// Why a recertification sends a task back to the queue.
///
/// Implements: rust-core/event-types
#[derive(Clone, Copy, Debug, PartialEq, Eq, Hash, Deserialize, Serialize)]
#[serde(rename_all = "snake_case")]
pub enum RequeueReason {
    /// The recorded scope no longer matches the task.
    ScopeRegression,
}

impl RequeueReason {
    /// Every requeue reason, in "Reason and outcome values" order.
    pub const ALL: [Self; 1] = [Self::ScopeRegression];

    /// The string TypeScript writes for this reason.
    ///
    /// Implements: rust-core/event-types
    #[must_use]
    pub const fn as_str(self) -> &'static str {
        match self {
            Self::ScopeRegression => "scope_regression",
        }
    }
}

/// Why a mutation run was not measured.
///
/// Implements: rust-core/event-types
#[derive(Clone, Copy, Debug, PartialEq, Eq, Hash, Deserialize, Serialize)]
#[serde(rename_all = "snake_case")]
pub enum MutationReason {
    /// The mutation range is unknown.
    RangeUnknown,
    /// The mutation command timed out.
    TimedOut,
    /// The mutation command failed.
    CommandFailed,
    /// The mutation report could not be read.
    ReportInvalid,
    /// The mutation budget ran out.
    Budget,
}

impl MutationReason {
    /// Every mutation reason, in "Reason and outcome values" order.
    pub const ALL: [Self; 5] = [
        Self::RangeUnknown,
        Self::TimedOut,
        Self::CommandFailed,
        Self::ReportInvalid,
        Self::Budget,
    ];

    /// The string TypeScript writes for this reason.
    ///
    /// Implements: rust-core/event-types
    #[must_use]
    pub const fn as_str(self) -> &'static str {
        match self {
            Self::RangeUnknown => "range_unknown",
            Self::TimedOut => "timed_out",
            Self::CommandFailed => "command_failed",
            Self::ReportInvalid => "report_invalid",
            Self::Budget => "budget",
        }
    }
}

/// Why a validator did not run.
///
/// Implements: rust-core/event-types
#[derive(Clone, Copy, Debug, PartialEq, Eq, Hash, Deserialize, Serialize)]
#[serde(rename_all = "snake_case")]
pub enum ValidatorReason {
    /// The change has no recorded base.
    NoBase,
    /// The change has no scenarios to judge.
    NoScenarios,
}

impl ValidatorReason {
    /// Every validator reason, in "Reason and outcome values" order.
    pub const ALL: [Self; 2] = [Self::NoBase, Self::NoScenarios];

    /// The string TypeScript writes for this reason.
    ///
    /// Implements: rust-core/event-types
    #[must_use]
    pub const fn as_str(self) -> &'static str {
        match self {
            Self::NoBase => "no_base",
            Self::NoScenarios => "no_scenarios",
        }
    }
}

/// Why syncing with the default branch stopped.
///
/// Implements: rust-core/event-types
#[derive(Clone, Copy, Debug, PartialEq, Eq, Hash, Deserialize, Serialize)]
#[serde(rename_all = "snake_case")]
pub enum SyncStopReason {
    /// The sync hit a conflict.
    SyncConflict,
    /// A requirement changed under the change.
    RequirementChanged,
    /// The verify after syncing failed.
    SyncVerifyRed,
    /// Syncing failed.
    SyncFailed,
}

impl SyncStopReason {
    /// Every sync stop reason, in "Reason and outcome values" order.
    pub const ALL: [Self; 4] = [
        Self::SyncConflict,
        Self::RequirementChanged,
        Self::SyncVerifyRed,
        Self::SyncFailed,
    ];

    /// The string TypeScript writes for this reason.
    ///
    /// Implements: rust-core/event-types
    #[must_use]
    pub const fn as_str(self) -> &'static str {
        match self {
            Self::SyncConflict => "sync_conflict",
            Self::RequirementChanged => "requirement_changed",
            Self::SyncVerifyRed => "sync_verify_red",
            Self::SyncFailed => "sync_failed",
        }
    }
}
