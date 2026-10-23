//! The approve feature's `Feature` implementation.

use osq_core::{Command, Feature, FeatureError, Invocation, Output};

use crate::approve::{self, ApproveOptions};
use crate::reject;

/// The approve feature: a unit struct with no state (ADR 028).
///
/// Implements: rust-approve/approve-feature
#[derive(Clone, Copy, Debug, Default)]
pub struct ApproveFeature;

impl Feature for ApproveFeature {
    /// The feature's name, `approve`.
    ///
    /// Implements: rust-approve/approve-feature
    fn name(&self) -> &'static str {
        "approve"
    }

    /// The feature's commands, `approve` and then `reject`.
    ///
    /// Implements: rust-approve/approve-feature
    fn commands(&self) -> Vec<Command> {
        vec![
            Command::new(
                "approve",
                "lint, hash, and approve change folders",
                "<id> [--base-ok] [--ignore-dirty]",
            ),
            Command::new(
                "reject",
                "move an eligible active change intact into rejected history",
                "<id> --reason <text>",
            ),
        ]
    }

    /// Runs `approve` with one change id, or `reject` with an id and a reason.
    ///
    /// # Errors
    ///
    /// Returns `UnknownCommand` for another command, `Usage` for `approve`
    /// with an argument count other than one or for `reject` with arguments it
    /// cannot read, and `Failed` with the running command for every failure the
    /// other approve and reject requirements name.
    ///
    /// Implements: rust-approve/approve-arguments
    /// Implements: rust-approve/reject-arguments
    fn run(&self, invocation: &Invocation) -> Result<Output, FeatureError> {
        match invocation.command.as_str() {
            "approve" => {
                let (ids, options) = approve_arguments(&invocation.args);
                if ids.len() != 1 {
                    return Err(FeatureError::usage(
                        "approve",
                        format!("expected one change id, got {}", ids.len()),
                    ));
                }
                approve::run_approve(&invocation.root, ids[0], options).map(Output::text)
            }
            "reject" => reject::run_reject(&invocation.root, &invocation.args).map(Output::text),
            other => Err(FeatureError::unknown_command(other)),
        }
    }
}

/// Splits an `approve` invocation into its change ids and its two flags.
///
/// Implements: rust-approve/approve-arguments
fn approve_arguments(args: &[String]) -> (Vec<&str>, ApproveOptions) {
    let mut ids = Vec::new();
    let mut options = ApproveOptions::default();
    for arg in args {
        match arg.as_str() {
            "--base-ok" => options.base_ok = true,
            "--ignore-dirty" => options.ignore_dirty = true,
            id => ids.push(id),
        }
    }
    (ids, options)
}
