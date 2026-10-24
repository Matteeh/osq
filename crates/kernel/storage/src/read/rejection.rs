//! Reading a rejected change's planner from its change stream and brief.
//!
//! Implements: rust-storage/rejection-planner

use std::fs;
use std::path::Path;

use super::task_history::has_rejected_line;
use super::text::frontmatter_string;

/// Reads the planner of a rejected change, or `None` without a rejection.
///
/// Implements: rust-storage/rejection-planner
#[must_use]
pub fn read_rejection_planner(folder: &Path) -> Option<String> {
    let path = folder.join(".run").join("events").join("change.jsonl");
    let content = fs::read_to_string(path).ok()?;
    if !has_rejected_line(&content) {
        return None;
    }
    let brief = fs::read_to_string(folder.join("brief.md")).unwrap_or_default();
    let planner = frontmatter_string(&brief, "planner")
        .map(|planner| planner.trim().to_owned())
        .filter(|planner| !planner.is_empty())
        .unwrap_or_else(|| "unknown".to_owned());
    Some(planner)
}
