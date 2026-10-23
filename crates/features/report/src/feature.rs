//! The report feature's `Feature` implementation.

use osq_core::{Command, Feature, FeatureError, Invocation, Output};

use crate::{query, report};

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

    /// The feature's two commands, `report` then `query`.
    ///
    /// Implements: rust-report/report-feature
    fn commands(&self) -> Vec<Command> {
        vec![
            Command::new(
                "report",
                "display delivery metrics and task completion report",
                "[--json]",
            ),
            Command::new(
                "query",
                "run one read-only SELECT over the osq history tables",
                "[--json] [select]",
            ),
        ]
    }

    /// Runs `report` or `query` when the invocation names it.
    ///
    /// # Errors
    ///
    /// Returns [`FeatureError::unknown_command`] for any other command,
    /// [`FeatureError::usage`] for `report`'s unexpected arguments or more than
    /// one `query` select, and whatever [`report::run`] or
    /// [`query::run_query`] returns.
    ///
    /// Implements: rust-report/report-feature
    /// Implements: rust-report/query-arguments
    /// Implements: rust-report/query-json-output
    /// Implements: rust-report/report-arguments
    fn run(&self, invocation: &Invocation) -> Result<Output, FeatureError> {
        match invocation.command.as_str() {
            "report" => report::run(&invocation.root, &invocation.args),
            "query" => run_query(invocation),
            other => Err(FeatureError::unknown_command(other)),
        }
    }
}

/// Runs `query` with its optional `--json` flag and one select.
fn run_query(invocation: &Invocation) -> Result<Output, FeatureError> {
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
