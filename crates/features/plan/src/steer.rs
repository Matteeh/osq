//! The `plan <id>` command: write a steered change's prompt and hand it off.

mod lookup;
mod prompt;
mod triggers;

use std::path::Path;

use osq_core::FeatureError;

use crate::next::handoff;

/// Runs `plan <id>` on `root`, returning the handoff text and writing the prompt.
///
/// Implements: rust-plan/plan-arguments
/// Implements: rust-plan/steering-lookup
/// Implements: rust-plan/steering-prompt
/// Implements: rust-plan/steering-handoff
pub(crate) fn run_steer(root: &Path, id: &str) -> Result<String, FeatureError> {
    let Some(entry) = lookup::find(root, id) else {
        return Err(nothing(id));
    };
    let snapshot = osq_kernel_storage::read_change(&entry).map_err(|error| {
        FeatureError::failed("plan", format!("Cannot read {}: {error}", entry.folder))
    })?;
    let triggers = triggers::derive(&snapshot);
    if triggers.is_empty() {
        return Err(nothing(id));
    }
    let folder = entry.path;
    let text = prompt::build(root, &folder, &snapshot, id, &triggers)?;
    let path = folder.join("plan-prompt.md");
    std::fs::write(&path, text).map_err(|source| {
        FeatureError::failed("plan", format!("Cannot write {}: {source}", path.display()))
    })?;
    let command = root
        .join(".claude")
        .join("commands")
        .join("osq-plan.md")
        .is_file();
    Ok(handoff::format(
        root,
        &entry.folder,
        &snapshot.id,
        "dead (needs steering)",
        command,
    ))
}

/// Builds the refusal for an id that names no change needing steering.
///
/// Implements: rust-plan/steering-lookup
fn nothing(id: &str) -> FeatureError {
    FeatureError::failed(
        "plan",
        format!(
            "No active change matching \"{id}\" needs steering; Rust osq plan {id} steers a change only."
        ),
    )
}
