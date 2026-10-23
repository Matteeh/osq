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

    /// The feature's three commands, `land <id>`, `sync <id>` and `message <id>`.
    ///
    /// Implements: rust-land/land-feature
    fn commands(&self) -> Vec<Command> {
        vec![
            Command::new(
                "land",
                "land an archived change onto the default branch",
                "<id>",
            ),
            Command::new(
                "sync",
                "merge the default branch into a change's branch",
                "<id>",
            ),
            Command::new(
                "message",
                "print an archived change's land commit message",
                "<id>",
            ),
        ]
    }

    /// Runs `land`, `sync` or `message` with one change id.
    ///
    /// # Errors
    ///
    /// Returns `UnknownCommand` for another command, `Usage` for an argument
    /// count other than one, and `Failed` with the invocation's command for
    /// every failure the other land requirements name.
    ///
    /// Implements: rust-land/land-arguments
    /// Implements: rust-land/sync-command
    /// Implements: rust-land/message-command
    fn run(&self, invocation: &Invocation) -> Result<Output, FeatureError> {
        let command = invocation.command.as_str();
        if !matches!(command, "land" | "sync" | "message") {
            return Err(FeatureError::unknown_command(command));
        }
        if invocation.args.len() != 1 {
            return Err(FeatureError::usage(
                command,
                format!("expected one change id, got {}", invocation.args.len()),
            ));
        }
        match command {
            "sync" => {
                land::sync_command::run(&invocation.root, &invocation.args[0]).map(Output::text)
            }
            "message" => {
                land::message_command::run(&invocation.root, &invocation.args[0]).map(Output::text)
            }
            "land" => land::run_land(&invocation.root, &invocation.args[0]).map(Output::text),
            _ => unreachable!("the command was validated above"),
        }
    }
}
