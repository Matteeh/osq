//! The show feature's `Feature` implementation.

use osq_core::{Command, Feature, FeatureError, Invocation, Output};

use crate::{facts, lookup, model, spec, status, text};

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

    /// The feature's three commands: `show`, then `spec`, then `status`.
    ///
    /// Implements: rust-show/show-command
    fn commands(&self) -> Vec<Command> {
        vec![
            Command::new(
                "show",
                "show detailed change information, tasks, and event timeline",
                "<id>",
            ),
            Command::new(
                "spec",
                "list living capabilities and their requirements, or print one requirement",
                "[capability] [requirement]",
            ),
            Command::new(
                "status",
                "show status overview of change folders and tasks",
                "",
            ),
        ]
    }

    /// Runs `show`, `spec` or `status`, refusing every other command.
    ///
    /// # Errors
    ///
    /// Returns [`FeatureError::unknown_command`] for another command,
    /// [`FeatureError::usage`] for a missing, extra or blank `show` id, too
    /// many `spec` arguments or any `status` argument, and
    /// [`FeatureError::failed`] when a change or living spec cannot be found
    /// or read.
    ///
    /// Implements: rust-show/show-command
    /// Implements: rust-show/show-arguments
    /// Implements: rust-show/spec-command
    /// Implements: rust-show/spec-arguments
    /// Implements: rust-show/status-command
    fn run(&self, invocation: &Invocation) -> Result<Output, FeatureError> {
        if invocation.command == "spec" {
            return spec::run(&invocation.root, &invocation.args);
        }
        if invocation.command == "status" {
            if !invocation.args.is_empty() {
                return Err(FeatureError::usage("status", "takes no arguments"));
            }
            return status::run(&invocation.root);
        }
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
        let facts = facts::read(&invocation.root)?;
        let found = lookup::resolve(&invocation.root, id, facts.entries())?;
        let land = facts.land(&found)?;
        let change = model::read(&found, &facts, land.as_ref())
            .map_err(|message| FeatureError::failed("show", message))?;
        Ok(Output::text(format!(
            "{}\n",
            text::format(&change, land.as_ref())
        )))
    }
}
