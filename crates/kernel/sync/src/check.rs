//! Step 1: refusing requirements the default branch changed under the change.

use std::fs;
use std::path::Path;

use osq_core::event::SyncStopReason;
use osq_kernel_specs::{Delta, LivingSpec, parse_delta, parse_living_spec};
use osq_kernel_vcs::{GitVcs, Vcs, VcsError};

use super::{stop::Stop, text};

/// One requirement the change rewrites whose text the default branch moved.
struct Changed {
    /// The capability folder.
    capability: String,
    /// The requirement's normalized name.
    requirement: String,
}

/// Refuses the sync when a rewritten requirement differs from its base.
///
/// # Errors
///
/// Returns a `VcsError` when a git read fails.
///
/// Implements: rust-land/land-sync
pub(crate) fn run(
    vcs: &GitVcs,
    archived: &Path,
    default_branch: &str,
) -> Result<Option<Stop>, VcsError> {
    let base = requirements_base(archived);
    let changed = changed(vcs, archived, base.as_deref(), default_branch)?;
    if changed.is_empty() {
        return Ok(None);
    }
    let pairs: Vec<(String, String)> = changed
        .into_iter()
        .map(|entry| (entry.capability, entry.requirement))
        .collect();
    let message = text::requirements_changed(&folder_name(archived), default_branch, &pairs);
    Ok(Some(Stop::new(SyncStopReason::RequirementChanged, message)))
}

/// The requirements base: `.run/requirements-base`, else `.run/base`, else none.
///
/// Implements: rust-land/land-sync
fn requirements_base(archived: &Path) -> Option<String> {
    marker(&archived.join(".run/requirements-base")).or_else(|| marker(&archived.join(".run/base")))
}

/// One marker's trimmed text, or none when it is absent or blank.
///
/// Implements: rust-land/land-sync
fn marker(path: &Path) -> Option<String> {
    let text = fs::read_to_string(path).ok()?;
    let trimmed = text.trim();
    (!trimmed.is_empty()).then(|| trimmed.to_owned())
}

/// Every rewritten requirement whose raw text differs from the base.
///
/// Implements: rust-land/land-sync
fn changed(
    vcs: &GitVcs,
    archived: &Path,
    base: Option<&str>,
    default_branch: &str,
) -> Result<Vec<Changed>, VcsError> {
    let mut changed = Vec::new();
    for capability in capabilities(archived) {
        let Some(delta) = delta(archived, &capability) else {
            continue;
        };
        let names = rewritable_names(&delta);
        if names.is_empty() {
            continue;
        }
        let relative = format!("openspec/specs/{capability}/spec.md");
        let base_spec = side(vcs, base, &relative)?;
        let current = side(vcs, Some(default_branch), &relative)?;
        for name in names {
            if raw(base_spec.as_ref(), &name) != raw(current.as_ref(), &name) {
                changed.push(Changed {
                    capability: capability.clone(),
                    requirement: name,
                });
            }
        }
    }
    Ok(changed)
}

/// The names a delta rewrites, in their required order.
///
/// Implements: rust-land/land-sync
fn rewritable_names(delta: &Delta) -> Vec<String> {
    let mut names: Vec<String> = delta
        .modified
        .iter()
        .map(|requirement| requirement.name.clone())
        .collect();
    names.extend(delta.removed.iter().cloned());
    names.extend(delta.renamed.iter().map(|rename| rename.from.clone()));
    names
}

/// The capability folders directly under the archived folder's `specs/`.
///
/// Implements: rust-land/land-sync
fn capabilities(archived: &Path) -> Vec<String> {
    let Ok(entries) = fs::read_dir(archived.join("specs")) else {
        return Vec::new();
    };
    let mut names: Vec<String> = entries
        .flatten()
        .filter(|entry| entry.file_type().is_ok_and(|kind| kind.is_dir()))
        .filter(|entry| entry.path().join("spec.md").is_file())
        .filter_map(|entry| entry.file_name().into_string().ok())
        .collect();
    names.sort();
    names
}

/// One capability's parsed delta, or none when it cannot be read.
///
/// Implements: rust-land/land-sync
fn delta(archived: &Path, capability: &str) -> Option<Delta> {
    let text = fs::read_to_string(archived.join("specs").join(capability).join("spec.md")).ok()?;
    Some(parse_delta(&text))
}

/// One side's parsed living spec, or none when that rev has no such file.
///
/// Implements: rust-land/land-sync
fn side(vcs: &GitVcs, rev: Option<&str>, relative: &str) -> Result<Option<LivingSpec>, VcsError> {
    let Some(rev) = rev else {
        return Ok(None);
    };
    Ok(vcs
        .show(rev, relative)?
        .map(|text| parse_living_spec(&text)))
}

/// One requirement's raw text, or none when the spec lacks it.
///
/// Implements: rust-land/land-sync
fn raw<'a>(spec: Option<&'a LivingSpec>, name: &str) -> Option<&'a str> {
    spec?
        .requirements
        .iter()
        .find(|requirement| requirement.name == name)
        .map(|requirement| requirement.raw.as_str())
}

/// The archived path's folder name, for the stop message.
///
/// Implements: rust-land/land-sync
fn folder_name(archived: &Path) -> String {
    archived
        .file_name()
        .map(|name| name.to_string_lossy().into_owned())
        .unwrap_or_default()
}
