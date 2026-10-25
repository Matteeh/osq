//! The `plan <id>` command: write a steered change's prompt and hand it off.

pub(crate) mod lookup;
mod prompt;
mod requirements;
mod triggers;

use std::path::Path;

use osq_core::{FeatureError, parse_change_id};
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
pub(crate) fn run_steer(root: &Path, id: &str, print: bool) -> Result<String, FeatureError> {
    let (config, git_root, found) = lookup::candidates(root)?;
    if let Some(found) = found.iter().find(|found| active(found, id)) {
        return steer(root, &config, found, id, print);
    }
    if git_root.is_some() {
        return steer_archived(root, &config, &found, id, print);
    }
    Err(nothing(id))
}

/// Steers an active change, or refuses it for having no trigger.
///
/// Implements: rust-plan/steering-lookup
fn steer(
    root: &Path,
    config: &Config,
    found: &Found,
    id: &str,
    print: bool,
) -> Result<String, FeatureError> {
    let snapshot = read(found)?;
    let triggers = triggers::derive(&snapshot);
    if triggers.is_empty() {
        return Err(if found.named {
            approved(&snapshot)
        } else {
            nothing(id)
        });
    }
    finish(root, config, found, &snapshot, &triggers, id, print)
}

/// Steers the first archived change in a naming tree that needs steering.
///
/// Implements: rust-plan/steering-lookup
fn steer_archived(
    root: &Path,
    config: &Config,
    found: &[Found],
    id: &str,
    print: bool,
) -> Result<String, FeatureError> {
    for found in found.iter().filter(|found| archived(found, id)) {
        let snapshot = read(found)?;
        let triggers = triggers::derive(&snapshot);
        if !triggers.is_empty() {
            return finish(root, config, found, &snapshot, &triggers, id, print);
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
    print: bool,
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
    if print {
        return Ok(format!("{text}\n"));
    }
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

/// Builds the refusal for an id that names no change needing steering, or the
/// error for an id core refuses.
///
/// Implements: rust-plan/steering-lookup
fn nothing(id: &str) -> FeatureError {
    match parse_change_id(id, false) {
        Ok(_) => FeatureError::failed(
            "plan",
            format!(
                "No active change matching \"{id}\" needs steering; Rust osq plan {id} steers a change only."
            ),
        ),
        Err(error) => FeatureError::failed("plan", error.to_string()),
    }
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
