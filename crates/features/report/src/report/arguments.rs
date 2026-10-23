//! Reading `report`'s arguments: the one flag it accepts.
//!
//! Implements: rust-report/report-arguments

use osq_core::FeatureError;

/// Reads whether `report` was asked for JSON, refusing every other argument.
///
/// # Errors
///
/// Returns [`FeatureError::usage`] for the first argument that is not `--json`.
///
/// Implements: rust-report/report-arguments
pub(crate) fn parse(args: &[String]) -> Result<bool, FeatureError> {
    let mut json = false;
    for argument in args {
        if argument == "--json" {
            json = true;
        } else {
            return Err(FeatureError::usage(
                "report",
                format!("expected [--json], got {argument}"),
            ));
        }
    }
    Ok(json)
}
