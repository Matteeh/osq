//! The report feature's `Feature` implementation.

use osq_core::{Command, Feature, FeatureError, Invocation, Output};

use crate::query;

/// The report feature: one read-only query over the osq history tables.
#[derive(Debug, Clone, Copy, Default)]
pub struct ReportFeature;

impl Feature for ReportFeature {
    /// The feature's name, `report`.
    ///
    /// Implements: rust-report/report-feature
    fn name(&self) -> &'static str {
        "report"
    }

    /// The feature's one command, `query`.
    ///
    /// Implements: rust-report/report-feature
    fn commands(&self) -> Vec<Command> {
        vec![Command::new(
            "query",
            "run one read-only SELECT over the osq history tables",
            "[--json] [select]",
        )]
    }

    /// Runs `query` when the invocation names it.
    ///
    /// # Errors
    ///
    /// Returns [`FeatureError::unknown_command`] for any other command,
    /// [`FeatureError::usage`] for more than one select, and whatever
    /// [`query::run_query`] returns.
    ///
    /// Implements: rust-report/report-feature
    /// Implements: rust-report/query-arguments
    /// Implements: rust-report/query-json-output
    fn run(&self, invocation: &Invocation) -> Result<Output, FeatureError> {
        if invocation.command != "query" {
            return Err(FeatureError::unknown_command(invocation.command.as_str()));
        }
        let mut json = false;
        let mut selects = Vec::new();
        for argument in &invocation.args {
            if argument == "--json" {
                json = true;
            } else {
                selects.push(argument.as_str());
            }
        }
        let count = selects.len();
        if count > 1 {
            return Err(FeatureError::usage(
                "query",
                format!("expected at most one select, got {count} arguments"),
            ));
        }
        query::run_query(&invocation.root, selects.first().copied(), json)
    }
}
