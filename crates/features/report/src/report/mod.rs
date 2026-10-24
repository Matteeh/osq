//! The `report` command: reading the counted changes and writing the summary.
//!
//! Implements: rust-report/report-summary

mod arguments;
mod counts;
mod entries;
mod history;
mod history_json;
mod history_text;
mod js_number;
mod output;

use std::path::Path;

use osq_core::{FeatureError, Output};
use osq_kernel_config::load_config;
use osq_kernel_vcs::project_git_root;

/// Runs `report` over one root with its already-read arguments.
///
/// # Errors
///
/// Returns a usage error for an argument other than `--json`, and a failed
/// error for a refused `osq.toml` or a failing worktree listing.
///
/// Implements: rust-report/report-arguments
/// Implements: rust-report/report-changes
/// Implements: rust-report/report-counts
/// Implements: rust-report/report-summary
/// Implements: rust-report/report-history
/// Implements: rust-vcs/project-root-check
pub(crate) fn run(root: &Path, args: &[String]) -> Result<Output, FeatureError> {
    let json = arguments::parse(args)?;
    let config = load_config(root).map_err(|error| failed(error.to_string()))?;
    let repo_root = project_git_root(root, &config).map_err(|error| failed(error.to_string()))?;
    let entries = entries::entries(root, &config, repo_root)?;
    let counts = counts::count(&entries);
    let history = history::read(&entries);
    let text = if json {
        output::json(&counts, &history)
    } else {
        output::text(&counts, &history)
    };
    Ok(Output::text(text))
}

/// Builds the failed error for a report read.
pub(crate) fn failed(message: impl Into<String>) -> FeatureError {
    FeatureError::failed("report", message)
}
