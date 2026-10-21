//! The archive feature's `Feature` implementation.

use osq_core::{Command, Feature, FeatureError, Invocation, Output};

use crate::{archive, relocate};

/// The archive feature: a unit struct with no state (ADR 028).
///
/// Implements: rust-archive/archive-feature
#[derive(Clone, Copy, Debug, Default)]
pub struct ArchiveFeature;

impl Feature for ArchiveFeature {
    /// The feature's name, `archive`.
    ///
    /// Implements: rust-archive/archive-feature
    fn name(&self) -> &'static str {
        "archive"
    }

    /// The feature's one command, `archive <change>`.
    ///
    /// Implements: rust-archive/archive-feature
    fn commands(&self) -> Vec<Command> {
        vec![Command::new(
            "archive",
            "apply a done change's deltas to the living specs and move it to the archive",
            "<change>",
        )]
    }

    /// Runs `archive` with one change argument, returning the archived path.
    ///
    /// # Errors
    ///
    /// Returns `UnknownCommand` for another command, `Usage` for an argument
    /// count other than one, and `Failed` with the command `archive` for every
    /// failure the other archive requirements name.
    ///
    /// Implements: rust-archive/archive-arguments
    /// Implements: rust-archive/archive-move
    fn run(&self, invocation: &Invocation) -> Result<Output, FeatureError> {
        if invocation.command != "archive" {
            return Err(FeatureError::unknown_command(invocation.command.as_str()));
        }
        if invocation.args.len() != 1 {
            return Err(FeatureError::usage(
                "archive",
                format!(
                    "expected one change, got {} arguments",
                    invocation.args.len()
                ),
            ));
        }
        let path = archive::run(&invocation.root, &invocation.args[0])?;
        let archived = relocate::run(&invocation.root, &path)
            .map_err(|error| FeatureError::failed("archive", error.to_string()))?;
        Ok(Output::text(archived))
    }
}
