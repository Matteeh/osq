//! One `manual` run: refuse before writing, otherwise hand the keep its entries.

use std::path::Path;

use osq_core::{FeatureError, Output};
use osq_kernel_config::load_config;

use crate::keep;
use crate::refusals;

/// Runs `manual` after the comment argument was found.
///
/// # Errors
///
/// Returns a `Failed` error with the command `manual` for a config error and
/// every refusal in the requirement's order.
///
/// Implements: rust-manual/manual-command
/// Implements: rust-manual/manual-refusals
pub(crate) fn run(
    root: &Path,
    comment: &str,
    named: &[String],
    now_ms: Option<i64>,
) -> Result<Output, FeatureError> {
    let config =
        load_config(root).map_err(|error| FeatureError::failed("manual", error.to_string()))?;
    let selection = refusals::check(root, &config, comment, named)?;
    keep::run(
        root,
        &config,
        &selection.status,
        &selection.kept,
        comment.trim(),
        now_ms,
    )
}
