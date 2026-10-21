//! The land feature's `Feature` implementation.

use osq_core::{Command, Feature, FeatureError, Invocation, Output};

use crate::land;

/// The land feature: a unit struct with no state (ADR 028).
///
/// Implements: rust-land/land-feature
#[derive(Clone, Copy, Debug, Default)]
pub struct LandFeature;

impl Feature for LandFeature {
    /// The feature's name, `land`.
    ///
    /// Implements: rust-land/land-feature
    fn name(&self) -> &'static str {
        "land"
    }

    /// The feature's one command, `land <id>`.
    ///
    /// Implements: rust-land/land-feature
    fn commands(&self) -> Vec<Command> {
        vec![Command::new(
            "land",
            "land an archived change onto the default branch",
            "<id>",
        )]
    }

    /// Runs `land` with one change id.
    ///
    /// # Errors
    ///
    /// Returns `UnknownCommand` for another command, `Usage` for an argument
    /// count other than one, and `Failed` with the command `land` for every
    /// failure the other land requirements name.
    ///
    /// Implements: rust-land/land-arguments
    fn run(&self, invocation: &Invocation) -> Result<Output, FeatureError> {
        if invocation.command != "land" {
            return Err(FeatureError::unknown_command(invocation.command.as_str()));
        }
        if invocation.args.len() != 1 {
            return Err(FeatureError::usage(
                "land",
                format!("expected one change id, got {}", invocation.args.len()),
            ));
        }
        land::run_land(&invocation.root, &invocation.args[0]).map(Output::text)
    }
}
