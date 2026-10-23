//! The archived count and the archived changes waiting to land.

use osq_core::FeatureError;
use osq_kernel_storage::Location;

use crate::facts::Facts;
use crate::model;

use super::found;

/// The `Archived specs:` line and, with git on, the `Not landed:` block.
///
/// # Errors
///
/// Returns [`FeatureError::failed`] when an archived change cannot be read or
/// a land read fails.
///
/// Implements: rust-show/status-text-equals-typescript-s
pub(crate) fn lines(facts: &Facts) -> Result<Vec<String>, FeatureError> {
    let archived: Vec<_> = facts
        .entries()
        .iter()
        .filter(|entry| entry.location == Location::Archived)
        .collect();
    let mut lines = vec![String::new(), format!("Archived specs: {}", archived.len())];
    if !facts.vcs_enabled() {
        return Ok(lines);
    }
    let mut not_landed = Vec::new();
    for entry in archived {
        let found = found(entry);
        let land = facts.land(&found)?;
        if land.is_none() {
            continue;
        }
        let change = model::read(&found, facts, land.as_ref())
            .map_err(|message| FeatureError::failed("status", message))?;
        let waiting = change
            .next
            .as_ref()
            .is_some_and(|next| next.line().starts_with("archived (not landed)"));
        if !waiting {
            continue;
        }
        let title = if change.title.is_empty() {
            change.folder.clone()
        } else {
            change.title.clone()
        };
        not_landed.push(format!("  {}: {title} — osq land {}", change.id, change.id));
    }
    if !not_landed.is_empty() {
        lines.push("Not landed:".to_owned());
        lines.extend(not_landed);
    }
    Ok(lines)
}
