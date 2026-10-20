//! Proves each reason and outcome enum lists exactly TypeScript's values.

use osq_core::event::{
    AutoSteerOutcome, BaselineOutcome, DeadReason, FailureReason, FocusedOutcome, MutationOutcome,
    MutationReason, RecertificationOutcome, RegressionReason, RequeueReason, SyncStopReason,
    ValidatorOutcome, ValidatorReason, VerificationOutcome,
};
use serde::Serialize;
use serde::de::DeserializeOwned;

/// Checks one enum's `ALL` against its row's values and round-trips every
/// variant through its JSON string.
fn check<T>(all: &[T], as_str: fn(T) -> &'static str, values: &[&str])
where
    T: Copy + std::fmt::Debug + PartialEq + Serialize + DeserializeOwned,
{
    let strings: Vec<&str> = all.iter().map(|variant| as_str(*variant)).collect();
    assert_eq!(strings, values, "value set and order");
    for (variant, value) in all.iter().zip(values) {
        let json = serde_json::to_value(variant).expect("variant writes as JSON");
        assert_eq!(
            json,
            serde_json::Value::String((*value).to_owned()),
            "written value"
        );
        let back: T = serde_json::from_value(json).expect("written value reads back");
        assert_eq!(&back, variant, "read-back value");
    }
}

/// Proves `DeadReason` lists exactly its values.
///
/// Covers: rust-core/reason-and-outcome-values
#[test]
fn dead_reason_values() {
    check(
        &DeadReason::ALL,
        DeadReason::as_str,
        &[
            "spec_conflict",
            "already_running",
            "no_result",
            "verify_red",
            "verify_precondition",
            "verify_path_missing",
            "entry_missing",
            "denied_dependency",
            "change_verify_red",
            "crashed",
            "timeout",
            "provider_unavailable",
            "undeclared_test_change",
            "blocked",
            "baseline_red",
            "regressed",
            "vcs_violation",
            "scope_violation",
        ],
    );
}

/// Proves `RegressionReason` lists exactly its values.
///
/// Covers: rust-core/reason-and-outcome-values
#[test]
fn regression_reason_values() {
    check(
        &RegressionReason::ALL,
        RegressionReason::as_str,
        &[
            "verify_red",
            "verify_path_missing",
            "scope_regression",
            "worktree_off_branch",
            "worktree_dirty",
            "commit_failed",
            "dependency_changed",
            "dependency_diverged",
            "stack_cut_failed",
            "sync_conflict",
            "requirement_changed",
            "sync_verify_red",
            "sync_failed",
        ],
    );
}

/// Proves `FailureReason` lists exactly its values.
///
/// Covers: rust-core/reason-and-outcome-values
#[test]
fn failure_reason_values() {
    check(
        &FailureReason::ALL,
        FailureReason::as_str,
        &[
            "spec_conflict",
            "already_running",
            "no_result",
            "verify_red",
            "verify_precondition",
            "verify_path_missing",
            "entry_missing",
            "denied_dependency",
            "change_verify_red",
            "crashed",
            "timeout",
            "provider_unavailable",
            "undeclared_test_change",
            "blocked",
            "baseline_red",
            "regressed",
            "vcs_violation",
            "scope_violation",
            "scope_regression",
            "worktree_off_branch",
            "worktree_dirty",
            "commit_failed",
            "dependency_changed",
            "dependency_diverged",
            "stack_cut_failed",
            "sync_conflict",
            "requirement_changed",
            "sync_verify_red",
            "sync_failed",
            "dead",
        ],
    );
}

/// Proves `RequeueReason` lists exactly its values.
///
/// Covers: rust-core/reason-and-outcome-values
#[test]
fn requeue_reason_values() {
    check(
        &RequeueReason::ALL,
        RequeueReason::as_str,
        &["scope_regression"],
    );
}

/// Proves `MutationReason` lists exactly its values.
///
/// Covers: rust-core/reason-and-outcome-values
#[test]
fn mutation_reason_values() {
    check(
        &MutationReason::ALL,
        MutationReason::as_str,
        &[
            "range_unknown",
            "timed_out",
            "command_failed",
            "report_invalid",
            "budget",
        ],
    );
}

/// Proves `ValidatorReason` lists exactly its values.
///
/// Covers: rust-core/reason-and-outcome-values
#[test]
fn validator_reason_values() {
    check(
        &ValidatorReason::ALL,
        ValidatorReason::as_str,
        &["no_base", "no_scenarios"],
    );
}

/// Proves `SyncStopReason` lists exactly its values.
///
/// Covers: rust-core/reason-and-outcome-values
#[test]
fn sync_stop_reason_values() {
    check(
        &SyncStopReason::ALL,
        SyncStopReason::as_str,
        &[
            "sync_conflict",
            "requirement_changed",
            "sync_verify_red",
            "sync_failed",
        ],
    );
}

/// Proves `RecertificationOutcome` lists exactly its values.
///
/// Covers: rust-core/reason-and-outcome-values
#[test]
fn recertification_outcome_values() {
    check(
        &RecertificationOutcome::ALL,
        RecertificationOutcome::as_str,
        &["passed", "requeued"],
    );
}

/// Proves `BaselineOutcome` lists exactly its values.
///
/// Covers: rust-core/reason-and-outcome-values
#[test]
fn baseline_outcome_values() {
    check(
        &BaselineOutcome::ALL,
        BaselineOutcome::as_str,
        &["passed", "failed", "reused"],
    );
}

/// Proves `FocusedOutcome` lists exactly its values.
///
/// Covers: rust-core/reason-and-outcome-values
#[test]
fn focused_outcome_values() {
    check(
        &FocusedOutcome::ALL,
        FocusedOutcome::as_str,
        &["passed", "problem", "failed"],
    );
}

/// Proves `MutationOutcome` lists exactly its values.
///
/// Covers: rust-core/reason-and-outcome-values
#[test]
fn mutation_outcome_values() {
    check(
        &MutationOutcome::ALL,
        MutationOutcome::as_str,
        &["measured", "not_measured"],
    );
}

/// Proves `ValidatorOutcome` lists exactly its values.
///
/// Covers: rust-core/reason-and-outcome-values
#[test]
fn validator_outcome_values() {
    check(
        &ValidatorOutcome::ALL,
        ValidatorOutcome::as_str,
        &["validated", "failed", "timed_out", "unreadable", "not_run"],
    );
}

/// Proves `AutoSteerOutcome` lists exactly its values.
///
/// Covers: rust-core/reason-and-outcome-values
#[test]
fn auto_steer_outcome_values() {
    check(
        &AutoSteerOutcome::ALL,
        AutoSteerOutcome::as_str,
        &[
            "running",
            "ready",
            "unchanged",
            "lint_red",
            "failed",
            "timed_out",
        ],
    );
}

/// Proves `VerificationOutcome` lists exactly its values.
///
/// Covers: rust-core/reason-and-outcome-values
#[test]
fn verification_outcome_values() {
    check(
        &VerificationOutcome::ALL,
        VerificationOutcome::as_str,
        &["passed", "failed"],
    );
}

/// Proves each dead, regression and requeue reason keeps its string through
/// `FailureReason`.
///
/// Covers: rust-core/reason-and-outcome-values
#[test]
fn failure_reasons_carry_every_reason() {
    for reason in DeadReason::ALL {
        assert_eq!(
            FailureReason::from(reason).as_str(),
            reason.as_str(),
            "dead reason {reason:?}"
        );
    }
    for reason in RegressionReason::ALL {
        assert_eq!(
            FailureReason::from(reason).as_str(),
            reason.as_str(),
            "regression reason {reason:?}"
        );
    }
    for reason in RequeueReason::ALL {
        assert_eq!(
            FailureReason::from(reason).as_str(),
            reason.as_str(),
            "requeue reason {reason:?}"
        );
    }
}
