//! The approve feature's `Feature` implementation.

use osq_core::{Command, Feature, FeatureError, Invocation, Output};

use crate::approve;

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

    /// The feature's one command, `approve <id>`.
    ///
    /// Implements: rust-approve/approve-feature
    fn commands(&self) -> Vec<Command> {
        vec![Command::new(
            "approve",
            "lint, hash, and approve change folders",
            "<id>",
        )]
    }

    /// Runs `approve` with one change id.
    ///
    /// # Errors
    ///
    /// Returns `UnknownCommand` for another command, `Usage` for an argument
    /// count other than one, and `Failed` with the command `approve` for every
    /// failure the other approve requirements name.
    ///
    /// Implements: rust-approve/approve-arguments
    fn run(&self, invocation: &Invocation) -> Result<Output, FeatureError> {
        if invocation.command != "approve" {
            return Err(FeatureError::unknown_command(invocation.command.as_str()));
        }
        if invocation.args.len() != 1 {
            return Err(FeatureError::usage(
                "approve",
                format!("expected one change id, got {}", invocation.args.len()),
            ));
        }
        approve::run_approve(&invocation.root, &invocation.args[0]).map(Output::text)
    }
}
