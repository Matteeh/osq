//! The plan feature's `Feature` implementation.

use osq_core::{Command, Feature, FeatureError, Invocation, Output};

use crate::queue;

/// The plan feature.
#[derive(Clone, Copy, Debug, Default)]
pub struct PlanFeature;

impl Feature for PlanFeature {
    /// The feature's name, `plan`.
    ///
    /// Implements: rust-plan/plan-feature
    fn name(&self) -> &'static str {
        "plan"
    }

    /// The feature's one command, `queue`.
    ///
    /// Implements: rust-plan/plan-feature
    fn commands(&self) -> Vec<Command> {
        vec![Command::new(
            "queue",
            "print the read-only brief queue projection",
            "",
        )]
    }

    /// Runs `queue`, refusing an unknown command or arguments.
    ///
    /// Implements: rust-plan/plan-feature
    /// Implements: rust-plan/queue-arguments
    fn run(&self, invocation: &Invocation) -> Result<Output, FeatureError> {
        if invocation.command != "queue" {
            return Err(FeatureError::unknown_command(invocation.command.as_str()));
        }
        if !invocation.args.is_empty() {
            return Err(FeatureError::usage(
                "queue",
                format!("expected no arguments, got {}", invocation.args.len()),
            ));
        }
        queue::run_queue(&invocation.root).map(Output::text)
    }
}
