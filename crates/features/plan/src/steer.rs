//! The `plan <id>` command: write a steered change's prompt and hand it off.

mod lookup;
mod prompt;
mod requirements;
mod triggers;

use std::path::Path;

use osq_core::FeatureError;
use osq_kernel_config::Config;
use osq_kernel_storage::{ChangeSnapshot, Location};

use crate::next::handoff;

use self::lookup::Found;
use self::prompt::Steer;

/// Runs `plan <id>` on `root`, returning the handoff text and writing the prompt.
///
/// Implements: rust-plan/plan-arguments
/// Implements: rust-plan/steering-lookup
/// Implements: rust-plan/steering-prompt
/// Implements: rust-plan/steering-handoff
/// Implements: rust-plan/steering-in-worktrees
pub(crate) fn run_steer(root: &Path, id: &str) -> Result<String, FeatureError> {
    let (config, found) = lookup::candidates(root)?;
    if let Some(found) = found.iter().find(|found| active(found, id)) {
        return steer(root, &config, found, id);
    }
    if config.vcs.enabled {
        return steer_archived(root, &config, &found, id);
    }
    Err(nothing(id))
}

/// Steers an active change, or refuses it for having no trigger.
///
/// Implements: rust-plan/steering-lookup
fn steer(root: &Path, config: &Config, found: &Found, id: &str) -> Result<String, FeatureError> {
    let snapshot = read(found)?;
    let triggers = triggers::derive(&snapshot);
    if triggers.is_empty() {
        return Err(if found.named {
            approved(&snapshot)
        } else {
            nothing(id)
        });
    }
    finish(root, config, found, &snapshot, &triggers, id)
}

/// Steers the first archived change in a naming tree that needs steering.
///
/// Implements: rust-plan/steering-lookup
fn steer_archived(
    root: &Path,
    config: &Config,
    found: &[Found],
    id: &str,
) -> Result<String, FeatureError> {
    for found in found.iter().filter(|found| archived(found, id)) {
        let snapshot = read(found)?;
        let triggers = triggers::derive(&snapshot);
        if !triggers.is_empty() {
            return finish(root, config, found, &snapshot, &triggers, id);
        }
    }
    Err(nothing(id))
}

/// Whether a found change is active and matches the id.
///
/// Implements: rust-plan/steering-lookup
fn active(found: &Found, id: &str) -> bool {
    found.entry.location == Location::Active && lookup::matches(&found.entry.folder, id)
}

/// Whether a found change is archived, named by its tree and matching the id.
///
/// Implements: rust-plan/steering-lookup
fn archived(found: &Found, id: &str) -> bool {
    found.entry.location == Location::Archived
        && found.named
        && lookup::matches(&found.entry.folder, id)
}

/// Reads one found change into its snapshot.
///
/// Implements: rust-plan/steering-lookup
fn read(found: &Found) -> Result<ChangeSnapshot, FeatureError> {
    osq_kernel_storage::read_change(&found.entry).map_err(|error| {
        FeatureError::failed(
            "plan",
            format!("Cannot read {}: {error}", found.entry.folder),
        )
    })
}

/// Writes the change's prompt and returns its handoff.
///
/// Implements: rust-plan/steering-prompt
/// Implements: rust-plan/steering-handoff
fn finish(
    root: &Path,
    config: &Config,
    found: &Found,
    snapshot: &ChangeSnapshot,
    triggers: &[triggers::Trigger],
    id: &str,
) -> Result<String, FeatureError> {
    let text = prompt::build(&Steer {
        root,
        tree_root: &found.tree_root,
        folder: &found.entry.path,
        snapshot,
        given_id: id,
        triggers,
        config,
    })?;
    let path = found.entry.path.join("plan-prompt.md");
    std::fs::write(&path, text).map_err(|source| {
        FeatureError::failed("plan", format!("Cannot write {}: {source}", path.display()))
    })?;
    let command = root
        .join(".claude")
        .join("commands")
        .join("osq-plan.md")
        .is_file();
    Ok(handoff::format(
        &found.entry.path,
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

/// Builds the refusal for a named approved change that needs no steering.
///
/// Implements: rust-plan/steering-lookup
fn approved(snapshot: &ChangeSnapshot) -> FeatureError {
    FeatureError::failed(
        "plan",
        format!(
            "{} is approved and needs no steering; osq plan {} reopens an approved change only when it needs steering",
            snapshot.folder, snapshot.id
        ),
    )
}
