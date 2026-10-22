//! The show feature's `Feature` implementation.

use osq_core::{Command, Feature, FeatureError, Invocation, Output};

use crate::lookup;
use crate::model;
use crate::text;

/// The show feature: a unit struct with no state (ADR 028).
///
/// Implements: rust-show/show-command
#[derive(Clone, Copy, Debug, Default)]
pub struct ShowFeature;

impl Feature for ShowFeature {
    /// The feature's name, `show`.
    ///
    /// Implements: rust-show/show-command
    fn name(&self) -> &'static str {
        "show"
    }

    /// The feature's one command, `show`.
    ///
    /// Implements: rust-show/show-command
    fn commands(&self) -> Vec<Command> {
        vec![Command::new(
            "show",
            "show detailed change information, tasks, and event timeline",
            "<id>",
        )]
    }

    /// Shows the change named by exactly one argument.
    ///
    /// # Errors
    ///
    /// Returns [`FeatureError::unknown_command`] for another command,
    /// [`FeatureError::usage`] for a missing, extra or blank id, and
    /// [`FeatureError::failed`] when the change cannot be found or read.
    ///
    /// Implements: rust-show/show-command
    /// Implements: rust-show/show-arguments
    fn run(&self, invocation: &Invocation) -> Result<Output, FeatureError> {
        if invocation.command != "show" {
            return Err(FeatureError::unknown_command(invocation.command.as_str()));
        }
        let [id] = invocation.args.as_slice() else {
            return Err(FeatureError::usage("show", "expected <id>"));
        };
        if id.trim().is_empty() {
            return Err(FeatureError::usage(
                "show",
                "specify a spec ID to show (e.g. osq show 001)",
            ));
        }
        let found = lookup::resolve(&invocation.root, id)?;
        let change =
            model::read(&found).map_err(|message| FeatureError::failed("show", message))?;
        Ok(Output::text(format!("{}\n", text::format(&change))))
    }
}
